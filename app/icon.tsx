import { ImageResponse } from "next/og";

import { BRAND_NAME } from "@/config/brand";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Hex aproximado de oklch(0.55 0.20 25) — el --primary nuevo. Hardcodeado
// porque ImageResponse renderiza fuera del runtime de Tailwind y no tiene
// acceso a los tokens CSS.
const PRIMARY_HEX = "#C53A2A";

// Inicial del nombre comercial (sale del rebrand). Fallback "P" por si el
// nombre viniera vacío.
const INITIAL = BRAND_NAME.trim().charAt(0).toUpperCase() || "P";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: PRIMARY_HEX,
          color: "#ffffff",
          fontSize: 22,
          fontWeight: 700,
          fontFamily: "Georgia, serif",
          borderRadius: "9999px",
          lineHeight: 1,
        }}
      >
        {INITIAL}
      </div>
    ),
    { ...size },
  );
}
