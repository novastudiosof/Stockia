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

  const isSuperAdmin = profile.role === "super_admin";

  const modules =
    profile.organization_id && !isSuperAdmin
      ? await getModulesWithStatus(profile.organization_id)
      : [];

  const isModuleEnabled = (key: string) =>
    modules.find((m) => m.key === key)?.enabled ?? false;

  const items: SidebarNavItem[] = [];

  if (isSuperAdmin) {
    items.push({ href: "/superadmin", label: "Organizaciones", icon: "superadmin" });
  } else {
    items.push({ href: "/dashboard/catalogo", label: "Catálogo", icon: "catalogo" });
    items.push({
      href: "/dashboard/ventas",
      label: "Ventas y Gastos",
      icon: "ventas",
      locked: !isModuleEnabled(MODULE_KEYS.VENTAS_GASTOS),
    });
    items.push({
      href: "/dashboard/facturas",
      label: "Facturas",
      icon: "facturas",
      locked: !isModuleEnabled(MODULE_KEYS.FACTURAS),
    });
    items.push({
      href: "/dashboard/ventas-productos",
      label: "Ventas por Productos",
      icon: "ventasProductos",
      locked: !isModuleEnabled(MODULE_KEYS.VENTAS_PRODUCTOS),
    });

    if (profile.role === "owner") {
      items.push({
        href: "/dashboard/actividad",
        label: "Registro de Actividad",
        icon: "actividad",
      });
      items.push({ href: "/dashboard/informes", label: "Informes", icon: "informes" });
    }

    items.push({ href: "/dashboard/modulos", label: "Módulos", icon: "modulos" });
  }

  items.push({ href: "/dashboard/cuenta", label: "Mi Cuenta", icon: "cuenta" });

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
