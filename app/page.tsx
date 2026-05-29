"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  TrendingUp,
  DollarSign,
  FileText,
  ArrowRight,
  CheckCircle2,
  X,
  Building2,
  Download,
  PiggyBank,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SemaforoBadge } from "@/components/semaforo-badge";
import { computeStats, computeAlertasPorRamo, computeProveedorRanking } from "@/lib/mock-data";
import { getRamos, getSiniestros, getSiniestrosPage, PAGE_SIZE, getDashboardCache, setDashboardCache } from "@/lib/data";
import type { NivelRiesgo, Siniestro } from "@/lib/data";

function formatMXN(amount: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(amount);
}

const ALL_NIVELES: NivelRiesgo[] = ["rojo", "amarillo", "verde"];

export default function DashboardPage() {
  // ── Data fetching state ──────────────────────────────────
  const [datos, setDatos] = useState<Siniestro[]>(getDashboardCache().siniestros || []);
  const [ramosDisponibles, setRamosDisponibles] = useState<string[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(getDashboardCache().stats?.total || null);

  useEffect(() => {
    // Initial load: first page + total count
    const cache = getDashboardCache();
    if (cache.siniestros && cache.stats) {
      const ramosUnicos = Array.from(new Set(cache.siniestros.map((s) => s.ramo))).sort();
      setRamosDisponibles(ramosUnicos);
      setHasMore(cache.siniestros.length < cache.stats.total);
      return; // Already loaded from cache
    }

    Promise.all([
      getSiniestros(),
      fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001"}/api/stats`)
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null),
    ]).then(([data, stats]) => {
      setDashboardCache(data, stats);
      setDatos(data);
      const ramosUnicos = Array.from(new Set(data.map((s) => s.ramo))).sort();
      setRamosDisponibles(ramosUnicos);
      if (stats?.total) {
        setTotalCount(stats.total);
        setHasMore(data.length < stats.total);
      } else {
        setHasMore(data.length === PAGE_SIZE);
      }
    });
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = await getSiniestrosPage(datos.length);
      if (nextPage.length === 0) {
        setHasMore(false);
        return;
      }
      setDatos((prev) => {
        // De-dupe by id in case of overlap
        const seen = new Set(prev.map((s) => s.id_siniestro));
        const fresh = nextPage.filter((s) => !seen.has(s.id_siniestro));
        const merged = [...prev, ...fresh];
        if (totalCount !== null && merged.length >= totalCount) setHasMore(false);
        if (nextPage.length < PAGE_SIZE) setHasMore(false);
        return merged;
      });
    } finally {
      setLoadingMore(false);
    }
  }, [datos.length, loadingMore, hasMore, totalCount]);

  // ── Filter state ─────────────────────────────────────────
  const [activeNiveles, setActiveNiveles] = useState<Set<NivelRiesgo>>(
    new Set(ALL_NIVELES)
  );
  const [selectedRamo, setSelectedRamo] = useState<string>("todos");
  const [fechaDesde, setFechaDesde] = useState<string>("");
  const [fechaHasta, setFechaHasta] = useState<string>("");

  const hasActiveFilters =
    activeNiveles.size < ALL_NIVELES.length ||
    selectedRamo !== "todos" ||
    fechaDesde !== "" ||
    fechaHasta !== "";

  function toggleNivel(nivel: NivelRiesgo) {
    setActiveNiveles((prev) => {
      const next = new Set(prev);
      if (next.has(nivel)) {
        if (next.size === 1) return prev;
        next.delete(nivel);
      } else {
        next.add(nivel);
      }
      return next;
    });
  }

  function clearFilters() {
    setActiveNiveles(new Set(ALL_NIVELES));
    setSelectedRamo("todos");
    setFechaDesde("");
    setFechaHasta("");
  }

  // ── Filtered + sorted data ───────────────────────────────
  const filtered = useMemo(() => {
    let list = [...datos].sort((a, b) => b.fecha_reporte.localeCompare(a.fecha_reporte));

    if (activeNiveles.size < ALL_NIVELES.length) {
      list = list.filter((s) => activeNiveles.has(s.nivel_riesgo));
    }
    if (selectedRamo !== "todos") {
      list = list.filter((s) => s.ramo === selectedRamo);
    }
    if (fechaDesde) {
      list = list.filter((s) => s.fecha_ocurrencia >= fechaDesde);
    }
    if (fechaHasta) {
      list = list.filter((s) => s.fecha_ocurrencia <= fechaHasta);
    }
    return list;
  }, [datos, activeNiveles, selectedRamo, fechaDesde, fechaHasta]);

  // ── KPIs derived from filtered list ─────────────────────
  const stats = useMemo(() => computeStats(filtered), [filtered]);
  const pctRojo = stats.total > 0 ? Math.round((stats.rojo / stats.total) * 100) : 0;
  const pctAmarillo = stats.total > 0 ? Math.round((stats.amarillo / stats.total) * 100) : 0;

  // ── Derived analytics ──────────────────────────────────
  const alertasPorRamo = useMemo(() => computeAlertasPorRamo(filtered), [filtered]);
  const proveedorRanking = useMemo(() => computeProveedorRanking(filtered), [filtered]);

  function formatMXNShort(amount: number) {
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(amount);
  }

  const ahorroPotencial = useMemo(() => stats.monto_total_riesgo * 0.60, [stats.monto_total_riesgo]);

  const handleCSVExport = useCallback(() => {
    const headers = ["ID","Asegurado","Ramo","Cobertura","Monto Reclamado","Score","Nivel","Fecha Ocurrencia"];
    const rows = filtered.map(s => [
      s.id_siniestro,
      s.nombre_asegurado,
      s.ramo,
      s.cobertura,
      s.monto_reclamado,
      s.final_score,
      s.nivel_riesgo,
      s.fecha_ocurrencia,
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fraudia_siniestros_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bandeja de Siniestros</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Casos ordenados por nivel de riesgo
          </p>
        </div>
        <Button
          id="btn-export-csv"
          variant="outline"
          size="sm"
          onClick={handleCSVExport}
          className="gap-2 border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-xs"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </Button>
      </div>

      {/* KPI cards — clickable semáforo toggles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {/* Total — no toggle, just info */}
        <Card className="border-white/[0.08] bg-white/[0.03]">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Casos
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground/60" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-3xl font-bold">{stats.total}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {hasActiveFilters ? "filtrado" : "en revisión"}
            </p>
          </CardContent>
        </Card>

        {/* Rojo — clickable toggle */}
        <button
          id="filter-toggle-rojo"
          onClick={() => toggleNivel("rojo")}
          className={`text-left rounded-xl border transition-all duration-200 ${
            activeNiveles.has("rojo")
              ? "border-l-2 border-[var(--rojo)]/30 border-l-[var(--rojo)] bg-[var(--rojo)]/5 ring-1 ring-[var(--rojo)]/20"
              : "border-white/[0.04] bg-white/[0.01] opacity-50"
          }`}
        >
          <div className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Riesgo Alto
            </span>
            <AlertTriangle className="h-4 w-4 text-[var(--rojo)]/70" />
          </div>
          <div className="px-4 pb-4">
            <div className="text-3xl font-bold text-[var(--rojo)]">{stats.rojo}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">{pctRojo}% del total</p>
          </div>
        </button>

        {/* Amarillo — clickable toggle */}
        <button
          id="filter-toggle-amarillo"
          onClick={() => toggleNivel("amarillo")}
          className={`text-left rounded-xl border transition-all duration-200 ${
            activeNiveles.has("amarillo")
              ? "border-l-2 border-[var(--amarillo)]/30 border-l-[var(--amarillo)] bg-[var(--amarillo)]/5 ring-1 ring-[var(--amarillo)]/20"
              : "border-white/[0.04] bg-white/[0.01] opacity-50"
          }`}
        >
          <div className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Riesgo Medio
            </span>
            <TrendingUp className="h-4 w-4 text-[var(--amarillo)]/70" />
          </div>
          <div className="px-4 pb-4">
            <div className="text-3xl font-bold text-[var(--amarillo)]">{stats.amarillo}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">{pctAmarillo}% del total</p>
          </div>
        </button>

        {/* Verde — clickable toggle */}
        <button
          id="filter-toggle-verde"
          onClick={() => toggleNivel("verde")}
          className={`text-left rounded-xl border transition-all duration-200 ${
            activeNiveles.has("verde")
              ? "border-l-2 border-[var(--verde)]/30 border-l-[var(--verde)] bg-[var(--verde)]/5 ring-1 ring-[var(--verde)]/20"
              : "border-white/[0.04] bg-white/[0.01] opacity-50"
          }`}
        >
          <div className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Riesgo Bajo
            </span>
            <CheckCircle2 className="h-4 w-4 text-[var(--verde)]/70" />
          </div>
          <div className="px-4 pb-4">
            <div className="text-3xl font-bold text-[var(--verde)]">{stats.verde}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {stats.total > 0 ? Math.round((stats.verde / stats.total) * 100) : 0}% del total
            </p>
          </div>
        </button>

        {/* Ahorro Potencial */}
        <Card className="border-white/[0.08] bg-white/[0.03] sm:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Ahorro Potencial
            </CardTitle>
            <PiggyBank className="h-4 w-4 text-[var(--chart-1)]/70" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-[var(--chart-1)]">
              {formatMXN(ahorroPotencial)}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">60% del monto en riesgo</p>
          </CardContent>
        </Card>
      </div>

      {/* Monto en riesgo + filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Monto */}
        <Card className="border-white/[0.08] bg-white/[0.03] sm:flex-none">
          <CardHeader className="flex flex-row items-center gap-3 py-3 px-4">
            <DollarSign className="h-4 w-4 text-muted-foreground/60 shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Monto en Riesgo
              </p>
              <p className="text-lg font-bold leading-tight">
                {formatMXN(stats.monto_total_riesgo)}
              </p>
            </div>
          </CardHeader>
        </Card>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Ramo filter */}
          <div className="relative">
            <select
              id="filter-ramo"
              value={selectedRamo}
              onChange={(e) => setSelectedRamo(e.target.value)}
              className="appearance-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 pr-7 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-white/20 cursor-pointer hover:bg-white/[0.06] transition-colors [color-scheme:dark]"
            >
              <option className="bg-[#0f111a]" value="todos">Todos los ramos</option>
              {ramosDisponibles.map((r) => (
                <option className="bg-[#0f111a]" key={r} value={r}>{r}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Date from */}
          <input
            id="filter-fecha-desde"
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            placeholder="Desde"
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-white/20 hover:bg-white/[0.06] transition-colors [color-scheme:dark]"
          />

          {/* Date to */}
          <input
            id="filter-fecha-hasta"
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            placeholder="Hasta"
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-white/20 hover:bg-white/[0.06] transition-colors [color-scheme:dark]"
          />

          {/* Clear filters */}
          {hasActiveFilters && (
            <Button
              id="filter-clear"
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
            >
              <X className="h-3 w-3" />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Siniestros table */}
      <Card className="border-white/[0.08] bg-white/[0.03]">
        <CardHeader className="px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Siniestros Prioritarios
            </CardTitle>
            <Badge
              variant="outline"
              className="border-white/[0.08] text-muted-foreground text-[11px]"
            >
              {filtered.length} caso{filtered.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-muted-foreground">
                Aún no hay casos que coincidan con los filtros activos o la base de datos está vacía.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="mt-3 text-xs text-muted-foreground hover:text-foreground"
              >
                Limpiar filtros
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.06] hover:bg-transparent">
                  <TableHead className="pl-6 text-xs text-muted-foreground/70 font-medium uppercase tracking-wider w-[130px]">
                    ID
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wider">
                    Asegurado
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wider hidden md:table-cell">
                    Ramo / Cobertura
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wider text-right hidden sm:table-cell">
                    Monto
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wider text-center w-[90px]">
                    Score
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wider w-[120px]">
                    Semáforo
                  </TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((siniestro) => (
                  <TableRow
                    key={siniestro.id_siniestro}
                    className="border-white/[0.04] hover:bg-white/[0.04] cursor-pointer transition-colors group"
                  >
                    <TableCell className="pl-6">
                      <Link href={`/siniestros/${siniestro.id_siniestro}`} className="block">
                        <span className="font-mono text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                          {siniestro.id_siniestro.split("-")[0].substring(0,8)}...
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/siniestros/${siniestro.id_siniestro}`} className="block">
                        <span className="text-sm font-medium group-hover:text-primary transition-colors">
                          {siniestro.nombre_asegurado}
                        </span>
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          {siniestro.id_asegurado}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Link href={`/siniestros/${siniestro.id_siniestro}`} className="block">
                        <span className="text-sm">{siniestro.ramo}</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          {siniestro.cobertura}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell">
                      <Link href={`/siniestros/${siniestro.id_siniestro}`} className="block">
                        <span className="text-sm tabular-nums">
                          {formatMXN(siniestro.monto_reclamado)}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-center">
                      <Link href={`/siniestros/${siniestro.id_siniestro}`} className="block">
                        <span
                          className="text-lg font-bold tabular-nums"
                          style={{
                            color:
                              siniestro.nivel_riesgo === "rojo"
                                ? "var(--rojo)"
                                : siniestro.nivel_riesgo === "amarillo"
                                ? "var(--amarillo)"
                                : "var(--verde)",
                          }}
                        >
                          {siniestro.final_score}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/siniestros/${siniestro.id_siniestro}`} className="block">
                        <SemaforoBadge nivel={siniestro.nivel_riesgo} />
                      </Link>
                    </TableCell>
                    <TableCell className="pr-4">
                      <Link href={`/siniestros/${siniestro.id_siniestro}`}>
                        <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {/* ── Load more footer ─────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-white/[0.06] px-6 py-3">
          <p className="text-xs text-muted-foreground">
            {totalCount !== null
              ? `Mostrando ${datos.length} de ${totalCount} casos`
              : `${datos.length} casos cargados`}
          </p>
          {hasMore ? (
            <Button
              id="btn-cargar-mas"
              variant="outline"
              size="sm"
              onClick={loadMore}
              disabled={loadingMore}
              className="gap-2 border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-xs"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Cargando...
                </>
              ) : (
                <>Cargar más casos</>
              )}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground/50">Todos los casos cargados</span>
          )}
        </div>
      </Card>

      {/* Analytics grid: Bar chart + Provider ranking */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Alertas por ramo — bar chart */}
        <Card className="border-white/[0.08] bg-white/[0.03] lg:col-span-3">
          <CardHeader className="pb-3 px-5 pt-4 border-b border-white/[0.06]">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-[var(--amarillo)]" />
                Alertas por Ramo
              </CardTitle>
              <Badge variant="outline" className="border-white/[0.08] text-muted-foreground text-[11px]">
                {alertasPorRamo.reduce((s, r) => s + r.total, 0)} señales
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            {alertasPorRamo.length === 0 ? (
              <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                Sin datos para mostrar
              </div>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={alertasPorRamo} barGap={4} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" vertical={false} />
                    <XAxis
                      dataKey="ramo"
                      tick={{ fill: "oklch(1 0 0 / 40%)", fontSize: 12 }}
                      axisLine={{ stroke: "oklch(1 0 0 / 6%)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "oklch(1 0 0 / 40%)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: "oklch(1 0 0 / 4%)" }}
                      contentStyle={{
                        background: "oklch(0.158 0.018 264)",
                        border: "1px solid oklch(1 0 0 / 10%)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        color: "oklch(0.96 0.006 264)",
                      }}
                    />
                    <Bar dataKey="rojo" name="Rojo" radius={[3, 3, 0, 0]} maxBarSize={32} fill="var(--rojo)" />
                    <Bar dataKey="amarillo" name="Amarillo" radius={[3, 3, 0, 0]} maxBarSize={32} fill="var(--amarillo)" />
                    <Bar dataKey="verde" name="Verde" radius={[3, 3, 0, 0]} maxBarSize={32} fill="var(--verde)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Proveedores ranking */}
        <Card className="border-white/[0.08] bg-white/[0.03] lg:col-span-2">
          <CardHeader className="pb-3 px-5 pt-4 border-b border-white/[0.06]">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Proveedores con más Alertas
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {proveedorRanking.length === 0 ? (
              <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                Sin datos para mostrar
              </div>
            ) : (
              <div className="overflow-auto max-h-[280px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/[0.06] hover:bg-transparent">
                      <TableHead className="pl-5 text-[10px] text-muted-foreground/70 font-medium uppercase tracking-wider">
                        Proveedor
                      </TableHead>
                      <TableHead className="text-[10px] text-muted-foreground/70 font-medium uppercase tracking-wider text-right">
                        Alertas
                      </TableHead>
                      <TableHead className="text-[10px] text-muted-foreground/70 font-medium uppercase tracking-wider text-right pr-5">
                        Monto
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proveedorRanking.map((p) => (
                      <TableRow
                        key={p.id_proveedor}
                        className="border-white/[0.04] hover:bg-white/[0.04] transition-colors"
                      >
                        <TableCell className="pl-5">
                          <span className="text-sm font-medium">{p.nombre_proveedor}</span>
                          <span className="block text-[11px] text-muted-foreground font-mono mt-0.5">
                            {p.id_proveedor}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className="text-sm font-bold tabular-nums"
                            style={{
                              color: p.alertas > 3 ? "var(--rojo)" : p.alertas > 1 ? "var(--amarillo)" : "var(--verde)",
                            }}
                          >
                            {p.alertas}
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-5">
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {formatMXNShort(p.monto_total)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}