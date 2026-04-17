import { describe, expect, it } from "vitest";

import { webhookPayloadSchema } from "../parse-payload";

const validTextAndImagePayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "573001234567",
              phone_number_id: "PHONE_ID",
            },
            contacts: [
              { wa_id: "573012345678", profile: { name: "Juan" } },
            ],
            messages: [
              {
                from: "573012345678",
                id: "wamid.AAA",
                timestamp: "1700000000",
                type: "text",
                text: { body: "Hola" },
              },
              {
                from: "573012345678",
                id: "wamid.BBB",
                timestamp: "1700000005",
                type: "image",
                image: {
                  id: "media-123",
                  mime_type: "image/jpeg",
                  sha256: "abc",
                  caption: "comprobante",
                },
              },
            ],
          },
        },
      ],
    },
  ],
};

describe("webhookPayloadSchema", () => {
  it("parses a payload with text + image messages", () => {
    const res = webhookPayloadSchema.safeParse(validTextAndImagePayload);
    expect(res.success).toBe(true);
    if (!res.success) return;

    const messages = res.data.entry[0]!.changes[0]!.value.messages;
    expect(messages).toHaveLength(2);
    expect(messages![0]!.type).toBe("text");
    expect(messages![1]!.type).toBe("image");
  });

  it("parses a payload without messages array (statuses only)", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                statuses: [
                  {
                    id: "wamid.AAA",
                    status: "delivered",
                    timestamp: "1700000010",
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const res = webhookPayloadSchema.safeParse(payload);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.entry[0]!.changes[0]!.value.messages).toBeUndefined();
  });

  it("defaults entry to [] when missing", () => {
    const res = webhookPayloadSchema.safeParse({
      object: "whatsapp_business_account",
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.entry).toEqual([]);
  });

  it("treats unknown message types as 'other' (catch-all)", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "573012345678",
                    id: "wamid.CCC",
                    timestamp: "1700000020",
                    type: "audio",
                    audio: { id: "a-1", mime_type: "audio/ogg" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const res = webhookPayloadSchema.safeParse(payload);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const msg = res.data.entry[0]!.changes[0]!.value.messages![0]!;
    expect(msg.type).toBe("audio");
  });

  it("fails on totally malformed payload", () => {
    const res = webhookPayloadSchema.safeParse({
      entry: [{ changes: [{ value: { messages: [{ broken: true }] } }] }],
    });
    expect(res.success).toBe(false);
  });
});
