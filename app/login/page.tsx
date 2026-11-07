"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandFooter } from "@/components/brand-footer";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "No se pudo iniciar sesión");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-bg relative flex min-h-screen items-center justify-center px-4">
      <div className="orb orb-violet -left-20 top-10 h-80 w-80" aria-hidden="true" />
      <div className="orb orb-cyan -right-24 bottom-0 h-96 w-96" aria-hidden="true" />
      <div className="login-card animate-rise relative z-10 w-full max-w-sm rounded-[var(--radius-brand-lg)] p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="animate-float rounded-2xl">
            <Image
              src="/brand/logo-icon.png"
              alt="Logo"
              width={72}
              height={72}
              priority
              className="animate-glow rounded-2xl"
            />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-brand-ink">Stockia</h1>
            <p className="text-sm text-brand-muted">Inicia sesión para continuar</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">Usuario</Label>
            <Input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error && (
            <p className="rounded-[var(--radius-brand-sm)] bg-brand-danger/10 px-3 py-2 text-sm text-brand-danger">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Ingresar
          </Button>
        </form>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10">
        <BrandFooter className="text-white/50 [&_a]:text-white/80" />
      </div>
    </main>
  );
}
