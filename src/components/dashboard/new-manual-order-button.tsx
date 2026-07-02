"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { ManualOrderSheet } from "./manual-order-sheet";

// Wrapper Client mínimo: maneja el estado open del sheet desde el header del
// RSC `/pedidos`. Permite que el page.tsx siga siendo Server Component.
export function NewManualOrderButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="success"
        onClick={() => setOpen(true)}
        className="min-h-11 self-start md:self-auto"
      >
        <Plus className="size-4" />
        Nuevo pedido manual
      </Button>
      <ManualOrderSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
