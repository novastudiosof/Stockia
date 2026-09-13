import { requireProfile } from "@/lib/auth";
import { getModulesWithStatus, MODULE_KEYS } from "@/lib/modules";
import { Sidebar, type SidebarNavItem } from "@/components/sidebar";
import { BrandFooter } from "@/components/brand-footer";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super administrador",
  owner: "Administrador",
  auxiliar: "Auxiliar",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  const modules = profile.organization_id
    ? await getModulesWithStatus(profile.organization_id)
    : [];

  const isModuleEnabled = (key: string) =>
    modules.find((m) => m.key === key)?.enabled ?? false;

  const items: SidebarNavItem[] = [
    { href: "/dashboard/catalogo", label: "Catálogo", icon: "catalogo" },
    {
      href: "/dashboard/ventas",
      label: "Ventas y Gastos",
      icon: "ventas",
      locked: !isModuleEnabled(MODULE_KEYS.VENTAS_GASTOS),
    },
    {
      href: "/dashboard/facturas",
      label: "Facturas",
      icon: "facturas",
      locked: !isModuleEnabled(MODULE_KEYS.FACTURAS),
    },
  ];

  if (profile.role === "owner" || profile.role === "super_admin") {
    items.push({
      href: "/dashboard/actividad",
      label: "Registro de Actividad",
      icon: "actividad",
    });
  }

  items.push({ href: "/dashboard/modulos", label: "Módulos", icon: "modulos" });
  items.push({ href: "/dashboard/cuenta", label: "Mi Cuenta", icon: "cuenta" });

  if (profile.role === "super_admin") {
    items.push({ href: "/superadmin", label: "Super Admin", icon: "superadmin" });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        fullName={profile.full_name}
        roleLabel={ROLE_LABELS[profile.role] ?? profile.role}
        items={items}
      />
      <main className="flex flex-1 flex-col px-4 py-6 pt-20 md:px-8 md:py-8 md:pt-8">
        <div className="mx-auto w-full max-w-6xl flex-1">{children}</div>
        <BrandFooter />
      </main>
    </div>
  );
}
