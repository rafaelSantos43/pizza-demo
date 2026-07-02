// Tema "Heritage" aplicado SOLO al shop del cliente. Tiene modo claro
// (parchment) y oscuro (espresso), que sigue el toggle global de <html class="dark">.
// El dashboard del staff (app/(dashboard)) no usa esta clase, así que conserva su
// propio design system. Las fuentes Heritage se cargan en el root layout
// (app/layout.tsx) sobre <html> para que también apliquen en los overlays de
// Radix que se portan a document.body (Sheet del builder, carrito y review del checkout).
export default function ShopLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="theme-heritage min-h-screen bg-background font-sans text-foreground">
      {children}
    </div>
  );
}
