import {
  MOCK_SINIESTROS,
  computeStats,
  type Siniestro,
  type NivelRiesgo,
  type Stats,
} from "./mock-data";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
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
    final_score: sin.final_score ?? sin.score_reglas ?? 0,
    nivel_riesgo: ((sin.nivel_riesgo || "verde") as string).toLowerCase() as NivelRiesgo,
    alertas_activas,
    // Pass through extra fields for detail page
    explicacion_agente: sin.explicacion_agente,
  } as Siniestro & { explicacion_agente?: string };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getSiniestros(filters: SiniestroFilters = {}): Promise<Siniestro[]> {
  if (USE_API) {
    const params = new URLSearchParams({ limit: "200" });
    const res = await fetch(`${API_URL}/api/siniestros?${params}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Error fetching siniestros");
    const rawData = await res.json();
    const listReal = rawData.map(mapBackendToUI);
    const sorted = listReal.sort((a: Siniestro, b: Siniestro) => b.final_score - a.final_score);
    return applyFilters(sorted, filters);
  }

  const sorted = [...MOCK_SINIESTROS].sort((a, b) => b.final_score - a.final_score);
  return applyFilters(sorted, filters);
}

export async function getSiniestro(id: string): Promise<Siniestro | null> {
  if (USE_API) {
    try {
      const res = await fetch(`${API_URL}/api/siniestros/${id}`, { cache: "no-store" });
      if (!res.ok) return null;
      const raw = await res.json();
      return mapBackendToUI(raw);
    } catch {
      return null;
    }
  }
  return MOCK_SINIESTROS.find((s) => s.id_siniestro === id) ?? null;
}

export async function getStats(filters: SiniestroFilters = {}): Promise<Stats> {
  if (USE_API) {
    try {
      const res = await fetch(`${API_URL}/api/stats`, { cache: "no-store" });
      if (res.ok) {
        const raw = await res.json();
        const siniestros = await getSiniestros(filters);
        const stats = computeStats(siniestros);
        // Enrich with backend monto_expuesto
        return { ...stats, monto_expuesto: raw.monto_expuesto ?? stats.monto_expuesto };
      }
    } catch {
      // fall through to computed stats
    }
  }
  const siniestros = await getSiniestros(filters);
  return computeStats(siniestros);
}

export function getRamos(): string[] {
  return [...new Set(MOCK_SINIESTROS.map((s) => s.ramo))].sort();
}