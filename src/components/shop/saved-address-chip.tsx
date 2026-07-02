"use client";

import { MapPin, Pencil } from "lucide-react";

import { cn } from "@/lib/utils";

interface SavedAddressChipProps {
  summary: string;
  onChange: () => void;
  className?: string;
}

export function SavedAddressChip({
  summary,
  onChange,
  className,
}: SavedAddressChipProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border border-secondary/50 bg-secondary/15 px-3 py-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        <MapPin className="size-4 shrink-0 text-secondary-foreground" />
        <span className="truncate">
          <span className="font-medium">Donde siempre · </span>
          {summary}
        </span>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <Pencil className="size-3" />
        Cambiar
      </button>
    </div>
  );
}
