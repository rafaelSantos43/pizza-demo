"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

// Alterna el tema claro/oscuro. El tema real lo fija un script bloqueante en el
// root layout ANTES del primer paint (evita FOUC); este botón solo lee el estado
// vigente del <html> tras montar (para no romper la hidratación, ya que el server
// no conoce el tema) y lo alterna en click, persistiendo en localStorage.
export function ThemeToggle({ className }: ThemeToggleProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains("dark"));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
  }, []);

  function toggle() {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setIsDark(next);
  }

  const baseClass = cn(
    "inline-flex size-11 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className,
  );

  // Placeholder estable hasta montar: mismo tamaño, sin icono, para que el
  // markup SSR y el del primer render cliente coincidan.
  if (!isMounted) {
    return <span aria-hidden className={baseClass} />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Cambiar tema"
      className={baseClass}
    >
      {isDark ? (
        <Sun className="size-5" aria-hidden />
      ) : (
        <Moon className="size-5" aria-hidden />
      )}
    </button>
  );
}
