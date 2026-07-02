// Prueba de carga: simula 10 pedidos concurrentes contra la BD real para
// validar empíricamente los guards de concurrencia documentados en
// ENGRAM 2026-05-05 (markTokenUsed atómico, needs_proof, optimistic locking)
// y medir el comportamiento bajo carga.
//
// Standalone: replica el SQL de createOrder/transitionOrder inline porque
// los archivos del proyecto tienen `import "server-only"` y no se pueden
// cargar desde un script Bun. El test cubre el surface real (SQL + atomic
// constraints), no las funciones JS que lo envuelven — la concurrencia
// vive en Postgres.
//
// Uso:
//   bun run loadtest all          → todos los escenarios + cleanup
//   bun run loadtest scenarioA    → 10 phones distintos (carga real)
//   bun run loadtest scenarioB    → 10 submits del mismo token
//   bun run loadtest scenarioC    → 10 pedidos del mismo phone sin proof
//   bun run loadtest scenarioD    → 2 transiciones concurrentes
//   bun run loadtest cleanup      → solo limpia datos de test previos
//
// Marker de cleanup: phone con prefijo `+573000000` + nota `[LOAD-TEST]`.

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// ─── Config y validación de env ────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local",
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TEST_PHONE_PREFIX = "+573000000";
const TEST_NOTE_MARKER = "[LOAD-TEST]";
const TOKEN_TTL_MIN = 60;

// ─── Helpers de signing/firma (replica src/features/order-tokens/sign.ts) ─

function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

interface SignedToken {
  token: string;
  tokenId: string;
  expiresAt: string;
}

async function signTokenForCustomer(customerId: string): Promise<SignedToken> {
  const id = randomUUID();
  const token = toBase64Url(randomBytes(9)); // 12 chars URL-safe
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60_000).toISOString();

  const { error } = await admin.from("order_tokens").insert({
    id,
    token_hash: tokenHash,
    customer_id: customerId,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`signToken failed: ${error.message}`);

  return { token, tokenId: id, expiresAt };
}

// ─── Helpers de fixtures ──────────────────────────────────────────

interface ProductFixture {
  productId: string;
  size: "personal" | "pequena" | "mediana" | "grande" | "familiar";
  priceCents: number;
}

let productFixtureCache: ProductFixture | null = null;

async function pickAnyActiveProduct(): Promise<ProductFixture> {
  if (productFixtureCache) return productFixtureCache;

  const { data: products, error: prodErr } = await admin
    .from("products")
    .select("id")
    .eq("active", true)
    .limit(1);
  if (prodErr) throw new Error(`pickProduct/products: ${prodErr.message}`);
  if (!products || products.length === 0) {
    throw new Error(
      "No hay productos activos en la BD. Corre el seed antes de la prueba.",
    );
  }
  const productId = (products[0] as { id: string }).id;

  const { data: sizes, error: sizesErr } = await admin
    .from("product_sizes")
    .select("size, price_cents")
    .eq("product_id", productId)
    .order("price_cents", { ascending: true })
    .limit(1);
  if (sizesErr) throw new Error(`pickProduct/sizes: ${sizesErr.message}`);
  if (!sizes || sizes.length === 0) {
    throw new Error(
      `Producto ${productId} no tiene product_sizes configurados.`,
    );
  }
  const row = sizes[0] as { size: ProductFixture["size"]; price_cents: number };

  productFixtureCache = {
    productId,
    size: row.size,
    priceCents: row.price_cents,
  };
  return productFixtureCache;
}

async function createTestCustomer(slot: number): Promise<string> {
  // +573000000 + 3 dígitos = 13 chars, formato Colombia válido para tests.
  const phone = `${TEST_PHONE_PREFIX}${String(slot).padStart(3, "0")}`;
  const name = `LoadTest ${slot}`;

  // Idempotente: si quedó un customer de un run anterior, lo reusa.
  const { data: existing } = await admin
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: inserted, error } = await admin
    .from("customers")
    .insert({ phone, name })
    .select("id")
    .single();
  if (error) throw new Error(`createTestCustomer: ${error.message}`);
  return (inserted as { id: string }).id;
}

// ─── Replica de createOrder (versión load-test) ────────────────────
//
// Hace exactamente lo mismo que src/features/orders/actions.ts createOrder
// pero sin Zod (input ya es typed) y sin verifyToken (el script firmó el
// token y conoce el tokenId/customerId). Mantiene los 3 guards atómicos:
//   1. Pending-proof check (needs_proof=true activo del customer)
//   2. markTokenUsed atómico (.is("used_at", null))
//   3. Cascade INSERT (orders → addresses → items → events)

