"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { createAuxiliar, deleteAuxiliar } from "@/lib/actions/cuenta";
import type { Profile } from "@/lib/supabase/types";

interface AuxiliarManagerProps {
  auxiliares: Profile[];
  maxAuxiliares: number;
}

export function AuxiliarManager({ auxiliares, maxAuxiliares }: AuxiliarManagerProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Profile | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [state, formAction, pending] = useActionState(createAuxiliar, undefined);
  const formRef = React.useRef<HTMLFormElement>(null);
  const atLimit = auxiliares.length >= maxAuxiliares;

  React.useEffect(() => {
    if (state?.success) {
      setOpen(false);
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  async function handleDelete() {
    if (!deleting) return;
    setIsDeleting(true);
    await deleteAuxiliar(deleting.id, deleting.username);
    setIsDeleting(false);
    setDeleting(null);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Usuarios auxiliares</CardTitle>
          <CardDescription>
            {auxiliares.length} de {maxAuxiliares} usados en tu plan.
          </CardDescription>
        </div>
        <Button onClick={() => setOpen(true)} disabled={atLimit}>
          <Plus className="h-4 w-4" />
          Crear auxiliar
        </Button>
      </CardHeader>
      <CardContent>
        {auxiliares.length === 0 ? (
          <p className="text-sm text-brand-muted">Aún no has creado usuarios auxiliares.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-brand-border">
            {auxiliares.map((aux) => (
              <li key={aux.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-brand-ink">{aux.full_name}</p>
                  <p className="text-sm text-brand-muted">@{aux.username}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setDeleting(aux)}>
                  <Trash2 className="h-4 w-4 text-brand-danger" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {atLimit && (
          <p className="mt-3 text-sm text-brand-muted">
            Alcanzaste el límite de usuarios auxiliares de tu plan. Contáctanos si necesitas más.
          </p>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear usuario auxiliar</DialogTitle>
          </DialogHeader>
          <form ref={formRef} action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fullName">Nombre completo</Label>
              <Input id="fullName" name="fullName" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Usuario</Label>
              <Input id="username" name="username" required placeholder="ej: juan.perez" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Contraseña inicial</Label>
              <Input id="password" name="password" type="password" required minLength={8} />
            </div>

            {state?.error && <p className="text-sm text-brand-danger">{state.error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creando..." : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(value) => !value && setDeleting(null)}
        title="Eliminar usuario auxiliar"
        description={`¿Deseas eliminar a "${deleting?.full_name}" (@${deleting?.username})? Perderá el acceso al sistema de inmediato. Esta acción no se puede deshacer.`}
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </Card>
  );
}
