"use client";

import { useEffect, useRef, useState } from "react";

interface UseAudioContextResult {
  ctxRef: React.RefObject<AudioContext | null>;
  isUnlocked: boolean;
  unlock: () => void;
}

// U03: la autoplay policy del navegador bloquea AudioContext hasta el
// primer gesto del usuario. Este hook centraliza la creación del contexto
// para que tanto el banner explícito ("Activar sonido") como el listener
// pasivo de gesto (pointerdown/keydown) usen la misma fuente de verdad.
//
// Devolvemos el ref (no el valor) para que callers que cierran sobre él
// (handlers de Realtime, listeners) lean el valor actual cada vez que se
// disparan. Si retornaramos `ctx`, los handlers harían closure de null
// y el beep nunca sonaría tras el desbloqueo.
export function useAudioContext(): UseAudioContextResult {
  const ctxRef = useRef<AudioContext | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  function unlock(): void {
    if (ctxRef.current) {
      setIsUnlocked(true);
      return;
    }
    try {
      ctxRef.current = new AudioContext();
      setIsUnlocked(true);
    } catch {
      ctxRef.current = null;
    }
  }

  useEffect(() => {
    function passiveUnlock(): void {
      unlock();
    }
    window.addEventListener("pointerdown", passiveUnlock, { once: true });
    window.addEventListener("keydown", passiveUnlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", passiveUnlock);
      window.removeEventListener("keydown", passiveUnlock);
    };
  }, []);

  return { ctxRef, isUnlocked, unlock };
}
