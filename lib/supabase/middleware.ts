import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // /factura/<token> es la factura compartida por WhatsApp: el token es un
  // UUID aleatorio, así que el cliente la ve sin iniciar sesión.
  const isPublicPath =
    pathname === "/login" ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/factura/");

  if (!user && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (user && !isPublicPath) {
    // Una sola consulta: rol + estado del negocio (RLS deja leer la propia
    // organización). Si falla la consulta no se bloquea a nadie.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, organizations(is_active)")
      .eq("id", user.id)
      .single();

    const org = profile?.organizations as unknown as
      | { is_active: boolean }
      | { is_active: boolean }[]
      | null
      | undefined;
    const isActive = Array.isArray(org) ? org[0]?.is_active : org?.is_active;

    // Negocio desactivado: se cierra la sesión que ya estuviera abierta.
    if (profile && profile.role !== "super_admin" && isActive === false) {
      await supabase.auth.signOut();
      const redirect = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    }

    if (pathname.startsWith("/superadmin") && profile?.role !== "super_admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return response;
}
