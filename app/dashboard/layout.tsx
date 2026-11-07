import { getCurrentOrganization, requireProfile } from "@/lib/auth";
import { getEnabledModuleKeys, MODULE_KEYS } from "@/lib/modules";
import { Sidebar, type SidebarNavItem } from "@/components/sidebar";
import { BrandFooter } from "@/components/brand-footer";
import { darken, isHexColor } from "@/lib/theme";

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

  // Módulos y datos de la organización se piden a la vez (y la página reutiliza
  // la misma consulta de módulos), en vez de uno detrás de otro.
  const [enabledKeys, org] =
    profile.organization_id && !isSuperAdmin
      ? await Promise.all([
          getEnabledModuleKeys(profile.organization_id),
          getCurrentOrganization(profile.organization_id),
        ])
      : [new Set<string>(), null];

  const logoUrl: string | null = org?.logo_url ?? null;
  const themeColor: string | null = isHexColor(org?.theme_color) ? org.theme_color : null;
  // Razón social si está configurada; si no, el nombre del negocio.
  const orgName: string | null = org?.legal_name?.trim() || org?.name || null;

  const isModuleEnabled = (key: string) => enabledKeys.has(key);

  const items: SidebarNavItem[] = [];

  if (isSuperAdmin) {
    items.push({ href: "/superadmin", label: "Organizaciones", icon: "superadmin" });
  } else {
    items.push({ href: "/dashboard/catalogo", label: "Catálogo", icon: "catalogo" });
    // Ventas y Gastos (incluido el cierre de caja) es solo del administrador;
    // los auxiliares registran ventas desde Ventas por Productos.
    if (profile.role === "owner") {
      items.push({
        href: "/dashboard/ventas",
        label: "Ventas y Gastos",
        icon: "ventas",
        locked: !isModuleEnabled(MODULE_KEYS.VENTAS_GASTOS),
      });
    }
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
    items.push({
      href: "/dashboard/clientes",
      label: "Clientes",
      icon: "clientes",
      locked: !isModuleEnabled(MODULE_KEYS.CLIENTES),
    });

    if (profile.role === "owner") {
      items.push({
        href: "/dashboard/actividad",
        label: "Registro de Actividad",
        icon: "actividad",
        locked: !isModuleEnabled(MODULE_KEYS.ACTIVIDAD),
      });
      items.push({
        href: "/dashboard/informes",
        label: "Informes",
        icon: "informes",
        locked: !isModuleEnabled(MODULE_KEYS.INFORMES),
      });
    }

    items.push({ href: "/dashboard/modulos", label: "Módulos", icon: "modulos" });
  }

  items.push({ href: "/dashboard/cuenta", label: "Mi Cuenta", icon: "cuenta" });

  return (
    <div className="flex min-h-screen">
      {themeColor && (
        // El color ya está validado como #RRGGBB; va en :root para que también
        // lo hereden los diálogos, que se montan fuera de este contenedor.
        <style>{`:root{--color-primary:${themeColor};--color-primary-dark:${darken(themeColor)};}`}</style>
      )}
      <div className="app-aurora" aria-hidden="true">
        <div className="app-aurora-grid" />
      </div>
      <Sidebar
        fullName={profile.full_name}
        roleLabel={ROLE_LABELS[profile.role] ?? profile.role}
        items={items}
        logoUrl={logoUrl}
        orgName={orgName}
      />
      <main className="flex min-w-0 flex-1 flex-col px-4 py-6 pt-20 md:px-8 md:py-8 md:pt-8">
        <div className="mx-auto w-full max-w-6xl flex-1">{children}</div>
        <BrandFooter />
      </main>
    </div>
  );
}
