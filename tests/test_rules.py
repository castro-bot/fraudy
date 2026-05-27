from src.rules.fraud_rules import evaluar_siniestro

def run_tests():
    # Caso 1: Un siniestro honesto (Debería ser Verde)
    siniestro_normal = {
        "dias_entre_ocurrencia_reporte": 1,
        "monto_reclamado": 1200,
        "cobertura": "Choque"
    }
    asegurado_normal = {
        "reclamos_12_meses": 0
    }
    
    # Caso 2: Un siniestro extremadamente sospechoso (Debería ser Rojo)
    siniestro_sospechoso = {
        "dias_entre_ocurrencia_reporte": 10, # Más de 7 días
        "monto_reclamado": 14500,            # Monto atípico
        "cobertura": "Robo"                  # Regla crítica RF-01 y RF-06
    }
    asegurado_sospechoso = {
        "reclamos_12_meses": 3               # Alta frecuencia
    }

    print("\n--- INICIANDO PRUEBA DEL MOTOR DE REGLAS ---")
    
    # Evaluamos el caso 1
    res_1 = evaluar_siniestro(siniestro_normal, asegurado_normal)
    print(f"\n✅ CASO 1 (Esperado: Verde)")
    print(f"Nivel: {res_1['nivel_riesgo']} | Score: {res_1['score_reglas']}")
    print(f"Alertas: {res_1['alertas']}")

    # Evaluamos el caso 2
    res_2 = evaluar_siniestro(siniestro_sospechoso, asegurado_sospechoso)
    print(f"\n🚨 CASO 2 (Esperado: Rojo)")
    print(f"Nivel: {res_2['nivel_riesgo']} | Score: {res_2['score_reglas']}")
    print("Alertas detectadas:")
    for alerta in res_2['alertas']:
        print(f"  - {alerta}")
        
    print("\n--- PRUEBA FINALIZADA ---\n")

if __name__ == "__main__":
    run_tests()