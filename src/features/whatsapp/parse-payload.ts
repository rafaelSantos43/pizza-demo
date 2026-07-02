import "server-only";

import { z } from "zod";

const baseMessageFields = {
  from: z.string().min(1),
  id: z.string().min(1),
  timestamp: z.string().min(1),
};

export const incomingTextSchema = z.object({
  ...baseMessageFields,
  type: z.literal("text"),
  text: z.object({ body: z.string() }),
});

export const incomingImageSchema = z.object({
  ...baseMessageFields,
  type: z.literal("image"),
  image: z.object({
    id: z.string().min(1),
    mime_type: z.string().min(1),
    sha256: z.string().optional(),
    caption: z.string().optional(),
  }),
});

export const incomingOtherSchema = z.object({
  ...baseMessageFields,
  type: z.string(),
});

export const incomingMessageSchema = z.union([
  incomingTextSchema,
  incomingImageSchema,
  incomingOtherSchema,
]);

const contactSchema = z.object({
  wa_id: z.string().optional(),
  profile: z.object({ name: z.string().optional() }).optional(),
});

const statusSchema = z.object({
  id: z.string().optional(),
  status: z.string().optional(),
  recipient_id: z.string().optional(),
  timestamp: z.string().optional(),
});

const valueSchema = z.object({
  messaging_product: z.string().optional(),
  metadata: z
    .object({
      display_phone_number: z.string().optional(),
      phone_number_id: z.string().optional(),
    })
    .optional(),
  contacts: z.array(contactSchema).optional(),
  messages: z.array(incomingMessageSchema).optional(),
  statuses: z.array(statusSchema).optional(),
});

const changeSchema = z.object({
  field: z.string().optional(),
  value: valueSchema,
});

const entrySchema = z.object({
  id: z.string().optional(),
  changes: z.array(changeSchema).default([]),
});

export const webhookPayloadSchema = z.object({
  object: z.string().optional(),
  entry: z.array(entrySchema).default([]),
});

export type IncomingTextMessage = z.infer<typeof incomingTextSchema>;
export type IncomingImageMessage = z.infer<typeof incomingImageSchema>;
export type IncomingOtherMessage = z.infer<typeof incomingOtherSchema>;
export type IncomingMessage = z.infer<typeof incomingMessageSchema>;
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
