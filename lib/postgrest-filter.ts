/**
 * Limpia un término de búsqueda antes de interpolarlo en un filtro
 * `.or(...)` de PostgREST. "," y "(" / ")" tienen significado especial en
 * esa sintaxis (separan condiciones y agrupan); sin esto, un usuario
 * buscando algo como "Pérez, Juan" rompería el filtro completo en vez de
 * simplemente no encontrar coincidencias. No es una medida de seguridad
 * (PostgREST sigue parametrizando la consulta real) — solo evita que la
 * búsqueda falle silenciosamente por caracteres normales de la vida real.
 */
export function sanitizeOrFilterTerm(input: string): string {
  return input.replace(/[,()]/g, "");
}
