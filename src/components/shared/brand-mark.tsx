"use client";

import { useEffect, useState } from "react";

import { BRAND_NAME } from "@/config/brand";
import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  fallbackTextClassName?: string;
}

// Renderiza el logo desde /brand-logo.png si existe; si no (404 o no descargado
// todavía), cae a un círculo --primary con la inicial del BRAND_NAME. Evita el
// flash del icono "imagen rota" del browser mientras no exista el archivo.
export function BrandMark({
  className,
  fallbackTextClassName,
}: BrandMarkProps) {
  const [status, setStatus] = useState<"checking" | "exists" | "missing">(
    "checking",
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/brand-logo.png", { method: "HEAD", cache: "no-store" })
      .then((r) => {
        if (cancelled) return;
        setStatus(r.ok ? "exists" : "missing");
      })
      .catch(() => {
        if (!cancelled) setStatus("missing");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "exists") {
    return (
      <img
        src="/brand-logo.png"
        alt=""
        className={cn("rounded-full object-cover shrink-0", className)}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={cn(
        "rounded-full bg-primary text-primary-foreground flex items-center justify-center font-serif font-bold shrink-0",
        fallbackTextClassName ?? "text-base",
        className,
      )}
    >
      {BRAND_NAME.charAt(0)}
    </div>
  );
}