interface CreateOrderInput {
  tokenId: string;
  customerId: string;
  customerName: string;
  paymentMethod: "cash" | "bancolombia" | "nequi" | "llave";
  hasProof: boolean;
  product: ProductFixture;
}

interface CreateOrderResult {
  ok: boolean;
  orderId?: string;
  error?: string;
}

async function createOrderEmulated(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  // Guard 1: needs_proof activo bloquea segundo pedido del mismo customer.
  const { data: pending, error: pendingErr } = await admin
    .from("orders")
    .select("id")
    .eq("customer_id", input.customerId)
    .eq("needs_proof", true)
    .not("status", "in", "(delivered,cancelled)")
    .limit(1);
  if (pendingErr) return { ok: false, error: `pending-check: ${pendingErr.message}` };
  if (pending && pending.length > 0) {
    return {
      ok: false,
      error: "Tienes un pedido pendiente de comprobante. Mándalo por WhatsApp y vuelve a intentar.",
    };
  }

  // Guard 2: markTokenUsed atómico. Si OTRA request concurrente ya marcó
  // el token, affected_rows === 0 → abortar sin crear pedido.
  const { data: marked, error: markErr } = await admin
    .from("order_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", input.tokenId)
    .is("used_at", null)
    .select("id");
  if (markErr) return { ok: false, error: `markToken: ${markErr.message}` };
  if (!marked || marked.length === 0) {
    return { ok: false, error: "Este enlace ya fue usado. Pide un nuevo link por WhatsApp." };
  }

  // Cascade INSERT (la falta de transacción es deuda L01-A documentada).
  try {
    const { data: addrRow, error: addrErr } = await admin
      .from("addresses")
      .insert({
        customer_id: input.customerId,
        street: "Cll 63b # 105-95",
        neighborhood: "LoadTest Zone",
      })
      .select("id")
      .single();
    if (addrErr) throw addrErr;
    const addressId = (addrRow as { id: string }).id;

    const isCash = input.paymentMethod === "cash";
    const status = isCash
      ? "preparing"
      : "awaiting_payment";
    const needsProof = !isCash && !input.hasProof;
    // ETA lejano para que pg_cron de retraso NO marque estos pedidos como
    // delayed durante el run.
    const etaAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();

    const { data: orderRow, error: orderErr } = await admin
      .from("orders")
      .insert({
        customer_id: input.customerId,
        customer_name: input.customerName,
        address_id: addressId,
        status,
        total_cents: input.product.priceCents,
        payment_method: input.paymentMethod,
        payment_proof_url: input.hasProof ? "loadtest://fake-proof" : null,
        needs_proof: needsProof,
        payment_proof_source: input.hasProof ? "web" : null,
        eta_at: etaAt,
        notes: TEST_NOTE_MARKER,
      })
      .select("id")
      .single();
    if (orderErr) throw orderErr;
    const orderId = (orderRow as { id: string }).id;

    const { error: itemsErr } = await admin.from("order_items").insert({
      order_id: orderId,
      product_id: input.product.productId,
      size: input.product.size,
      qty: 1,
      unit_price_cents: input.product.priceCents,
      flavors: null,
      notes: null,
    });
    if (itemsErr) throw itemsErr;

    const { error: evErr } = await admin.from("order_status_events").insert({
      order_id: orderId,
      from_status: null,
      to_status: status,
      actor_id: null,
    });
    if (evErr) throw evErr;

    return { ok: true, orderId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `cascade: ${msg}` };
  }
}

// ─── Replica del UPDATE con guard de status (transitionOrder) ──────
//
// Solo testea el guard atómico optimista: UPDATE con .eq(status, currentStatus).
// Si otra request cambió el estado entre el read y este UPDATE, affected_rows=0.

async function transitionOrderEmulated(
  orderId: string,
  fromStatus: string,
  toStatus: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await admin
    .from("orders")
    .update({ status: toStatus })
    .eq("id", orderId)
    .eq("status", fromStatus)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return {
      ok: false,
      error:
        "El pedido cambió de estado mientras lo actualizabas. Recarga para ver el estado actual.",
    };
  }

  // Igual que transitionOrder real: registrar el evento.
  const { error: evErr } = await admin.from("order_status_events").insert({
    order_id: orderId,
    from_status: fromStatus,
    to_status: toStatus,
    actor_id: null,
  });
  if (evErr) return { ok: false, error: `event-insert: ${evErr.message}` };

  return { ok: true };
}

