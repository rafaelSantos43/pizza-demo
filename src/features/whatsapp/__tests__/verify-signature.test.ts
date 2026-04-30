import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "test-app-secret";

function sign(body: string): string {
  return `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  vi.stubEnv(
    "ORDER_TOKEN_SECRET",
    "test-order-token-secret-with-32-chars-xx",
  );
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "test-verify");
  vi.stubEnv("WHATSAPP_APP_SECRET", SECRET);
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-access");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "test-phone-id");
  vi.stubEnv("META_GRAPH_API_VERSION", "v23.0");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.stubEnv("CRON_SECRET", "test-cron-secret-16ch");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verifyMetaSignature", () => {
  it("accepts a valid HMAC", async () => {
    const { verifyMetaSignature } = await import("../verify-signature");
    const body = JSON.stringify({ hello: "world" });
    expect(verifyMetaSignature(body, sign(body))).toBe(true);
  });

  it("rejects an invalid HMAC", async () => {
    const { verifyMetaSignature } = await import("../verify-signature");
    const body = JSON.stringify({ hello: "world" });
    const bad = `sha256=${"0".repeat(64)}`;
    expect(verifyMetaSignature(body, bad)).toBe(false);
  });

  it("rejects a header without sha256= prefix", async () => {
    const { verifyMetaSignature } = await import("../verify-signature");
    const body = "x";
    const noPrefix = createHmac("sha256", SECRET).update(body).digest("hex");
    expect(verifyMetaSignature(body, noPrefix)).toBe(false);
  });

  it("rejects null / empty signature", async () => {
    const { verifyMetaSignature } = await import("../verify-signature");
    expect(verifyMetaSignature("body", null)).toBe(false);
    expect(verifyMetaSignature("body", "")).toBe(false);
  });

  it("returns false (no throw) when lengths differ", async () => {
    const { verifyMetaSignature } = await import("../verify-signature");
    const tooShort = "sha256=abcd";
    expect(() => {
      const ok = verifyMetaSignature("body", tooShort);
      expect(ok).toBe(false);
    }).not.toThrow();
  });
});
