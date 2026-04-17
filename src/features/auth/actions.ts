"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getClientEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

const emailSchema = z.email();

export async function requestMagicLink(
  formData: FormData,
): Promise<ActionResult> {
  const raw = formData.get("email");
  const parsed = emailSchema.safeParse(typeof raw === "string" ? raw : "");
  if (!parsed.success) {
    return { ok: false, error: "Email inválido" };
  }
  const email = parsed.data;

  const supabase = await createClient();
  const { NEXT_PUBLIC_APP_URL } = getClientEnv();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  if (error) {
    console.error("requestMagicLink failed", {
      status: error.status,
      name: error.name,
      message: error.message,
    });
    return {
      ok: false,
      error: `No pudimos enviar el enlace. (${error.message})`,
    };
  }
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
