import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  ShieldAlert,
  Bot,
  FileText,
  Calendar,
  User,
  Building2,
  Hash,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SemaforoBadge } from "@/components/semaforo-badge";
import { getSiniestro } from "@/lib/data";

type Alerta = { señal: string; pts: number; tipo?: string; detalle?: string };

function formatMXN(amount: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function ScoreGauge({ score, nivel }: { score: number; nivel: string }) {
  const color =
    nivel === "rojo"
      ? "var(--rojo)"
      : nivel === "amarillo"
      ? "var(--amarillo)"
      : "var(--verde)";

  const glowClass =
    nivel === "rojo"
      ? "score-glow-rojo"
      : nivel === "amarillo"
      ? "score-glow-amarillo"
      : "score-glow-verde";

  // SVG ring gauge
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const gap = circumference - filled;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className={`relative flex items-center justify-center rounded-full ${glowClass}`}>
        <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
          {/* Track */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="10"
            className="text-white/[0.06]"
          />
          {/* Filled arc */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeDasharray={`${filled} ${gap}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-4xl font-black tabular-nums leading-none"
            style={{ color }}
          >
            {score}
          </span>
          <span className="text-xs text-muted-foreground mt-1">/ 100</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          Score Final de Riesgo
        </p>
      </div>
    </div>
  );
}

function AlertaCard({ alerta }: { alerta: Alerta }) {
  const isCritica = alerta.tipo === "CRÍTICA";
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
        isCritica
          ? "border-[var(--rojo)]/30 bg-[var(--rojo)]/8"
          : "border-white/[0.06] bg-white/[0.03]"
      }`}
    >
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isCritica ? "bg-[var(--rojo)]/20" : "bg-white/[0.06]"
        }`}
      >
        {isCritica ? (
          <ShieldAlert className="h-3.5 w-3.5 text-[var(--rojo)]" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 text-[var(--amarillo)]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{alerta.señal}</span>
          {isCritica && (
            <Badge className="border-[var(--rojo)]/40 bg-[var(--rojo)]/15 text-[var(--rojo)] text-[10px] px-1.5 py-0">
              CRÍTICA
            </Badge>
          )}
          {alerta.pts > 0 && (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums shrink-0">
              +{alerta.pts} pts
            </span>
          )}
        </div>
        {alerta.detalle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{alerta.detalle}</p>
        )}
      </div>
    </div>
  );
}

function DataRow({ label, value, mono = false }: { label: string; value: string | number | boolean; mono?: boolean }) {
  const displayVal = typeof value === "boolean" ? (value ? "Sí" : "No") : value;
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.05] last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${mono ? "font-mono text-xs" : ""}`}>
        {String(displayVal)}
      </span>
    </div>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SiniestroDetailPage({ params }: PageProps) {
  const { id } = await params;
  const siniestro = await getSiniestro(id);

  if (!siniestro) notFound();

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/"
          className="inline-flex shrink-0 items-center justify-center size-8 mt-0.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-all"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold font-mono">{siniestro.id_siniestro}</h1>
            <SemaforoBadge nivel={siniestro.nivel_riesgo} score={siniestro.final_score} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {siniestro.nombre_asegurado} · {siniestro.ramo} / {siniestro.cobertura}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: Score + Alertas + Explicación */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          {/* Score gauge */}
          <Card className="border-white/[0.08] bg-white/[0.03]">
            <CardContent className="pt-8 pb-6 flex flex-col items-center">
              <ScoreGauge score={siniestro.final_score} nivel={siniestro.nivel_riesgo} />
              <Separator className="my-4 bg-white/[0.06]" />
              <div className="grid grid-cols-2 gap-3 w-full">
                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Reglas</p>
                  <p className="text-xl font-bold mt-0.5">{siniestro.rules_score}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">ML</p>
                  <p className="text-xl font-bold mt-0.5">{siniestro.anomaly_score}</p>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground/60 text-center">
                Final = 70% Reglas + 30% ML
              </p>
            </CardContent>
          </Card>

          {/* Agente explanation */}
          <Card className="border-white/[0.08] bg-white/[0.03]">
            <CardHeader className="pb-3 px-4 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Bot className="h-4 w-4 text-[var(--chart-1)]" />
                Explicación del Agente
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                {(siniestro as any).explicacion_agente ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {(siniestro as any).explicacion_agente}
                  </p>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="shimmer h-3 rounded-full bg-white/[0.06] w-full" />
                      <div className="shimmer h-3 rounded-full bg-white/[0.06] w-4/5" />
                      <div className="shimmer h-3 rounded-full bg-white/[0.06] w-11/12" />
                      <div className="shimmer h-3 rounded-full bg-white/[0.06] w-3/4" />
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground/60 text-center">
                      Análisis pendiente →{" "}
                      <Link href="/chat" className="underline underline-offset-2 hover:text-muted-foreground transition-colors">
                        Abrir Chat
                      </Link>
                    </p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column: Alertas + Datos */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Alertas activas */}
          <Card className="border-white/[0.08] bg-white/[0.03]">
            <CardHeader className="pb-3 px-5 pt-4 border-b border-white/[0.06]">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4 text-[var(--amarillo)]" />
                  Alertas Activas
                </CardTitle>
                <Badge
                  variant="outline"
                  className="border-white/[0.08] text-muted-foreground text-[11px]"
                >
                  {siniestro.alertas_activas.length} señales
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 flex flex-col gap-2">
              {siniestro.alertas_activas.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--verde)]/10">
                    <ShieldAlert className="h-6 w-6 text-[var(--verde)]" />
                  </div>
                  <p className="text-sm text-muted-foreground">Sin señales de alerta detectadas</p>
                </div>
              ) : (
                siniestro.alertas_activas.map((alerta, i) => (
                  <AlertaCard key={i} alerta={alerta} />
                ))
              )}
            </CardContent>
          </Card>

          {/* Datos del siniestro */}
          <Card className="border-white/[0.08] bg-white/[0.03]">
            <CardHeader className="pb-3 px-5 pt-4 border-b border-white/[0.06]">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Datos del Siniestro
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pt-1 pb-4">
              {/* Asegurado & Proveedor */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-4">
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Asegurado
                    </span>
                  </div>
                  <p className="text-sm font-medium">{siniestro.nombre_asegurado}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{siniestro.id_asegurado}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {siniestro.historial_siniestros_asegurado} siniestros previos
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Proveedor
                    </span>
                  </div>
                  <p className="text-sm font-medium">{siniestro.nombre_proveedor}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{siniestro.id_proveedor}</p>
                </div>
              </div>

              {/* Key-value pairs */}
              <div className="space-y-0">
                <DataRow label="Ramo" value={siniestro.ramo} />
                <DataRow label="Cobertura" value={siniestro.cobertura} />
                <DataRow label="Estado" value={siniestro.estado} />
                <DataRow label="Monto reclamado" value={formatMXN(siniestro.monto_reclamado)} />
                <DataRow label="Monto estimado" value={formatMXN(siniestro.monto_estimado)} />
                <DataRow label="Fecha ocurrencia" value={siniestro.fecha_ocurrencia} />
                <DataRow label="Fecha reporte" value={siniestro.fecha_reporte} />
                <DataRow
                  label="Días ocurrencia → reporte"
                  value={`${siniestro.dias_entre_ocurrencia_reporte} días`}
                />
                <DataRow
                  label="Días desde inicio de póliza"
                  value={`${siniestro.dias_desde_inicio_poliza} días`}
                />
                <DataRow
                  label="Documentos completos"
                  value={siniestro.documentos_completos}
                />
              </div>

              {/* Descripción */}
              <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Descripción del Siniestro
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {siniestro.descripcion}
                </p>
              </div>

              {/* Timeline */}
              <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Cronología
                  </span>
                </div>
                <div className="relative pl-5 border-l border-white/[0.08] space-y-3">
                  <div className="relative">
                    <div className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-white/20" />
                    <p className="text-[11px] text-muted-foreground">{siniestro.fecha_ocurrencia}</p>
                    <p className="text-xs font-medium">Fecha de ocurrencia</p>
                  </div>
                  <div className="relative">
                    <div className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-white/20" />
                    <p className="text-[11px] text-muted-foreground">{siniestro.fecha_reporte}</p>
                    <p className="text-xs font-medium">Fecha de reporte</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
