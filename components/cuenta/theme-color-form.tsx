"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { updateMyThemeColor } from "@/lib/actions/cuenta";
import { DEFAULT_THEME_COLOR, THEME_PRESETS, isHexColor } from "@/lib/theme";

export function ThemeColorForm({ savedColor }: { savedColor: string | null }) {
  const router = useRouter();
  const saved = isHexColor(savedColor) ? savedColor : DEFAULT_THEME_COLOR;
  const [color, setColor] = React.useState(saved);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateMyThemeColor(
      color.toLowerCase() === DEFAULT_THEME_COLOR.toLowerCase() ? null : color
    );
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apariencia</CardTitle>
        <CardDescription>El color se aplica a toda la interfaz de tu negocio.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Label htmlFor="themeColor">Color de la página</Label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="themeColor"
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-brand-border bg-white p-1"
          />
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={`Usar color ${preset}`}
              onClick={() => setColor(preset)}
              style={{ backgroundColor: preset }}
              className={`h-7 w-7 rounded-full border-2 ${
                color.toLowerCase() === preset.toLowerCase()
                  ? "border-brand-ink"
                  : "border-transparent"
              }`}
            />
          ))}
          <button
            type="button"
            className="text-xs text-brand-muted underline"
            onClick={() => setColor(DEFAULT_THEME_COLOR)}
          >
            Restablecer
          </button>
        </div>
        {error && <p className="text-sm text-brand-danger">{error}</p>}
        <Button
          variant="outline"
          className="self-start"
          onClick={handleSave}
          disabled={saving || color.toLowerCase() === saved.toLowerCase()}
        >
          {saving ? "Guardando..." : "Guardar apariencia"}
        </Button>
      </CardContent>
    </Card>
  );
}
