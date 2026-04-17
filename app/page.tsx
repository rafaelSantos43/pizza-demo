import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="flex max-w-md flex-col items-center gap-4">
        <p className="text-sm font-medium tracking-wider text-primary uppercase">
          Pizza Demo
        </p>
        <h1 className="font-serif text-4xl leading-tight text-foreground md:text-5xl">
          Sistema operativo para tu pizzería
        </h1>
        <p className="text-base text-muted-foreground md:text-lg">
          Recibe pedidos por WhatsApp, organiza la cocina y entrega a tiempo
          con tus propios domiciliarios.
        </p>
      </div>

      <Button size="lg" asChild>
        <Link href="/login">Entrar al panel</Link>
      </Button>
    </main>
  );
}
