# Reglas de Negocio y Señales de Fraude — Fraudy

## Principio General

El sistema **nunca declara fraude**. Genera alertas de posible riesgo para revisión humana.
Cada señal activada suma puntos al `score_reglas` (0–100). Las Reglas Críticas (RF) pueden forzar clasificación Rojo o Amarillo independientemente del score numérico.

---

## 14 Señales de Riesgo

Implementadas en `src/rules/fraud_rules.py` → función `evaluar_siniestro()`.

| # | Señal | Condición | Puntos |
|---|-------|-----------|--------|
| 1 | **Borde vigencia inicio** | Siniestro ≤ 10 días del inicio de póliza | 8 pts |
| 1 | Borde vigencia inicio (moderado) | Siniestro 11–30 días del inicio | 4 pts |
| 2 | **Borde vigencia fin** | Siniestro ≤ 10 días del vencimiento | 8 pts |
| 2 | Borde vigencia fin (moderado) | Siniestro 11–30 días del vencimiento | 4 pts |
| 3 | **Demora denuncia robo** | Cobertura=Robo y reporte > 48 hrs | 8 pts |
| 3 | Demora denuncia robo (moderada) | Cobertura=Robo y reporte 24–48 hrs | 4 pts |
| 4 | **Alta frecuencia asegurado** | ≥ 3 reclamos previos del asegurado | 8 pts |
| 4 | Frecuencia inusual asegurado | 2 reclamos previos | 4 pts |
| 5 | **Alta frecuencia vehículo** | Placa aparece en ≥ 3 siniestros | 6 pts |
| 5 | Frecuencia vehículo moderada | Placa aparece en 2 siniestros | 3 pts |
| 6 | **Conductor en múltiples asegurados** | Placa asociada a ≥ 3 asegurados distintos | 8 pts |
| 6 | Conductor moderado | Placa en 2 asegurados distintos | 4 pts |
| 7 | **RC sin tercero recurrente** | > 2 eventos previos solo RC | 6 pts |
| 7 | RC sin tercero (uno) | 1 evento previo RC | 3 pts |
| 8 | **Proveedor en lista restrictiva** | `prov_lista_restrictiva = "Sí"` | 10 pts + RF03 |
| 9 | **Documentos incompletos** | `documentos_completos = "No"` | 4 pts |
| 10 | **RC sin parte policial** | RC > 0 y sin `numero_parte_policial` | 5 pts |
| 11 | **Dinámica sospechosa grave nocturna** | Volcadura/frontal/múltiple + nocturno/madrugada en narrativa | 6 pts + RF04 |
| 11 | Dinámica de riesgo simple | Solo grave O solo nocturno | 3 pts |
| 12 | **Inconsistencia documental** | docs_completos=Sí pero narrativa menciona faltantes | 10 pts + RF02 |
| 13 | **Reporte tardío** | Reporte > 7 días desde ocurrencia | 5 pts |
| 13 | Reporte demorado | Reporte 4–7 días | 3 pts |
| 14 | **Narrativas similares** | Similitud coseno > 85% con otro reclamo | 8 pts + RF07 |
| 14 | Similitud moderada | Similitud 70–85% | 4 pts |
| + | **Monto alto vs suma asegurada** | monto_reclamado > 95% de suma_asegurada | 5 pts |

**Score máximo teórico**: ~100 pts (normalizado al rango 0–100).

---

## 7 Reglas Críticas (RF)

Las RF garantizan nivel de riesgo mínimo **independientemente del score numérico**.

| Código | Regla | Trigger | Clasificación |
|--------|-------|---------|--------------|
| **RF01** | Cobertura Pérdida Total por Robo | `cobertura` contiene "Pérdida Total" o "PTxRB" | 🔴 Rojo |
| **RF02** | Falsificación / Adulteración Documental | docs=Sí + narrativa indica faltante (cross-check) | 🔴 Rojo |
| **RF03** | Lista Restrictiva | `prov_lista_restrictiva = "Sí"` | 🔴 Rojo |
| **RF04** | Dinámica Físicamente Imposible | Evento grave nocturno (volcadura+madrugada) | 🔴 Rojo |
| **RF05** | Siniestro al Borde Extremo de Vigencia | `dias_desde_inicio_poliza < 2` | 🟡 Amarillo |
| **RF06** | Demora Atípica en Denuncia de Robo | Cobertura=Robo y días_reporte > 4 | 🟡 Amarillo |
| **RF07** | Narrativa Clonada / Idéntica | Similitud > 85% con otro reclamo | 🟡 Amarillo |

---

## Clasificación Semáforo Final

```
score_final = 0.7 × score_reglas + 0.3 × score_anomalia

Rojo si:    score_final >= 76  ó  cualquier RF Rojo activo
Amarillo si: score_final >= 41  ó  cualquier RF Amarillo activo (y no Rojo)
Verde si:   score_final < 41   y  sin RF activos
```

---

## Lógica de Similitud de Narrativas

1. Al ingresar un siniestro, `descripcion_hechos` se vectoriza con `text-embedding-004` (Gemini).
2. Se calcula similitud coseno contra todos los embeddings previos en pgvector.
3. El máximo (`similitud_narrativa_max`) se almacena en el siniestro.
4. Si > 0.85 → Señal 14 activa + RF07.

---

## Extensibilidad

Para agregar una señal nueva:
1. Agregar lógica en `evaluar_siniestro()` en `src/rules/fraud_rules.py`.
2. Documentar en esta tabla con código, condición y puntos.
3. Si es crítica, agregar flag `rf_critico` o `rf_amarillo` y documentar en tabla RF.
