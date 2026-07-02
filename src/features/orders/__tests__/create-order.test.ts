import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks hoisted: ver caveat técnico en docs/audit/deuda-tecnica.md D04
// (usar resetAllMocks porque clearAllMocks NO limpia el queue de
// mockResolvedValueOnce y se filtra entre tests).
const mocks = vi.hoisted(() => ({
  verifyTokenMock: vi.fn(),
  markTokenUsedMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/features/order-tokens/verify", () => ({
  verifyToken: mocks.verifyTokenMock,
}));

vi.mock("@/features/order-tokens/mark-used", () => ({
  markTokenUsed: mocks.markTokenUsedMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: mocks.fromMock },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createOrder } from "../actions";

// UUIDs v4 válidos (Zod 4 valida el nibble v4).
const CUSTOMER_ID = "abcdef01-2345-4678-89ab-cdef01234567";
const TOKEN_ID = "abcdef01-2345-4678-89ab-cdef01234568";
const ADDRESS_ID = "abcdef01-2345-4678-89ab-cdef01234569";
const ORDER_ID = "abcdef01-2345-4678-89ab-cdef0123456a";
const PRODUCT_ID = "abcdef01-2345-4678-89ab-cdef0123456b";

interface CreateOrderInput {
  token: string;
  customerName: string;
  addressInput: { street: string; zone?: string };
  items: { productId: string; size: string; qty: number; flavors?: string[] }[];
  paymentMethod: "cash" | "bancolombia" | "nequi" | "llave";
  paymentProofPath?: string;
  notes?: string;
}

function buildInput(overrides: Partial<CreateOrderInput> = {}): unknown {
  return {
    token: "stubbed.signature.token",
    customerName: "Test Cliente",
    addressInput: { street: "Cll 64 # 105-95" },
    items: [{ productId: PRODUCT_ID, size: "mediana", qty: 1 }],
    paymentMethod: "cash",
    ...overrides,
  };
}

// Captura los payloads de cada INSERT crítico para que los tests verifiquen
// la forma exacta de lo que se manda a DB.
const captures: {
  orderInsert: Record<string, unknown> | null;
  itemsInsert: unknown;
  eventInsert: Record<string, unknown> | null;
} = { orderInsert: null, itemsInsert: null, eventInsert: null };

function setupSupabaseHappyPath() {
  captures.orderInsert = null;
  captures.itemsInsert = null;
  captures.eventInsert = null;

  mocks.fromMock.mockImplementation((table: string) => {
    switch (table) {
      case "customers":
        return {
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      case "addresses":
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: { id: ADDRESS_ID }, error: null }),
            }),
          }),
        };
      case "product_sizes":
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [
                  {
                    product_id: PRODUCT_ID,
                    size: "mediana",
                    price_cents: 42000,
                  },
                ],
                error: null,
              }),
          }),
        };
      case "products":
        return {
          select: () => ({
            in: () => ({
              eq: () =>
                Promise.resolve({
                  data: [
                    {
                      id: PRODUCT_ID,
                      max_flavors: 1,
                      min_size_for_multiflavor: null,
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        };
      case "settings":
        return {
          select: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { delivery_zones: [{ zone: "A", eta_min: 30 }] },
                error: null,
              }),
          }),
        };
      case "orders":
        return {
          insert: (payload: Record<string, unknown>) => {
            captures.orderInsert = payload;
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({ data: { id: ORDER_ID }, error: null }),
              }),
            };
          },
        };
      case "order_items":
        return {
          insert: (payload: unknown) => {
            captures.itemsInsert = payload;
            return Promise.resolve({ error: null });
          },
        };
      case "order_status_events":
        return {
          insert: (payload: Record<string, unknown>) => {
            captures.eventInsert = payload;
            return Promise.resolve({ error: null });
          },
        };
      default:
        return {};
    }
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  // Defaults: token válido, mark-used OK, supabase happy path. Cada test
  // sobreescribe lo que necesite cambiar.
  mocks.verifyTokenMock.mockResolvedValue({
    ok: true,
    customerId: CUSTOMER_ID,
    tokenId: TOKEN_ID,
  });
  mocks.markTokenUsedMock.mockResolvedValue(undefined);
  setupSupabaseHappyPath();
});

