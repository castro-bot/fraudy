import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export default function GlobalNotFound() {
  return (
    <div className="flex flex-1 h-full items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20">
          <ShieldAlert className="h-8 w-8 text-[var(--amarillo)]" />
        </div>
        <h2 className="text-lg font-semibold">Página no encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          La ruta solicitada no existe en Fraudy. Revisa la URL o vuelve al inicio.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-2.5 text-sm font-medium whitespace-nowrap transition-all hover:bg-primary/80"
          >
            <ArrowLeft className="size-4" />
            Ir a la Bandeja
          </Link>
        </div>
      </div>
    </div>
  );
}
