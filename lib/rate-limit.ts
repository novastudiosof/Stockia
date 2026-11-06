import "server-only";

/**
 * Límite de intentos fallidos de login, en memoria de cada instancia del
 * servidor. No requiere base de datos ni migraciones. En un despliegue
 * serverless cada instancia lleva su propio contador, así que frena la
 * fuerza bruta de forma parcial, no absoluta; si hace falta algo estricto,
 * moverlo a una tabla en Supabase.
 */
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_KEYS = 5000;

interface Entry {
  failures: number;
  firstFailureAt: number;
}

const attempts = new Map<string, Entry>();

function getEntry(key: string, now: number): Entry | undefined {
  const entry = attempts.get(key);
  if (!entry) return undefined;
  if (now - entry.firstFailureAt > WINDOW_MS) {
    attempts.delete(key);
    return undefined;
  }
  return entry;
}

/** Segundos que faltan para poder reintentar, o 0 si aún no está bloqueado. */
export function loginRetryAfterSeconds(key: string): number {
  const now = Date.now();
  const entry = getEntry(key, now);
  if (!entry || entry.failures < MAX_FAILURES) return 0;
  return Math.ceil((entry.firstFailureAt + WINDOW_MS - now) / 1000);
}

export function recordLoginFailure(key: string) {
  const now = Date.now();
  const entry = getEntry(key, now);
  if (entry) {
    entry.failures += 1;
    return;
  }
  // Evita que el mapa crezca sin límite ante muchos intentos distintos.
  if (attempts.size >= MAX_TRACKED_KEYS) {
    const oldest = attempts.keys().next().value;
    if (oldest !== undefined) attempts.delete(oldest);
  }
  attempts.set(key, { failures: 1, firstFailureAt: now });
}

export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
