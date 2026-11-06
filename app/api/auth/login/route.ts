import { NextResponse } from "next/server";
import { z } from "zod";

import {
  clearLoginFailures,
  loginRetryAfterSeconds,
  recordLoginFailure,
} from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  username: z.string().trim().min(1, "El usuario es obligatorio"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

const INVALID_CREDENTIALS = "Usuario o contraseña incorrectos";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { username, password } = parsed.data;

  // Se limita por usuario+IP y también por usuario solo, para frenar tanto a
  // quien prueba muchas claves desde un sitio como a quien rota de IP.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconocida";
  const userKey = `u:${username.toLowerCase()}`;
  const ipKey = `ip:${ip}:${username.toLowerCase()}`;

  const retryAfter = Math.max(loginRetryAfterSeconds(userKey), loginRetryAfterSeconds(ipKey));
  if (retryAfter > 0) {
    return NextResponse.json(
      {
        error: `Demasiados intentos fallidos. Intenta de nuevo en ${Math.ceil(retryAfter / 60)} minuto(s).`,
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const fail = () => {
    recordLoginFailure(userKey);
    recordLoginFailure(ipKey);
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("auth_email, organization_id")
    .eq("username", username)
    .maybeSingle();

  if (!profile) return fail();

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: profile.auth_email,
    password,
  });

  if (error) return fail();

  // El estado del negocio se revela solo a quien ya acertó la contraseña,
  // para que este endpoint no confirme qué usuarios existen.
  if (profile.organization_id) {
    const { data: org } = await admin
      .from("organizations")
      .select("is_active")
      .eq("id", profile.organization_id)
      .maybeSingle();

    if (org && !org.is_active) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "Este negocio no tiene acceso activo. Contacta al proveedor del sistema." },
        { status: 403 }
      );
    }
  }

  clearLoginFailures(userKey);
  clearLoginFailures(ipKey);
  return NextResponse.json({ ok: true });
}
