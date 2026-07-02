import type { Metadata } from "next";
import {
  Inter,
  Libre_Caslon_Text,
  Playfair_Display,
  Plus_Jakarta_Sans,
} from "next/font/google";
import { Toaster } from "sonner";

import { pageTitle } from "@/config/brand";

import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-serif",
  subsets: ["latin"],
});

// Fuentes del tema Heritage (shop). Se cargan en <html> para que las
// variables estén disponibles también en los overlays de Radix (Sheet/Dialog)
// que se portan a document.body, fuera del wrapper del shop. Quedan inertes:
// solo se usan dentro de `.theme-heritage`.
const heritageSerif = Libre_Caslon_Text({
  variable: "--font-heritage-serif",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

const heritageSans = Plus_Jakarta_Sans({
  variable: "--font-heritage-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: pageTitle(),
  description: "Sistema operativo para pizzería.",
};

// Script bloqueante anti-FOUC: fija la clase `dark` en <html> ANTES del primer
// paint, leyendo la preferencia guardada o, en su defecto, la del sistema.
// Se inyecta como string mínimo para evitar el flash de tema al cargar.
const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}else{document.documentElement.classList.remove("dark")}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${playfair.variable} ${heritageSerif.variable} ${heritageSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
