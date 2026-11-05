"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toggleModule } from "@/lib/actions/superadmin";
import type { ModuleStatus } from "@/lib/modules";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

interface ModuleToggleListProps {
  organizationId: string;
  modules: ModuleStatus[];
}

export function ModuleToggleList({ organizationId, modules }: ModuleToggleListProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  async function handleToggle(moduleId: string, enabled: boolean) {
    setPendingId(moduleId);
    await toggleModule(organizationId, moduleId, enabled);
    setPendingId(null);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Módulos</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-brand-border">
        <div className="mb-3 rounded-[var(--radius-brand-sm)] bg-amber-50 p-3 text-sm text-amber-900">
          <p className="mb-1 font-medium">Cómo se combinan los módulos</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Todos funcionan por separado; al activar varios se integran solos. Catálogo viene
              incluido siempre.
            </li>
            <li>
              <strong>Ventas por Productos + Ventas y Gastos:</strong> las ventas aparecen como
              &quot;Ventas registradas&quot; y se habilita el cierre de caja por día. Sin Ventas y
              Gastos, las ventas funcionan pero no se ven como ingreso ni hay cierre de caja.
            </li>
            <li>
              <strong>Ventas por Productos + Clientes:</strong> se puede vender a un cliente guardado
              (con su correo para enviarle la factura). Sin Clientes, solo se vende a consumidor final.
            </li>
            <li>
              <strong>Informes:</strong> descarga Excel de lo que haya activo (ventas, ventas por
              productos, inventario). Facturas y Registro de Actividad son independientes.
            </li>
          </ul>
        </div>
        {modules.map((mod) => (
          <div key={mod.id} className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-brand-ink">{mod.name}</p>
              <p className="text-sm text-brand-muted">
                {mod.description}
                {mod.price > 0 && ` · ${currency.format(mod.price)}/mes`}
              </p>
            </div>
            <Switch
              checked={mod.enabled}
              disabled={pendingId === mod.id}
              onCheckedChange={(checked) => handleToggle(mod.id, checked)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
