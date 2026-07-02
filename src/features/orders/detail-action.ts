"use server";

import { requireStaff } from "@/features/auth/guards";
import { getSignedProofUrl } from "@/features/payments/signed-url";

import { getOrderDetail } from "./queries";
import type { OrderDetail } from "./types";

export type OrderDetailResult =
  | { ok: true; detail: OrderDetail; proofUrl: string | null }
  | { ok: false; error: string };

export async function getOrderDetailAction(
  orderId: string,
): Promise<OrderDetailResult> {
  await requireStaff();

  try {
    const detail = await getOrderDetail(orderId);
    if (!detail) return { ok: false, error: "Pedido no encontrado" };

    const proofUrl = detail.payment_proof_url
      ? await getSignedProofUrl(detail.payment_proof_url)
      : null;

    return { ok: true, detail, proofUrl };
  } catch (err) {
    console.error("getOrderDetailAction failed", err);
    return { ok: false, error: "No pudimos cargar el pedido." };
  }
}
