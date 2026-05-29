import {
  MOCK_SINIESTROS,
  computeStats,
  type Siniestro,
  type NivelRiesgo,
  type Stats,
} from "./mock-data";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";
const USE_API = true;

export type { Siniestro, NivelRiesgo, Stats };

export interface SiniestroFilters {
  niveles?: NivelRiesgo[];
  ramos?: string[];
  fechaDesde?: string;
  fechaHasta?: string;
}

// ─── Client-side filter helper ───────────────────────────────────────────────
function applyFilters(list: Siniestro[], filters: SiniestroFilters): Siniestro[] {
  let result = list;
  if (filters.niveles && filters.niveles.length > 0) {
    result = result.filter((s) => filters.niveles!.includes(s.nivel_riesgo));
  }
  if (filters.ramos && filters.ramos.length > 0) {
    result = result.filter((s) => filters.ramos!.includes(s.ramo));
  }
  if (filters.fechaDesde) {
    result = result.filter((s) => s.fecha_ocurrencia >= filters.fechaDesde!);
  }
  if (filters.fechaHasta) {
    result = result.filter((s) => s.fecha_ocurrencia <= filters.fechaHasta!);
  }
  return result;
}

// ─── Traductor de Datos (Python → TypeScript) ──────────────────────────────
function mapBackendToUI(sin: any): Siniestro {
  // Alertas: support both string[] (legacy) and {señal, pts, tipo}[] (new)
  let alertas_activas: { señal: string; pts: number; tipo?: string }[] = [];
  if (Array.isArray(sin.alertas)) {
    alertas_activas = sin.alertas.map((a: any) =>
      typeof a === "string"
        ? { señal: a, pts: 0 }
        : { señal: a.señal ?? a.signal ?? String(a), pts: a.pts ?? 0, tipo: a.tipo }
    );
  }

  const asegurado = sin.asegurado ?? sin.asegurados_sinteticos ?? {};
  const proveedor = sin.proveedor ?? {};

    const final_score = sin.final_score ?? sin.score_reglas ?? 0;

    const dbNivel = (sin.nivel_riesgo ?? "").toLowerCase();
    let nivel_riesgo: NivelRiesgo =
      dbNivel === "rojo" ? "rojo" :
      dbNivel === "amarillo" ? "amarillo" :
      dbNivel === "verde" ? "verde" :
      final_score >= 76 ? "rojo" :
      final_score >= 41 ? "amarillo" : "verde";

    return {
      id_siniestro: sin.id_siniestro,
      id_asegurado: sin.id_asegurado || "ASE-0000",
      nombre_asegurado: asegurado.nombre_completo || sin.nombre_asegurado || "Asegurado Real",
      ramo: sin.ramo || "Autos",
      cobertura: sin.cobertura || "No especificada",
      fecha_ocurrencia: sin.fecha_ocurrencia || "2024-01-01",
      fecha_reporte: sin.fecha_reporte || "2024-01-01",
      monto_reclamado: sin.monto_reclamado || 0,
      monto_estimado: sin.monto_estimado || (sin.monto_reclamado || 0) * 0.9,
      estado: sin.estado || "En revisión",
      descripcion: sin.descripcion_hechos || sin.descripcion || "Sin descripción proporcionada",
      documentos_completos: (sin.documentos_completos ?? "Sí") === "Sí",
      id_proveedor: sin.id_proveedor || proveedor.id_proveedor || "PRV-REAL",
      nombre_proveedor: proveedor.nombre_proveedor || sin.nombre_proveedor || "Proveedor Registrado",
      dias_desde_inicio_poliza: sin.dias_desde_inicio_poliza ?? 100,
      dias_entre_ocurrencia_reporte: sin.dias_entre_ocurrencia_reporte || 0,
      historial_siniestros_asegurado:
        asegurado.reclamos_12_meses ?? sin.reclamos_previos_asegurado ?? sin.historial_siniestros_asegurado ?? 0,
      rules_score: sin.score_reglas || 0,
      anomaly_score: sin.score_anomalia || 0,
      final_score,
      nivel_riesgo,
    alertas_activas,
    // Pass through extra fields for detail page
    explicacion_agente: sin.explicacion_agente,
    pdf_analysis: typeof sin.pdf_analysis === 'string' ? JSON.parse(sin.pdf_analysis) : sin.pdf_analysis,
  } as Siniestro & { explicacion_agente?: string; pdf_analysis?: any };
}

