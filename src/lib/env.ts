import { z } from "zod";

import { DEMO_PUBLIC_ENV, DEMO_SERVER_ENV, isDemoMode } from "@/lib/demo";

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  ORDER_TOKEN_SECRET: z.string().min(32),

  WHATSAPP_VERIFY_TOKEN: z.string().min(1),
  WHATSAPP_APP_SECRET: z.string().min(1),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  META_GRAPH_API_VERSION: z.string().default("v23.0"),

  CRON_SECRET: z.string().min(16),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url(),
});

let clientEnvCache: z.infer<typeof clientSchema> | null = null;

export function getClientEnv() {
  if (clientEnvCache) return clientEnvCache;

  if (isDemoMode()) {
    clientEnvCache = clientSchema.parse(DEMO_PUBLIC_ENV);
    return clientEnvCache;
  }

  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid public env vars:\n${z.prettifyError(parsed.error)}`,
    );
  }
  clientEnvCache = parsed.data;
  return clientEnvCache;
}

let serverEnvCache: z.infer<typeof serverSchema> | null = null;

export function getServerEnv() {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() must not be called from the browser");
  }
  if (serverEnvCache) return serverEnvCache;

  if (isDemoMode()) {
    serverEnvCache = serverSchema.parse(DEMO_SERVER_ENV);
    return serverEnvCache;
  }

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid server env vars:\n${z.prettifyError(parsed.error)}`,
    );
  }
  serverEnvCache = parsed.data;
  return serverEnvCache;
}
