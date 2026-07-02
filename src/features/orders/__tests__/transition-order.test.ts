import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentStaff } from "@/features/auth/queries";
import type { OrderStatus } from "../types";

// Hoisted mocks: vitest hoists `vi.mock` por sobre los imports, entonces
// todo lo que la fábrica del mock necesite tiene que estar dentro de
// `vi.hoisted` para que esté disponible en ese momento. Ver L02 en
// docs/audit/logica.md y D04 en docs/audit/deuda-tecnica.md.
const mocks = vi.hoisted(() => {
  const orderState: {
    status: string;
    needs_proof: boolean;
    payment_proof_url: string | null;
    driver_id: string | null;
  } = {
    status: "awaiting_payment",
    needs_proof: false,
    payment_proof_url: "https://example.com/proof.png",
    driver_id: null,
  };
  const fromMock = vi.fn();
  const assertStaffRoleMock = vi.fn();
  const sendOrderUpdateMock = vi.fn();
  return { orderState, fromMock, assertStaffRoleMock, sendOrderUpdateMock };
});

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: mocks.fromMock },
}));

vi.mock("@/features/auth/guards", () => ({
  assertStaffRole: mocks.assertStaffRoleMock,
}));

vi.mock("@/features/notifications/send-order-update", () => ({
  sendOrderUpdate: mocks.sendOrderUpdateMock,
  sendOrderDelayApology: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { transitionOrder } from "../actions";

// Stub builder: recrea la cadena .select().eq().maybeSingle() con los
// valores que cada test configure.
function setupSupabaseChain() {
  const updateChain = {
    eq: vi.fn().mockResolvedValue({ error: null }),
  };
  const selectChain = {
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: mocks.orderState, error: null }),
    }),
  };
  const insertChain = vi.fn().mockResolvedValue({ error: null });

  mocks.fromMock.mockImplementation((table: string) => {
    if (table === "orders") {
      return {
        select: vi.fn().mockReturnValue(selectChain),
        update: vi.fn().mockReturnValue(updateChain),
      };
    }
    if (table === "order_status_events") {
      return { insert: insertChain };
    }
    return {};
  });
}

// UUIDs v4 válidos (Zod 4 valida el nibble v4 en posición 13).
const VALID_ORDER_ID = "abcdef01-2345-4678-89ab-cdef01234567";
const DRIVER_A_ID = "abcdef01-2345-4678-89ab-cdef0123456a";
const DRIVER_B_ID = "abcdef01-2345-4678-89ab-cdef0123456b";

function staff(role: CurrentStaff["role"], id = "staff-1"): CurrentStaff {
  return {
    id,
    email: `${role}@test.local`,
    role,
    displayName: role,
  };
}

function authOk(role: CurrentStaff["role"], id?: string) {
  mocks.assertStaffRoleMock.mockResolvedValueOnce({
    ok: true,
    staff: staff(role, id),
  });
}

beforeEach(() => {
  // resetAllMocks limpia tanto el call history como el queue de
  // mockResolvedValueOnce y las implementaciones. clearAllMocks NO
  // limpia el queue, lo cual causaba leaks entre tests cuando un test
  // early-retornaba sin consumir el mock.
  vi.resetAllMocks();
  // Reset al estado por defecto del pedido.
  mocks.orderState.status = "awaiting_payment";
  mocks.orderState.needs_proof = false;
  mocks.orderState.payment_proof_url = "https://example.com/proof.png";
  mocks.orderState.driver_id = null;
  mocks.sendOrderUpdateMock.mockResolvedValue({ ok: true });
  setupSupabaseChain();
});

