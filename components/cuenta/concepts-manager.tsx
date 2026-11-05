"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createConcept, deleteConcept } from "@/lib/actions/conceptos";
import type { MovementConcept, MovementType } from "@/lib/supabase/types";

const SECTIONS: { type: MovementType; title: string; placeholder: string }[] = [
  { type: "gasto", title: "Conceptos de gastos", placeholder: "Ej: Mantenimiento" },
  { type: "venta", title: "Conceptos de ventas manuales", placeholder: "Ej: Venta por encargo" },
];

export function ConceptsManager({ concepts }: { concepts: MovementConcept[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = React.useState<Record<MovementType, string>>({
    gasto: "",
    venta: "",
  });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function handleAdd(type: MovementType) {
    const name = drafts[type].trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    const result = await createConcept(type, name);
    setBusy(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setDrafts((d) => ({ ...d, [type]: "" }));
    router.refresh();
  }

  async function handleDelete(concept: MovementConcept) {
    setBusy(true);
    setError(null);
    const result = await deleteConcept(concept.id, concept.name);
    setBusy(false);
    if (result?.error) setError(result.error);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conceptos de Ventas y Gastos</CardTitle>
        <CardDescription>
          Estos conceptos aparecen en una lista al registrar un movimiento, para no escribirlos cada
          vez. Los movimientos ya registrados conservan el concepto con el que se guardaron.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {SECTIONS.map((section) => {
          const list = concepts.filter((c) => c.type === section.type);
          return (
            <div key={section.type} className="flex flex-col gap-3">
              <p className="font-medium text-brand-ink">{section.title}</p>
              <div className="flex flex-wrap gap-2">
                {list.length === 0 && (
                  <p className="text-sm text-brand-muted">Aún no hay conceptos.</p>
                )}
                {list.map((concept) => (
                  <span
                    key={concept.id}
                    className="inline-flex items-center gap-1 rounded-full border border-brand-border bg-white py-1 pl-3 pr-1 text-sm"
                  >
                    {concept.name}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDelete(concept)}
                      aria-label={`Quitar ${concept.name}`}
                      className="rounded-full p-1 text-brand-muted hover:bg-black/5 hover:text-brand-danger"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <form
                className="flex gap-2 sm:max-w-sm"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleAdd(section.type);
                }}
              >
                <Input
                  placeholder={section.placeholder}
                  value={drafts[section.type]}
                  maxLength={60}
                  onChange={(event) =>
                    setDrafts((d) => ({ ...d, [section.type]: event.target.value }))
                  }
                />
                <Button type="submit" variant="outline" disabled={busy || !drafts[section.type].trim()}>
                  <Plus className="h-4 w-4" />
                  Agregar
                </Button>
              </form>
            </div>
          );
        })}
        {error && <p className="text-sm text-brand-danger">{error}</p>}
      </CardContent>
    </Card>
  );
}
