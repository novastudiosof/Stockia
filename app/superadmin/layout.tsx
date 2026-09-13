import Image from "next/image";
import Link from "next/link";

import { requireRole } from "@/lib/auth";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole("super_admin");

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between bg-brand-ink px-4 py-4 text-white md:px-8">
        <div className="flex items-center gap-3">
          <Image src="/brand/logo.svg" alt="Logo" width={32} height={32} />
          <div>
            <p className="text-sm font-semibold">Panel de Super Administrador</p>
            <p className="text-xs text-white/60">{profile.full_name}</p>
          </div>
        </div>
        <Link href="/dashboard" className="text-sm text-white/70 hover:text-white">
          Volver al sistema
        </Link>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
