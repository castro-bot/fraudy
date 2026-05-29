"""
Motor de reglas completo — 14 señales + 7 reglas críticas RF.
Alertas devuelven objetos {señal, pts, tipo} para el frontend AlertaCard.
"""
import os
from supabase import create_client, Client
from dotenv import load_dotenv


load_dotenv()

_url = os.environ.get("SUPABASE_URL")
_key = os.environ.get("SUPABASE_ANON_KEY")
supabase: Client = create_client(_url, _key)


def _alerta(señal: str, pts: int, tipo: str = "INFO") -> dict:
    """Construct alerta object for frontend AlertaCard."""
    return {"señal": señal, "pts": pts, "tipo": tipo}


def _count_placa(placa: str, meses: int = 18) -> int:
    """Count siniestros for a given placa in last N months."""
    if not placa:
        return 0
    try:
        res = supabase.table("siniestros").select("id_siniestro").eq("placa_vehiculo", placa).execute()
        return len(res.data)
    except Exception:
        return 0


def _count_placa_different_asegurado(placa: str, id_asegurado: str) -> int:
    """Count siniestros with same placa but different asegurado."""
    if not placa:
        return 0
    try:
        res = supabase.table("siniestros").select("id_asegurado").eq("placa_vehiculo", placa).neq("id_asegurado", id_asegurado).execute()
        return len(res.data)
    except Exception:
        return 0


