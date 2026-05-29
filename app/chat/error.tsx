"use client";

import { MessageSquareOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ChatError(
  { reset }: {
    error: Error & { digest?: string };
    reset: () => void;
  }
) {
  return (
    <div className="flex flex-1 h-full items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--rojo)]/10 border border-[var(--rojo)]/20">
          <MessageSquareOff className="h-8 w-8 text-[var(--rojo)]" />
        </div>
        <h2 className="text-lg font-semibold">Error de conexión</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No se pudo conectar con el agente Fraudy. Verifica tu conexión e intenta de nuevo.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => window.history.back()}>
            Volver
          </Button>
          <Button onClick={reset}>
            Reintentar
          </Button>
        </div>
      </div>
    </div>
  );
}
