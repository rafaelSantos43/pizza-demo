import { z } from "zod";

export const tokenPayloadSchema = z.object({
  customerId: z.uuid(),
  iat: z.number().int().nonnegative(),
});

export type TokenPayload = z.infer<typeof tokenPayloadSchema>;

export const verifyResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    customerId: z.uuid(),
    tokenId: z.uuid(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum([
      "malformed",
      "invalid_signature",
      "not_found",
      "expired",
      "used",
    ]),
  }),
]);

export type VerifyResult = z.infer<typeof verifyResultSchema>;