// ─── Reporter ──────────────────────────────────────────────────────

interface RunResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
  orderId?: string;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx]!;
}

function bucketErrors(results: RunResult[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of results) {
    if (!r.ok && r.error) {
      const key = r.error.split(".")[0]!.slice(0, 80);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return map;
}

function printResults(name: string, totalMs: number, results: RunResult[]): void {
  const success = results.filter((r) => r.ok).length;
  const failure = results.length - success;
  const sorted = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const errs = bucketErrors(results);

  console.log("");
  console.log("═".repeat(60));
  console.log(`${name}`);
  console.log("═".repeat(60));
  console.log(`Total time:    ${totalMs}ms`);
  console.log(`Success:       ${success}/${results.length}`);
  console.log(`Failure:       ${failure}/${results.length}`);
  console.log(
    `Latency p50/p95/p99:  ${percentile(sorted, 50)}ms / ${percentile(sorted, 95)}ms / ${percentile(sorted, 99)}ms`,
  );
  if (errs.size > 0) {
    console.log("Errors breakdown:");
    for (const [err, count] of errs.entries()) {
      console.log(`  · "${err}": ${count}`);
    }
  }
}

async function timeIt(fn: () => Promise<RunResult>): Promise<RunResult> {
  const t0 = Date.now();
  try {
    const r = await fn();
    return { ...r, latencyMs: Date.now() - t0 };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Escenario A: 10 phones distintos (carga real) ─────────────────

async function scenarioA(): Promise<void> {
  const product = await pickAnyActiveProduct();

  // Setup secuencial: 10 customers + 10 tokens.
  const setups: { tokenId: string; token: string; customerId: string; name: string }[] = [];
  for (let i = 0; i < 10; i++) {
    const customerId = await createTestCustomer(i);
    const signed = await signTokenForCustomer(customerId);
    setups.push({
      tokenId: signed.tokenId,
      token: signed.token,
      customerId,
      name: `LoadTest ${i}`,
    });
  }

  // Disparo 10 createOrder en paralelo. cash → entra directo a preparing.
  const t0 = Date.now();
  const results = await Promise.all(
    setups.map((s) =>
      timeIt(async () => {
        const r = await createOrderEmulated({
          tokenId: s.tokenId,
          customerId: s.customerId,
          customerName: s.name,
          paymentMethod: "cash",
          hasProof: false,
          product,
        });
        return { ok: r.ok, latencyMs: 0, error: r.error, orderId: r.orderId };
      }),
    ),
  );
  const totalMs = Date.now() - t0;

  printResults("SCENARIO A — 10 phones distintos (carga real)", totalMs, results);

  // Verificación contra DB.
  const phoneList = setups.map((_, i) => `${TEST_PHONE_PREFIX}${String(i).padStart(3, "0")}`);
  const { data: rows, error } = await admin
    .from("orders")
    .select("id, customer_id")
    .in(
      "customer_id",
      setups.map((s) => s.customerId),
    )
    .eq("notes", TEST_NOTE_MARKER);
  if (error) {
    console.log(`⚠ verify failed: ${error.message}`);
    return;
  }
  console.log(`Orders en DB con notes='${TEST_NOTE_MARKER}': ${rows?.length ?? 0} (esperado: 10)`);
  console.log(`Phones marker:  ${phoneList[0]} … ${phoneList[9]}`);
}

// ─── Escenario B: 10 submits del MISMO token (doble-submit) ────────

async function scenarioB(): Promise<void> {
  const product = await pickAnyActiveProduct();

  // 1 customer (slot 100 reservado para B), 1 token compartido.
  const customerId = await createTestCustomer(100);
  const { tokenId } = await signTokenForCustomer(customerId);

  const t0 = Date.now();
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      timeIt(async () => {
        const r = await createOrderEmulated({
          tokenId,
          customerId,
          customerName: "LoadTest 100",
          paymentMethod: "cash",
          hasProof: false,
          product,
        });
        return { ok: r.ok, latencyMs: 0, error: r.error, orderId: r.orderId };
      }),
    ),
  );
  const totalMs = Date.now() - t0;

  printResults(
    "SCENARIO B — Same token x10 (double-submit)",
    totalMs,
    results,
  );

  const success = results.filter((r) => r.ok).length;
  const guardPassed = success === 1;
  console.log(
    `GUARD markTokenUsed atomic:  ${guardPassed ? "✓ PASSED" : "✗ FAILED"} (${success}/10 success, esperado: 1/10)`,
  );

  // Verificación: solo 1 order en DB para este customer.
  const { data: rows } = await admin
    .from("orders")
    .select("id")
    .eq("customer_id", customerId)
    .eq("notes", TEST_NOTE_MARKER);
  console.log(`Orders en DB del customer: ${rows?.length ?? 0} (esperado: 1)`);
}

// ─── Escenario C: 10 pedidos del MISMO phone sin proof (needs_proof) ──

async function scenarioC(): Promise<void> {
  const product = await pickAnyActiveProduct();

  // 1 customer (slot 200), 10 tokens diferentes — todos válidos.
  const customerId = await createTestCustomer(200);
  const tokens = await Promise.all(
    Array.from({ length: 10 }, () => signTokenForCustomer(customerId)),
  );

  const t0 = Date.now();
  const results = await Promise.all(
    tokens.map((t) =>
      timeIt(async () => {
        const r = await createOrderEmulated({
          tokenId: t.tokenId,
          customerId,
          customerName: "LoadTest 200",
          paymentMethod: "bancolombia",
          hasProof: false, // → needs_proof=true en el insert
          product,
        });
        return { ok: r.ok, latencyMs: 0, error: r.error, orderId: r.orderId };
      }),
    ),
  );
  const totalMs = Date.now() - t0;

  printResults(
    "SCENARIO C — Same phone x10 sin proof (needs_proof guard)",
    totalMs,
    results,
  );

  // Importante: en createOrder el guard NO es atómico contra requests
  // simultáneos — el SELECT de pending-proofs y el INSERT son ops
  // separadas. Si los 10 requests pasan el SELECT antes de que ninguno
  // haga el INSERT, los 10 crean pedidos con needs_proof=true. Eso NO
  // es bug operativo (un cliente real hace clicks secuenciales, no
  // paralelos), pero el load test va a destapar el comportamiento.
  // Documentamos lo que sale, sin afirmar "expected = 1".
  const success = results.filter((r) => r.ok).length;
  const { data: rows } = await admin
    .from("orders")
    .select("id, needs_proof")
    .eq("customer_id", customerId)
    .eq("notes", TEST_NOTE_MARKER);
  const needsProofCount = (rows ?? []).filter(
    (r) => (r as { needs_proof: boolean }).needs_proof,
  ).length;
  console.log(
    `Orders en DB con needs_proof=true: ${needsProofCount} (success calls: ${success})`,
  );
  if (success === 1) {
    console.log("GUARD needs_proof secuencial:  ✓ PASSED (1/10 success)");
  } else if (success === 10) {
    console.log(
      "GUARD needs_proof secuencial:  ✗ NO ATÓMICO bajo concurrencia (10/10 success).",
    );
    console.log(
      "   El SELECT de pending-proofs y el INSERT no están en transacción.",
    );
    console.log(
      "   Para clicks secuenciales del cliente real el guard funciona.",
    );
  } else {
    console.log(
      `GUARD needs_proof secuencial:  ⚠ resultado mixto (${success}/10 success)`,
    );
  }
}

// ─── Escenario D: 2 transitionOrder concurrentes (optimistic lock) ──

async function scenarioD(): Promise<void> {
  const product = await pickAnyActiveProduct();

  // Crear 1 pedido en preparing (cash → preparing directo).
  const customerId = await createTestCustomer(300);
  const { tokenId } = await signTokenForCustomer(customerId);
  const created = await createOrderEmulated({
    tokenId,
    customerId,
    customerName: "LoadTest 300",
    paymentMethod: "cash",
    hasProof: false,
    product,
  });
  if (!created.ok || !created.orderId) {
    console.log(`SCENARIO D setup failed: ${created.error ?? "unknown"}`);
    return;
  }
  const orderId = created.orderId;

  // 2 transiciones preparing → ready en paralelo.
  const t0 = Date.now();
  const results = await Promise.all(
    [0, 1].map(() =>
      timeIt(async () => {
        const r = await transitionOrderEmulated(orderId, "preparing", "ready");
        return { ok: r.ok, latencyMs: 0, error: r.error };
      }),
    ),
  );
  const totalMs = Date.now() - t0;

  printResults(
    "SCENARIO D — 2 transitionOrder concurrentes (optimistic lock)",
    totalMs,
    results,
  );

  const success = results.filter((r) => r.ok).length;
  const guardPassed = success === 1;
  console.log(
    `GUARD optimistic lock (.eq status):  ${guardPassed ? "✓ PASSED" : "✗ FAILED"} (${success}/2 success, esperado: 1/2)`,
  );

  // Verificación: exactamente 2 eventos (initial preparing + 1 ready).
  const { data: events } = await admin
    .from("order_status_events")
    .select("to_status")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  console.log(
    `order_status_events del pedido: ${events?.length ?? 0} (esperado: 2 — initial + 1 ready)`,
  );
}

// ─── Cleanup ───────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  console.log("\nCleanup en curso…");

  // 1. Recoger los customer_ids de prueba (phones con prefijo).
  const { data: customers, error: custErr } = await admin
    .from("customers")
    .select("id")
    .like("phone", `${TEST_PHONE_PREFIX}%`);
  if (custErr) {
    console.log(`✗ cleanup customers SELECT: ${custErr.message}`);
    return;
  }
  const customerIds = (customers ?? []).map((c) => (c as { id: string }).id);
  if (customerIds.length === 0) {
    console.log("Nada que limpiar (cero customers de prueba).");
    return;
  }

  // 2. Recoger los order_ids derivados de esos customers.
  const { data: orders } = await admin
    .from("orders")
    .select("id")
    .in("customer_id", customerIds);
  const orderIds = (orders ?? []).map((o) => (o as { id: string }).id);

  // 3. ON DELETE CASCADE va a hacer la mayoría del trabajo (orders →
  //    order_items, addresses → si el FK lo cubre). Borramos en el orden
  //    seguro por si algo no tiene CASCADE.
  let counts = {
    events: 0,
    items: 0,
    orders: 0,
    addresses: 0,
    tokens: 0,
    customers: 0,
  };

  if (orderIds.length > 0) {
    const { count: ec } = await admin
      .from("order_status_events")
      .delete({ count: "exact" })
      .in("order_id", orderIds);
    counts.events = ec ?? 0;

    const { count: ic } = await admin
      .from("order_items")
      .delete({ count: "exact" })
      .in("order_id", orderIds);
    counts.items = ic ?? 0;

    const { count: oc } = await admin
      .from("orders")
      .delete({ count: "exact" })
      .in("id", orderIds);
    counts.orders = oc ?? 0;
  }

  const { count: ac } = await admin
    .from("addresses")
    .delete({ count: "exact" })
    .in("customer_id", customerIds);
  counts.addresses = ac ?? 0;

  const { count: tc } = await admin
    .from("order_tokens")
    .delete({ count: "exact" })
    .in("customer_id", customerIds);
  counts.tokens = tc ?? 0;

  const { count: cc } = await admin
    .from("customers")
    .delete({ count: "exact" })
    .in("id", customerIds);
  counts.customers = cc ?? 0;

  console.log(
    `✓ Eliminados: ${counts.events} events, ${counts.items} items, ${counts.orders} orders, ${counts.addresses} addresses, ${counts.tokens} tokens, ${counts.customers} customers`,
  );
}

// ─── CLI ───────────────────────────────────────────────────────────

const cmd = process.argv[2] ?? "help";

console.log(`Connected to Supabase: ${SUPABASE_URL}`);
console.log(`Marker: phone='${TEST_PHONE_PREFIX}*' / notes='${TEST_NOTE_MARKER}'`);
console.log("");

try {
  switch (cmd) {
    case "all":
      await cleanup();
      await scenarioA();
      await cleanup();
      await scenarioB();
      await cleanup();
      await scenarioC();
      await cleanup();
      await scenarioD();
      await cleanup();
      break;
    case "scenarioA":
      await scenarioA();
      break;
    case "scenarioB":
      await scenarioB();
      break;
    case "scenarioC":
      await scenarioC();
      break;
    case "scenarioD":
      await scenarioD();
      break;
    case "cleanup":
      await cleanup();
      break;
    default:
      console.log("Uso: bun run loadtest <all|scenarioA|scenarioB|scenarioC|scenarioD|cleanup>");
      process.exit(1);
  }
  console.log("\nDone.");
  process.exit(0);
} catch (err) {
  console.error("\n✗ Script crashed:", err);
  console.error("Corre 'bun run loadtest cleanup' para limpiar manualmente.");
  process.exit(1);
}