describe("createOrder · happy paths", () => {
  it("cash → status='preparing', sin proof, source null", async () => {
    const res = await createOrder(buildInput({ paymentMethod: "cash" }));
    expect(res).toEqual({ ok: true, data: { orderId: ORDER_ID } });

    expect(captures.orderInsert).toMatchObject({
      customer_id: CUSTOMER_ID,
      customer_name: "Test Cliente",
      status: "preparing",
      total_cents: 42000,
      payment_method: "cash",
      payment_proof_url: null,
      needs_proof: false,
      payment_proof_source: null,
    });

    // L01: el token se marca usado al inicio (no al final).
    expect(mocks.markTokenUsedMock).toHaveBeenCalledWith(TOKEN_ID);
    // El status_events del INSERT inicial es null → status (sin actor).
    expect(captures.eventInsert).toMatchObject({
      from_status: null,
      to_status: "preparing",
      actor_id: null,
    });
  });

  it("transferencia con proof → awaiting_payment, source='web'", async () => {
    const res = await createOrder(
      buildInput({
        paymentMethod: "bancolombia",
        paymentProofPath: "pending/abc/proof.jpg",
      }),
    );
    expect(res).toEqual({ ok: true, data: { orderId: ORDER_ID } });

    expect(captures.orderInsert).toMatchObject({
      status: "awaiting_payment",
      payment_method: "bancolombia",
      payment_proof_url: "pending/abc/proof.jpg",
      needs_proof: false,
      payment_proof_source: "web",
    });
  });

  it("transferencia sin proof → awaiting_payment, needs_proof=true, source null", async () => {
    const res = await createOrder(buildInput({ paymentMethod: "nequi" }));
    expect(res).toEqual({ ok: true, data: { orderId: ORDER_ID } });

    expect(captures.orderInsert).toMatchObject({
      status: "awaiting_payment",
      payment_method: "nequi",
      payment_proof_url: null,
      needs_proof: true,
      payment_proof_source: null,
    });
  });
});

describe("createOrder · guardas tempranas", () => {
  it("L01: si markTokenUsed falla, NO ejecuta la cascada", async () => {
    mocks.markTokenUsedMock.mockRejectedValueOnce(new Error("DB down"));

    const res = await createOrder(buildInput());
    expect(res).toEqual({
      ok: false,
      error: "No pudimos crear tu pedido. Pide un nuevo link por WhatsApp.",
    });

    // Crítico: la cascada NO se ejecutó tras el fallo de markTokenUsed.
    expect(mocks.fromMock).not.toHaveBeenCalled();
    expect(captures.orderInsert).toBeNull();
  });

  it("token expirado → mensaje específico, no marca usado, no toca DB", async () => {
    mocks.verifyTokenMock.mockResolvedValueOnce({
      ok: false,
      reason: "expired",
    });

    const res = await createOrder(buildInput());
    expect(res).toEqual({
      ok: false,
      error: "El enlace expiró. Pide uno nuevo por WhatsApp.",
    });

    expect(mocks.markTokenUsedMock).not.toHaveBeenCalled();
    expect(mocks.fromMock).not.toHaveBeenCalled();
  });

  it("input inválido (Zod) → 'Datos inválidos', no toca nada", async () => {
    const res = await createOrder({ token: "x", items: [] });
    expect(res).toEqual({ ok: false, error: "Datos inválidos" });

    expect(mocks.verifyTokenMock).not.toHaveBeenCalled();
    expect(mocks.markTokenUsedMock).not.toHaveBeenCalled();
    expect(mocks.fromMock).not.toHaveBeenCalled();
  });
});
