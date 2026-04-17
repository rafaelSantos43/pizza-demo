"use client";

import {
  Bike,
  ClipboardList,
  LogOut,
  Menu,
  Pizza,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { signOut } from "@/features/auth/actions";
import type { CurrentStaff, StaffRole } from "@/features/auth/queries";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: typeof ClipboardList;
  roles?: StaffRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/pedidos",
    label: "Pedidos",
    icon: ClipboardList,
    roles: ["admin", "cashier", "kitchen"],
  },
  { href: "/mensajero", label: "Mensajero", icon: Bike },
  { href: "/menu", label: "Menú", icon: Pizza, roles: ["admin"] },
  {
    href: "/settings",
    label: "Configuración",
    icon: Settings,
    roles: ["admin"],
  },
];

function visibleNav(role: StaffRole) {
  return NAV_ITEMS.filter((it) => !it.roles || it.roles.includes(role));
}

function initials(name: string | null, email: string | null) {
  const source = (name ?? email ?? "?").trim();
  const parts = source.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

interface NavListProps {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}

function NavList({ items, pathname, onNavigate }: NavListProps) {
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-5 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

interface UserMenuProps {
  staff: CurrentStaff;
  align?: "start" | "end";
}

function UserMenu({ staff, align = "end" }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar className="size-9">
          <AvatarFallback className="bg-primary text-primary-foreground">
            {initials(staff.displayName, staff.email)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-foreground">
            {staff.displayName ?? staff.email ?? "Usuario"}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {staff.role}
          </span>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side="top" className="w-56">
        <DropdownMenuItem asChild>
          <form action={signOut} className="w-full">
            <button
              type="submit"
              className="flex w-full items-center gap-2 text-left"
            >
              <LogOut className="size-4" />
              <span>Salir</span>
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface DashboardShellProps {
  staff: CurrentStaff;
  children: React.ReactNode;
}

export function DashboardShell({ staff, children }: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = visibleNav(staff.role);

  return (
    <div className="flex min-h-svh w-full bg-muted/20">
      <aside className="hidden w-[220px] shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
        <div className="border-b border-border px-5 py-5">
          <Link
            href="/pedidos"
            className="font-serif text-2xl text-primary"
          >
            Pizza Demo
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavList items={items} pathname={pathname} />
        </div>
        <div className="border-t border-border p-3">
          <UserMenu staff={staff} align="start" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background px-3 lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Abrir menú"
                className="flex size-11 items-center justify-center rounded-lg text-foreground hover:bg-accent"
              >
                <Menu className="size-6" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b border-border px-5 py-4">
                <SheetTitle className="font-serif text-2xl text-primary">
                  Pizza Demo
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-1 flex-col px-3 py-4">
                <NavList
                  items={items}
                  pathname={pathname}
                  onNavigate={() => setMobileOpen(false)}
                />
              </div>
              <div className="border-t border-border p-3">
                <UserMenu staff={staff} align="start" />
              </div>
            </SheetContent>
          </Sheet>
          <Link
            href="/pedidos"
            className="font-serif text-xl text-primary"
          >
            Pizza Demo
          </Link>
          <div className="size-11" aria-hidden />
        </header>

        <main className="flex-1 overflow-y-auto bg-muted/20 px-4 py-6 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
