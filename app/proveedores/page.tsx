"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  AlertTriangle,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface ProveedorAlerta {
  id_proveedor: string;
  nombre_proveedor: string;
  ciudad?: string;
  tipo?: string;
  en_lista_restrictiva: string;
  count_rojo: number;
  count_amarillo: number;
  count_verde: number;
  total_siniestros: number;
  avg_score: number;
  monto_total: number;
}

function formatMXN(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ProveedoresPage() {
  const [data, setData] = useState<ProveedorAlerta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/proveedores/alertas`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--chart-1)]/15">
          <Building2 className="h-5 w-5 text-[var(--chart-1)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Ranking de Proveedores</h1>
          <p className="text-sm text-muted-foreground">
            Concentración de alertas por proveedor — ordenado por siniestros Rojo
          </p>
        </div>
      </div>

      {/* Table */}
      <Card className="border-white/[0.08] bg-white/[0.03]">
        <CardHeader className="pb-3 px-5 pt-4 border-b border-white/[0.06]">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-[var(--chart-1)]" />
            Proveedores con Alertas ({data.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              Cargando datos…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] text-muted-foreground uppercase tracking-wider">
                    <th className="px-5 py-3 text-left">Proveedor</th>
                    <th className="px-4 py-3 text-left">Ciudad</th>
                    <th className="px-4 py-3 text-center">Lista Rest.</th>
                    <th className="px-4 py-3 text-center">🔴 Rojo</th>
                    <th className="px-4 py-3 text-center">🟡 Amarillo</th>
                    <th className="px-4 py-3 text-center">Total</th>
                    <th className="px-4 py-3 text-center">Avg Score</th>
                    <th className="px-4 py-3 text-right">Monto Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p, i) => (
                    <tr
                      key={p.id_proveedor}
                      className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium">{p.nombre_proveedor}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {p.id_proveedor}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.ciudad ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.en_lista_restrictiva === "Sí" ? (
                          <Badge className="border-[var(--rojo)]/40 bg-[var(--rojo)]/15 text-[var(--rojo)] text-[10px]">
                            Sí
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">No</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`font-bold tabular-nums ${
                            p.count_rojo > 0 ? "text-[var(--rojo)]" : "text-muted-foreground"
                          }`}
                        >
                          {p.count_rojo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`font-bold tabular-nums ${
                            p.count_amarillo > 0 ? "text-[var(--amarillo)]" : "text-muted-foreground"
                          }`}
                        >
                          {p.count_amarillo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-muted-foreground">
                        {p.total_siniestros}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-xs font-semibold tabular-nums ${
                            p.avg_score >= 76
                              ? "text-[var(--rojo)]"
                              : p.avg_score >= 41
                              ? "text-[var(--amarillo)]"
                              : "text-[var(--verde)]"
                          }`}
                        >
                          {p.avg_score}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatMXN(p.monto_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
