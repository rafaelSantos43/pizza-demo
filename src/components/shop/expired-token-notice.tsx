"use client";

import { useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { requestNewLinkByToken } from "@/features/order-tokens/request-relink";

type Reason = "expired" | "used";
type UiState = "idle" | "sent" | "rate_limited" | "error";

const TITLE: Record<Reason, string> = {
  expired: "Enlace expirado",
  used: "Enlace ya usado",
};

const SUBTITLE: Record<Reason, string> = {
  expired:
    "Tu enlace al menú ya no es válido. Te enviamos uno nuevo por WhatsApp en segundos.",
  used: "Este enlace ya se usó para un pedido. Pide otro por WhatsApp si quieres ordenar de nuevo.",
};

export function ExpiredTokenNotice({
  token,
  reason,
}: {
  token: string;
  reason: Reason;
}) {
  const [pending, startTransition] = useTransition();
  const [uiState, setUiState] = useState<UiState>("idle");

  function handleClick() {
    startTransition(async () => {
      const result = await requestNewLinkByToken({ token });
      if (result.ok) {
        setUiState("sent");
        toast.success("Te enviamos un nuevo link a tu WhatsApp 📲");
        return;
      }
      if (result.error === "rate_limited") {
        setUiState("rate_limited");
        return;
      }
      setUiState("error");
      toast.error("No pudimos enviar el link. Intenta de nuevo.");
    });
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <h1 className="font-serif text-3xl text-foreground md:text-4xl">
        {TITLE[reason]}
      </h1>
      <p className="max-w-md text-base text-muted-foreground md:text-lg">
        {SUBTITLE[reason]}
      </p>

      {uiState === "idle" || uiState === "error" ? (
        <Button
          size="lg"
          onClick={handleClick}
          disabled={pending}
          className="min-h-12 px-6"
        >
          <MessageCircle aria-hidden />
          {pending ? "Enviando..." : "Pedir nuevo link por WhatsApp"}
        </Button>
      ) : null}

      {uiState === "sent" ? (
        <p className="max-w-md text-base text-foreground md:text-lg">
          Revisa tu WhatsApp y abre el nuevo link 📲
        </p>
      ) : null}

      {uiState === "rate_limited" ? (
        <p className="max-w-md text-base text-foreground md:text-lg">
          Ya pediste varios links. Revisa tu WhatsApp o espera unos minutos
          antes de intentar de nuevo.
        </p>
      ) : null}
    </main>
  );
}