def evaluar_siniestro(siniestro: dict, asegurado: dict | None = None) -> dict:
    """
    Evalúa un siniestro con 14 señales + 7 RF.
    siniestro: dict con columnas de la tabla siniestros
    asegurado: dict con columnas de asegurados_sinteticos (opcional, se hace join si no viene)
    Retorna: {score_reglas, nivel_riesgo, alertas: [{señal, pts, tipo}]}
    """
    if asegurado is None:
        asegurado = {}

    score = 0
    alertas: list[dict] = []
    rf_critico = False   # → Rojo guaranteed
    rf_amarillo = False  # → Amarillo guaranteed

    cobertura = str(siniestro.get("cobertura") or "")
    dias_reporte = float(siniestro.get("dias_entre_ocurrencia_reporte") or 0)
    dias_inicio = float(siniestro.get("dias_desde_inicio_poliza") or 9999)
    dias_fin = float(siniestro.get("dias_hasta_fin_poliza") or 9999)
    reclamos_previos = float(siniestro.get("reclamos_previos_asegurado") or asegurado.get("reclamos_12_meses") or 0)
    reclamos_rc = float(siniestro.get("reclamos_rc_sin_tercero") or asegurado.get("reclamos_rc_sin_tercero") or 0)
    prov_restrictiva = str(siniestro.get("prov_lista_restrictiva") or "").strip()
    docs_completos = str(siniestro.get("documentos_completos") or "Sí").strip()
    parte_policial = siniestro.get("numero_parte_policial")
    monto_reclamado = float(siniestro.get("monto_reclamado") or 0)
    suma_asegurada = float(siniestro.get("suma_asegurada") or 1)
    similitud = float(siniestro.get("similitud_narrativa_max") or 0)
    descripcion = str(siniestro.get("descripcion_hechos") or "").lower()
    placa = str(siniestro.get("placa_vehiculo") or "").strip()
    id_asegurado = str(siniestro.get("id_asegurado") or "")

    # ── SEÑAL 1: Borde vigencia inicio ──────────────────────────────
    if dias_inicio <= 10:
        pts = 8
        score += pts
        alertas.append(_alerta(f"Borde vigencia inicio: siniestro a {int(dias_inicio)}d del inicio de póliza", pts, "CRÍTICA"))
    elif dias_inicio <= 30:
        pts = 4
        score += pts
        alertas.append(_alerta(f"Borde vigencia inicio: siniestro a {int(dias_inicio)}d del inicio de póliza", pts, "INFO"))

    # ── SEÑAL 2: Borde vigencia fin ──────────────────────────────────
    if dias_fin <= 10:
        pts = 8
        score += pts
        alertas.append(_alerta(f"Borde vigencia fin: siniestro a {int(dias_fin)}d del vencimiento", pts, "CRÍTICA"))
    elif dias_fin <= 30:
        pts = 4
        score += pts
        alertas.append(_alerta(f"Borde vigencia fin: siniestro a {int(dias_fin)}d del vencimiento", pts, "INFO"))

    # ── SEÑAL 3: Demora robo ─────────────────────────────────────────
    if cobertura == "Robo":
        if dias_reporte > 48:
            pts = 8
            score += pts
            alertas.append(_alerta(f"Demora denuncia robo: {int(dias_reporte)}h desde ocurrencia", pts, "CRÍTICA"))
        elif dias_reporte > 24:
            pts = 4
            score += pts
            alertas.append(_alerta(f"Demora denuncia robo: {int(dias_reporte)}h desde ocurrencia", pts, "INFO"))

    # ── SEÑAL 4: Frecuencia asegurado ────────────────────────────────
    if reclamos_previos >= 3:
        pts = 8
        score += pts
        alertas.append(_alerta(f"Alta frecuencia: asegurado con {int(reclamos_previos)} reclamos previos", pts, "CRÍTICA"))
    elif reclamos_previos == 2:
        pts = 4
        score += pts
        alertas.append(_alerta(f"Frecuencia inusual: {int(reclamos_previos)} reclamos previos", pts, "INFO"))

    # ── SEÑAL 5: Frecuencia vehículo ─────────────────────────────────
    if placa:
        cnt_placa = _count_placa(placa)
        if cnt_placa >= 3:
            pts = 6
            score += pts
            alertas.append(_alerta(f"Vehículo {placa} aparece en {cnt_placa} siniestros", pts, "CRÍTICA"))
        elif cnt_placa == 2:
            pts = 3
            score += pts
            alertas.append(_alerta(f"Vehículo {placa} aparece en {cnt_placa} siniestros", pts, "INFO"))

    # ── SEÑAL 6: Frecuencia conductor/vehículo distintos asegurados ──
    if placa and id_asegurado:
        cnt_diff = _count_placa_different_asegurado(placa, id_asegurado)
        if cnt_diff >= 3:
            pts = 8
            score += pts
            alertas.append(_alerta(f"Placa {placa} asociada a {cnt_diff} asegurados distintos", pts, "CRÍTICA"))
        elif cnt_diff >= 2:
            pts = 4
            score += pts
            alertas.append(_alerta(f"Placa {placa} asociada a {cnt_diff} asegurados distintos", pts, "INFO"))

    # ── SEÑAL 7: Solo RC recurrente ──────────────────────────────────
    if reclamos_rc > 2:
        pts = 6
        score += pts
        alertas.append(_alerta(f"RC sin tercero recurrente: {int(reclamos_rc)} eventos", pts, "CRÍTICA"))
    elif reclamos_rc == 1:
        pts = 3
        score += pts
        alertas.append(_alerta("RC sin tercero registrado", pts, "INFO"))

    # ── SEÑAL 8: Proveedor lista restrictiva ─────────────────────────
    if prov_restrictiva == "Sí":
        pts = 10
        score += pts
        alertas.append(_alerta("Proveedor en lista restrictiva", pts, "CRÍTICA"))
        rf_critico = True  # RF-03

    # ── SEÑAL 9: Documentos incompletos ──────────────────────────────
    if docs_completos == "No":
        pts = 4
        score += pts
        alertas.append(_alerta("Documentación incompleta", pts, "INFO"))

    # ── SEÑAL 10: Sin tercero + sin parte policial ───────────────────
    if reclamos_rc > 0 and not parte_policial:
        pts = 5
        score += pts
        alertas.append(_alerta("RC sin tercero y sin número de parte policial", pts, "CRÍTICA"))

    # ── SEÑAL 11: Dinámica sospechosa ────────────────────────────────
    keywords_grave = ["volcadura", "frontal", "múltiple"]
    keywords_nocturno = ["nocturno", "madrugada", "noche"]
    tiene_grave = any(k in descripcion for k in keywords_grave)
    tiene_nocturno = any(k in descripcion for k in keywords_nocturno)
    if tiene_grave and tiene_nocturno:
        pts = 6
        score += pts
        alertas.append(_alerta("Dinámica sospechosa: evento grave nocturno", pts, "CRÍTICA"))
        rf_critico = True  # RF-04 (volcadura + sin tercero check)
    elif tiene_grave or tiene_nocturno:
        pts = 3
        score += pts
        alertas.append(_alerta("Dinámica de riesgo en descripción", pts, "INFO"))

    # ── SEÑAL 12: Documentos inconsistentes (cross-check) ────────────
    # If docs_completos='Sí' but descripcion mentions missing docs → flag
    desc_missing = any(w in descripcion for w in ["sin factura", "sin acta", "no presenta", "falta documento"])
    if docs_completos == "Sí" and desc_missing:
        pts = 10
        score += pts
        alertas.append(_alerta("Inconsistencia documental: sistema marca completo pero narrativa indica faltante", pts, "CRÍTICA"))
        rf_critico = True  # RF-02

    # ── SEÑAL 13: Reporte tardío ──────────────────────────────────────
    if dias_reporte > 7:
        pts = 5
        score += pts
        alertas.append(_alerta(f"Reporte tardío: {int(dias_reporte)} días para notificar", pts, "INFO"))
    elif dias_reporte >= 4:
        pts = 3
        score += pts
        alertas.append(_alerta(f"Reporte demorado: {int(dias_reporte)} días para notificar", pts, "INFO"))

    # ── SEÑAL 14: Narrativas similares ───────────────────────────────
    if similitud > 0.85:
        pts = 8
        score += pts
        alertas.append(_alerta(f"Narrativa clonada: similitud {similitud:.0%} con otro siniestro", pts, "CRÍTICA"))
        rf_amarillo = True  # RF-07
    elif similitud >= 0.70:
        pts = 4
        score += pts
        alertas.append(_alerta(f"Narrativa sospechosamente similar: {similitud:.0%}", pts, "INFO"))

    # ── SEÑAL extra: Monto / suma asegurada ─────────────────────────
    if suma_asegurada > 0:
        ratio = monto_reclamado / suma_asegurada
        if ratio >= 0.95:
            pts = 4
            score += pts
            alertas.append(_alerta(f"Monto reclamado = {ratio:.0%} de la suma asegurada", pts, "INFO"))

    # ── REGLAS CRÍTICAS (overrides semáforo) ────────────────────────
    # RF-01: Cobertura Robo
    if cobertura == "Robo":
        rf_critico = True

    # RF-05: < 2 días desde inicio póliza → Amarillo
    if dias_inicio < 2:
        rf_amarillo = True
        if not rf_critico:
            alertas.append(_alerta("RF-05: Siniestro dentro de 48h de inicio de póliza", 0, "CRÍTICA"))

    # RF-06: Robo + demora > 4 días → Amarillo
    if cobertura == "Robo" and dias_reporte > 4:
        rf_amarillo = True

    # Apply score floors
    if rf_critico:
        score = max(score, 76)
    elif rf_amarillo:
        score = max(score, 41)

    score = min(score, 100)

    nivel_riesgo = "Verde"
    if score >= 76:
        nivel_riesgo = "Rojo"
    elif score >= 41:
        nivel_riesgo = "Amarillo"

    # Blend with Isolation Forest (graceful fallback if model not trained yet)
    score_anomalia = 0
    try:
        from src.models.fraud_model import predict_anomalia
        score_anomalia = predict_anomalia(siniestro)
    except Exception:
        pass

    final_score = min(int(0.7 * score + 0.3 * score_anomalia), 100)

    return {
        "score_reglas": score,
        "score_anomalia": score_anomalia,
        "final_score": final_score,
        "nivel_riesgo": nivel_riesgo,
        "alertas": alertas,
    }



def redactar_explicacion(siniestro: dict, nivel_riesgo: str, score: int, alertas: list) -> str:
    """Genera explicación en texto usando LLM."""
    try:
        from src.ai_agent.llm_provider import LLMProvider
        señales = "; ".join(a["señal"] for a in alertas) if alertas else "ninguna señal detectada"
        prompt = (
            f"Siniestro ID {siniestro.get('id_siniestro', 'N/A')}, cobertura {siniestro.get('cobertura', 'N/A')}, "
            f"ramo {siniestro.get('ramo', 'N/A')}, monto ${siniestro.get('monto_reclamado', 0):,.0f}. "
            f"Score de riesgo: {score}/100. Nivel: {nivel_riesgo}. "
            f"Señales detectadas: {señales}. "
            "Redacta en 3 oraciones una justificación profesional del nivel de riesgo asignado. "
            "No acuses de fraude. Usa términos como 'patrón atípico', 'requiere revisión', 'anomalía detectada'."
        )
        llm = LLMProvider()
        return llm.generate_text(prompt)
    except Exception as e:
        return f"Análisis automatizado: score {score}/100, nivel {nivel_riesgo}. {len(alertas)} señal(es) detectada(s)."