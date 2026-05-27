def evaluar_siniestro(siniestro: dict, asegurado: dict) -> dict:
    """
    Evalúa un siniestro basado en las reglas de negocio del hackathon.
    Retorna el score calculado, el nivel de riesgo y las alertas generadas.
    """
    score = 0
    alertas = []
    es_critico = False
    es_amarillo = False

    # --- SEÑALES ACUMULATIVAS ---
    
    # Señal: Reporte tardío (Métricas de la tabla del reto)
    dias_reporte = int(siniestro.get("dias_entre_ocurrencia_reporte", 0))
    if dias_reporte > 7:
        score += 5
        alertas.append("Reporte tardío: Demora mayor a 7 días en notificar el evento.")
    elif dias_reporte >= 4:
        score += 3
        alertas.append("Reporte tardío: Demora entre 4 y 7 días en notificar.")

    # Señal: Alta frecuencia de reclamos del asegurado
    reclamos_previos = int(asegurado.get("reclamos_12_meses", 0))
    if reclamos_previos >= 3:
        score += 8
        alertas.append(f"Alta frecuencia: Asegurado presenta {reclamos_previos} reclamos en 12 meses.")
    elif reclamos_previos == 2:
        score += 4
        alertas.append("Frecuencia inusual: Asegurado presenta 2 reclamos en 12 meses.")

    # Señal: Monto atípico (aproximación rápida para la demo)
    monto = float(siniestro.get("monto_reclamado", 0))
    if monto > 12000:
        score += 5
        alertas.append("Monto inusual: El valor reclamado es atípicamente alto para el perfil.")

    # --- REGLAS CRÍTICAS (Overrides) ---
    
    # RF-01: Cobertura Pérdida Total por Robo
    if siniestro.get("cobertura") == "Robo":
        alertas.append("RF-01: Reclamo involucra cobertura de Robo (Requiere revisión rigurosa).")
        es_critico = True
        
    # RF-06: Demora Atípica en Denuncia de Robo (> 4 días)
    if siniestro.get("cobertura") == "Robo" and dias_reporte > 4:
        alertas.append("RF-06: Demora atípica en la denuncia oficial de un evento de robo.")
        es_amarillo = True

    # --- CÁLCULO DE SEMÁFORO ---
    
    # Aplicar los límites de reglas críticas (Hard limits dictados por negocio)
    if es_critico:
        score = max(score, 76)  # Nivel Rojo garantizado
    elif es_amarillo:
        score = max(score, 41)  # Nivel Amarillo garantizado

    # Limitar score máximo a 100
    score = min(score, 100)

    # Determinar el semáforo final según la tabla de riesgos sugerida
    nivel_riesgo = "Verde"
    if score >= 76:
        nivel_riesgo = "Rojo"
    elif score >= 41:
        nivel_riesgo = "Amarillo"

    return {
        "score_reglas": score,
        "nivel_riesgo": nivel_riesgo,
        "alertas": alertas
    }