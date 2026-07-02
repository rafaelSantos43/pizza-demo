"use client";

import { useState } from "react";

import { NEIGHBORHOODS } from "@/config/neighborhoods";
import { normalize } from "@/lib/normalize";
import { cn } from "@/lib/utils";

interface NeighborhoodComboboxProps {
  id?: string;
  value: string;
  onChange: (v: string) => void;
}

export function NeighborhoodCombobox({
  id,
  value,
  onChange,
}: NeighborhoodComboboxProps) {
  const [open, setOpen] = useState(false);

  const query = normalize(value);
  const filtered = query
    ? NEIGHBORHOODS.filter((n) => normalize(n).includes(query))
    : NEIGHBORHOODS;

  function handleBlur() {
    // delay para permitir que onMouseDown del item dispare onChange
    // antes de que el dropdown se cierre por blur del input
    setTimeout(() => setOpen(false), 150);
  }

  return (
    <div className="relative mt-1">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        autoComplete="off"
        className={cn(
          "h-11 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        )}
      />
      {open && filtered.length > 0 ? (
        <ul
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
        >
          {filtered.map((item) => (
            <li
              key={item}
              role="option"
              aria-selected={value === item}
              onMouseDown={(e) => {
                // mousedown corre antes que blur — así el click no se pierde
                e.preventDefault();
                onChange(item);
                setOpen(false);
              }}
              className="cursor-pointer px-3 py-2 text-sm hover:bg-accent"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
