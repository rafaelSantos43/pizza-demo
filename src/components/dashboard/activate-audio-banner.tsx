"use client";

import { Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ActivateAudioBannerProps {
  isUnlocked: boolean;
  onActivate: () => void;
}

// U03: aparece SOLO si el AudioContext aún no fue desbloqueado al cargar
// el panel. Llama atención con `--secondary` (mostaza) sin agresividad —
// no es error, es invitación. Se oculta automáticamente apenas el hook
// reporta `isUnlocked = true` (vía botón o vía listener pasivo del hook).
export function ActivateAudioBanner({
  isUnlocked,
  onActivate,
}: ActivateAudioBannerProps) {
  if (isUnlocked) return null;

  function handleClick() {
    onActivate();
    // Beep corto de prueba para que el cajero confirme audibilidad.
    // Try/catch silencioso: si el browser rechaza el oscilador en algún
    // contexto raro (iframe sandbox), el banner se oculta igual y la
    // primera notificación real cumple la función de prueba.
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t0 = ctx.currentTime;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
      osc.start(t0);
      osc.stop(t0 + 0.36);
    } catch {
      // ignorar
    }
  }

  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-3 rounded-md border border-secondary/50 bg-secondary/15 px-4 py-3 text-sm text-foreground">
      <div className="flex items-start gap-2">
        <Volume2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div>
          <p className="font-medium">
            Activa los sonidos para escuchar cuando lleguen pedidos nuevos
          </p>
          <p className="text-xs text-muted-foreground">
            Tu navegador bloquea el audio hasta que lo confirmes.
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="success"
        size="sm"
        onClick={handleClick}
        className="min-h-11 shrink-0"
      >
        Activar sonido
      </Button>
    </div>
  );
}