// ─── Dashboard cache (shared across page navigations) ────────────────────────

let _cachedSiniestros: Siniestro[] | null = null;
let _cachedStats: any = null;

export function getDashboardCache() {
  return { siniestros: _cachedSiniestros, stats: _cachedStats };
}

export function setDashboardCache(siniestros: Siniestro[], stats: any) {
  _cachedSiniestros = siniestros;
  _cachedStats = stats;
}

export function invalidateSiniestrosCache() {
  _cachedSiniestros = null;
  _cachedStats = null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const PAGE_SIZE = 50;

export async function getSiniestros(filters: SiniestroFilters = {}): Promise<Siniestro[]> {
  if (USE_API) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    const res = await fetch(`${API_URL}/api/siniestros?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Error fetching siniestros");
    const rawData = await res.json();
    const listReal = rawData.map(mapBackendToUI);
    const sorted = listReal.sort((a: Siniestro, b: Siniestro) => b.fecha_reporte.localeCompare(a.fecha_reporte));
    return applyFilters(sorted, filters);
  }

  const sorted = [...MOCK_SINIESTROS].sort((a, b) => b.final_score - a.final_score);
  return applyFilters(sorted, filters);
}

/** Fetch a specific page by offset — used by "Load more" button. */
export async function getSiniestrosPage(
  offset: number,
  limit: number = PAGE_SIZE,
): Promise<Siniestro[]> {
  if (!USE_API) return [];
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const res = await fetch(`${API_URL}/api/siniestros?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Error fetching siniestros page");
  const rawData = await res.json();
  return (rawData as any[]).map(mapBackendToUI);
}

export async function getSiniestro(id: string): Promise<Siniestro | null> {
  if (USE_API) {
    const res = await fetch(`${API_URL}/api/siniestros/${id}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Error al cargar el siniestro (${res.status})`);
    const raw = await res.json();
    return mapBackendToUI(raw);
  }
  return MOCK_SINIESTROS.find((s) => s.id_siniestro === id) ?? null;
}

export async function getSiniestroExplicacion(id: string): Promise<string | null> {
  if (USE_API) {
    try {
      const res = await fetch(`${API_URL}/api/siniestros/${id}/explicacion`, { cache: "no-store" });
      if (!res.ok) return null;
      const raw = await res.json();
      return raw.explicacion_agente || null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function getSiniestroPdfAnalysis(id: string): Promise<any | null> {
  if (USE_API) {
    try {
      const res = await fetch(`${API_URL}/api/siniestros/${id}/pdf-analysis`, { cache: "no-store" });
      if (!res.ok) return null;
      const raw = await res.json();
      return typeof raw.pdf_analysis === 'string' ? JSON.parse(raw.pdf_analysis) : raw.pdf_analysis;
    } catch {
      return null;
    }
  }
  return null;
}

export async function getStats(filters: SiniestroFilters = {}): Promise<Stats> {
  // Layer 3: getSiniestros() already fetches siniestros — share that result,
  // enrich with backend monto_expuesto from /api/stats. No double fetch.
  const [siniestros, backendStats] = await Promise.all([
    getSiniestros(filters),
    USE_API
      ? fetch(`${API_URL}/api/stats`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  const stats = computeStats(siniestros);
  if (backendStats?.monto_expuesto != null) {
    return { ...stats, monto_expuesto: backendStats.monto_expuesto } as Stats & { monto_expuesto: number };
  }
  return stats;
}

export function getRamos(): string[] {
  return [...new Set(MOCK_SINIESTROS.map((s) => s.ramo))].sort();
}