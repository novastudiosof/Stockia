/** Utilidades del color principal que cada organización puede elegir. */
export const DEFAULT_THEME_COLOR = "#F59E0B";

export const THEME_PRESETS = [
  "#F59E0B",
  "#2563EB",
  "#16A34A",
  "#DC2626",
  "#7C3AED",
  "#0891B2",
  "#DB2777",
  "#EA580C",
];

export function isHexColor(value: string | null | undefined): value is string {
  return !!value && /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Oscurece un color hex mezclándolo con negro (amount de 0 a 1). */
export function darken(hex: string, amount = 0.15): string {
  const channel = (start: number) =>
    Math.max(0, Math.round(parseInt(hex.slice(start, start + 2), 16) * (1 - amount)));
  return `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, "0")).join("")}`;
}
