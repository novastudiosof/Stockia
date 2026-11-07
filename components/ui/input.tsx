"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";

const inputClasses =
  "flex h-10 w-full rounded-[var(--radius-brand-sm)] border border-brand-border bg-white px-3 py-2 text-sm text-brand-ink placeholder:text-brand-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Todo campo type="password" incluye automáticamente el botón de ojo para
 * ver/ocultar lo escrito, así que no hay que repetirlo en cada formulario.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);

    if (type === "password") {
      return (
        <div className="relative w-full">
          <input
            type={visible ? "text" : "password"}
            ref={ref}
            className={cn(inputClasses, "pr-10", className)}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-ink"
            aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            tabIndex={-1}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      );
    }

    return <input type={type} ref={ref} className={cn(inputClasses, className)} {...props} />;
  }
);
Input.displayName = "Input";

export { Input };
