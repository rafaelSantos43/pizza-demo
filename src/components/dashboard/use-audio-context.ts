"use client";

import { useEffect, useRef, useState } from "react";

interface UseAudioContextResult {
  ctxRef: React.RefObject<AudioContext | null>;
  isUnlocked: boolean;
  unlock: () => void;
}

const STORAGE_KEY = "pfd:audio-activated";

function readStoredFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistStoredFlag(): void {
  if (typeof window === "undefined") return; 
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // localStorage bloqueado (private mode o políticas estrictas): no falla,
    // solo significa que el banner volverá a salir tras F5.
  }
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
//
// Persistencia: una vez que el cajero activa el sonido en un dispositivo,
// guardamos un flag en localStorage para que el banner NO vuelva a salir
// tras un F5. El AudioContext real se crea en el próximo gesto natural
// del cajero (cualquier click), porque algunos browsers lo dejan en
// estado `suspended` si se crea sin gesto.
export function useAudioContext(): UseAudioContextResult {
  const ctxRef = useRef<AudioContext | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  function unlock(): void {
    if (ctxRef.current) {
      setIsUnlocked(true);
      persistStoredFlag();
      return;
    }
    try {
      ctxRef.current = new AudioContext();
      setIsUnlocked(true);
      persistStoredFlag();
    } catch {
      ctxRef.current = null;
    }
  }

  // Restaura el flag desde localStorage tras hidratación. Hay un flicker
  // brevísimo del banner en F5 si el cajero ya había activado, aceptado
  // para evitar mismatch de hidratación SSR ↔ cliente.
  useEffect(() => {
    if (readStoredFlag()) setIsUnlocked(true);
  }, []);

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