describe("transitionOrder · matriz de roles (L02)", () => {
  it("rechaza transiciones a 'new' (estado no manual)", async () => {
    authOk("admin");
    const res = await transitionOrder({
      orderId: VALID_ORDER_ID,
      toStatus: "new" as OrderStatus,
    });
    expect(res).toEqual({
      ok: false,
      error: "Esta transición no se hace manualmente",
    });
  });

  it("rechaza transiciones a 'awaiting_payment' (estado no manual)", async () => {
    authOk("admin");
    const res = await transitionOrder({
      orderId: VALID_ORDER_ID,
      toStatus: "awaiting_payment" as OrderStatus,
    });
    expect(res.ok).toBe(false);
  });

  it("permite cashier → preparing", async () => {
    mocks.orderState.status = "payment_approved";
    authOk("cashier");
    const res = await transitionOrder({
      orderId: VALID_ORDER_ID,
      toStatus: "preparing",
    });
    expect(res).toEqual({ ok: true });
  });

  it("permite kitchen → ready", async () => {
    mocks.orderState.status = "preparing";
    authOk("kitchen");
    const res = await transitionOrder({
      orderId: VALID_ORDER_ID,
      toStatus: "ready",
    });
    expect(res).toEqual({ ok: true });
  });

  it("rechaza driver → ready (rol no permitido)", async () => {
    // El mock simula que assertStaffRole rechaza el rol no autorizado.
    mocks.assertStaffRoleMock.mockResolvedValueOnce({
      ok: false,
      error: "No tienes permisos para esta acción",
    });
    const res = await transitionOrder({
      orderId: VALID_ORDER_ID,
      toStatus: "ready",
    });
    expect(res).toEqual({
      ok: false,
      error: "No tienes permisos para esta acción",
    });
  });

  it("permite driver → delivered SOBRE su propio pedido", async () => {
    mocks.orderState.status = "on_the_way";
    mocks.orderState.driver_id = DRIVER_A_ID;
    authOk("driver", DRIVER_A_ID);
    const res = await transitionOrder({
      orderId: VALID_ORDER_ID,
      toStatus: "delivered",
    });
    expect(res).toEqual({ ok: true });
  });

  it("rechaza driver → delivered de pedido ajeno", async () => {
    mocks.orderState.status = "on_the_way";
    mocks.orderState.driver_id = DRIVER_B_ID; // pedido del OTRO driver
    authOk("driver", DRIVER_A_ID);
    const res = await transitionOrder({
      orderId: VALID_ORDER_ID,
      toStatus: "delivered",
    });
    expect(res).toEqual({
      ok: false,
      error: "Solo puedes actualizar pedidos asignados a ti",
    });
  });

  it("permite cashier → delivered (fallback de conectividad del driver)", async () => {
    // Caso documentado: si driver pierde internet, cashier cierra el pedido.
    mocks.orderState.status = "on_the_way";
    mocks.orderState.driver_id = DRIVER_A_ID;
    authOk("cashier");
    const res = await transitionOrder({
      orderId: VALID_ORDER_ID,
      toStatus: "delivered",
    });
    expect(res).toEqual({ ok: true });
  });

  it("rechaza payment_approved cuando falta comprobante", async () => {
    mocks.orderState.status = "awaiting_payment";
    mocks.orderState.needs_proof = true;
    mocks.orderState.payment_proof_url = null;
    authOk("cashier");
    const res = await transitionOrder({
      orderId: VALID_ORDER_ID,
      toStatus: "payment_approved",
    });
    expect(res).toEqual({ ok: false, error: "Falta el comprobante" });
  });

  it("permite payment_approved con comprobante presente", async () => {
    mocks.orderState.status = "awaiting_payment";
    mocks.orderState.needs_proof = false;
    mocks.orderState.payment_proof_url = "https://example.com/proof.png";
    authOk("cashier");
    const res = await transitionOrder({
      orderId: VALID_ORDER_ID,
      toStatus: "payment_approved",
    });
    expect(res).toEqual({ ok: true });
  });

  it("rechaza cancelled desde driver (no permitido por la matriz)", async () => {
    mocks.assertStaffRoleMock.mockResolvedValueOnce({
      ok: false,
      error: "No tienes permisos para esta acción",
    });
    const res = await transitionOrder({
      orderId: VALID_ORDER_ID,
      toStatus: "cancelled",
    });
    expect(res.ok).toBe(false);
  });

  it("propaga error de assertStaffRole sin tocar DB", async () => {
    mocks.assertStaffRoleMock.mockResolvedValueOnce({
      ok: false,
      error: "No autorizado",
    });
    const res = await transitionOrder({
      orderId: VALID_ORDER_ID,
      toStatus: "preparing",
    });
    expect(res).toEqual({ ok: false, error: "No autorizado" });
    // Crítico: no debe haber llamado a Supabase si la auth falló.
    expect(mocks.fromMock).not.toHaveBeenCalled();
  });
});
