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
// guardamos un flag en localStorage SOLO como registro histórico ("ya lo
// activó alguna vez"). NO se usa para ocultar el banner: la autoplay policy
// del navegador es por carga de página y no se persiste, así que el único
// criterio válido para "el audio suena AHORA" es `ctx.state === 'running'`.
export function useAudioContext(): UseAudioContextResult {
  const ctxRef = useRef<AudioContext | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  // `isUnlocked` es la única fuente de verdad y debe seguir el estado REAL
  // del AudioContext. Enganchamos `onstatechange` una sola vez al crear el
  // ctx para que React refleje running/suspended sin adivinar. La bandera de
  // montaje evita setState tras desmontar (el ctx vive en un ref y su
  // callback podría dispararse fuera del ciclo de vida del componente).
  const isMountedRef = useRef(true);

  function ensureCtx(): AudioContext | null {
    if (ctxRef.current) return ctxRef.current;
    try {
      const ctx = new AudioContext();
      ctx.onstatechange = () => {
        if (isMountedRef.current) {
          setIsUnlocked(ctx.state === "running");
        }
      };
      ctxRef.current = ctx;
      return ctx;
    } catch {
      ctxRef.current = null;
      return null;
    }
  }

  function unlock(): void {
    const ctx = ensureCtx();
    // En algunos browsers (Safari, Chrome móvil) el ctx puede crearse
    // en estado `suspended`. Hay que llamar resume() dentro del gesto
    // del usuario para que reproduzca audio después. Estamos dentro de un
    // gesto real, así que el optimismo aquí es válido; `onstatechange`
    // corregirá el valor si el resume no prospera.
    if (ctx && ctx.state === "suspended") {
      void ctx.resume();
    }
    setIsUnlocked(true);
    persistStoredFlag();
  }

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Cajero recurrente (flag en localStorage): creamos el ctx e intentamos
  // resume(), pero NO marcamos isUnlocked a ciegas. Fuera de un gesto el
  // resume() normalmente NO prospera y el ctx queda `suspended`, así que
  // `onstatechange` dejará isUnlocked en false → el banner aparece → el
  // cajero hace un click que desbloquea el audio de verdad. Eso es lo
  // deseado: sin esto, el banner se ocultaba pero el beep seguía dormido.
  useEffect(() => {
    if (readStoredFlag()) {
      const ctx = ensureCtx();
      if (ctx && ctx.state === "suspended") {
        void ctx.resume();
      }
    }
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
