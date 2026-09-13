"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  FileText,
  LayoutGrid,
  LogOut,
  Menu,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  User,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

export interface SidebarNavItem {
  href: string;
  label: string;
  icon:
    | "catalogo"
    | "ventas"
    | "facturas"
    | "actividad"
    | "modulos"
    | "cuenta"
    | "superadmin"
    | "ventasProductos"
    | "informes";
  locked?: boolean;
}

const ICONS = {
  catalogo: Boxes,
  ventas: Receipt,
  facturas: FileText,
  actividad: ClipboardList,
  modulos: LayoutGrid,
  cuenta: User,
  superadmin: ShieldCheck,
  ventasProductos: ShoppingCart,
  informes: BarChart3,
};

interface SidebarProps {
  fullName: string;
  roleLabel: string;
  items: SidebarNavItem[];
}

export function Sidebar({ fullName, roleLabel, items }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const content = (
    <div className="flex h-full flex-col bg-brand-ink text-white">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <Image src="/brand/logo.svg" alt="Logo" width={40} height={40} />
        <div>
          <p className="text-sm font-semibold leading-tight">Stockia</p>
          <p className="text-xs text-white/60">{roleLabel}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius-brand-sm)] px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-brand text-brand-ink font-medium"
                  : "text-white/80 hover:bg-white/10 hover:text-white",
                item.locked && "opacity-60"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
              {item.locked && <span className="ml-auto text-xs">🔒</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <p className="truncate text-sm font-medium">{fullName}</p>
        <button
          onClick={handleLogout}
          className="mt-3 flex items-center gap-2 text-sm text-white/70 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between bg-brand-ink px-4 py-3 text-white md:hidden">
        <div className="flex items-center gap-2">
          <Image src="/brand/logo.svg" alt="Logo" width={28} height={28} />
          <span className="text-sm font-semibold">Stockia</span>
        </div>
        <button onClick={() => setOpen(true)} aria-label="Abrir menú">
          <Menu className="h-6 w-6" />
        </button>
      </div>

      <aside className="hidden w-64 shrink-0 md:block">{content}</aside>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 text-white"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>
            {content}
          </div>
        </div>
      )}
    </>
  );
}
