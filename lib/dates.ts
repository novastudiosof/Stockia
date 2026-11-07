/**
 * Fechas en hora de Colombia (UTC-5, sin horario de verano). Todos los
 * "días" del sistema (cierre de caja, informes) se miden en esa zona.
 */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(value: string | null | undefined): value is string {
  return !!value && DAY_RE.test(value);
}

/** Día de hoy en Colombia como YYYY-MM-DD. */
export function todayBogota(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(now);
}

/** Primer día del mes actual en Colombia. */
export function monthStartBogota(now: Date = new Date()): string {
  return `${todayBogota(now).slice(0, 8)}01`;
}

/** Inicio del día (00:00 hora Colombia) como timestamp con zona. */
export function dayStart(day: string): string {
  return `${day}T00:00:00-05:00`;
}

/** Fin del día (23:59:59.999 hora Colombia) como timestamp con zona. */
export function dayEnd(day: string): string {
  return `${day}T23:59:59.999-05:00`;
}
