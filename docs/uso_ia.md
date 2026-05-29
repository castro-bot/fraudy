# Uso de Inteligencia Artificial — Fraudy

## Enfoque Híbrido

Fraudy combina cuatro capas de IA, cada una con un rol específico:

| Capa | Técnica | Herramienta | Propósito |
|------|---------|-------------|-----------|
| **Rules Engine** | Reglas de negocio ponderadas | Python puro | Trazabilidad, señales específicas de dominio |
| **Anomaly Detection** | Isolation Forest (ML no supervisado) | scikit-learn | Detectar outliers numéricos sin etiquetas |
| **NLP / Similaridad** | Embeddings + similitud coseno | Gemini `text-embedding-004` + pgvector | Detectar narrativas clonadas o sospechosamente similares |
| **Agente Explicativo** | LLM con function-calling | Gemini `gemini-2.0-flash` | Explicaciones en lenguaje natural + chat |

---

## 1. Isolation Forest (Detección de Anomalías)

**Archivo**: `src/models/fraud_model.py`

### Features utilizadas (6)

| Feature | Descripción |
|---------|-------------|
| `monto_reclamado` | Valor bruto del reclamo |
| `dias_entre_ocurrencia_reporte` | Demora en reportar |
| `dias_desde_inicio_poliza` | Cercanía al inicio de vigencia |
| `reclamos_previos_asegurado` | Historial del asegurado |
| `ratio_monto_suma` | `monto_reclamado / suma_asegurada` |
| `similitud_narrativa_max` | Similitud coseno con otros reclamos |

### Configuración del modelo

```python
IsolationForest(
    n_estimators=200,
    contamination=0.08,   # 8% de casos esperados como anómalos
    random_state=42
)
```

Pre-procesamiento: `StandardScaler` normaliza todas las features antes del entrenamiento.

### Conversión de score

El `decision_function` de sklearn devuelve valores negativos (anomalía) a positivos (normal). Se convierte a escala 0–100:
```python
if raw_score < 0:
    score_anomalia = min(int(abs(raw_score) * 150 + 40), 100)
else:
    score_anomalia = max(int(20 - raw_score * 80), 0)
```

### Blend final

```
score_final = 0.7 × score_reglas + 0.3 × score_anomalia
```

Las reglas tienen más peso porque son trazables y explicables. El ML complementa capturando combinaciones anómalas que las reglas no cubren.

---

## 2. Similitud de Narrativas (Embeddings + pgvector)

**Archivo**: `src/ai_agent/claims_agent.py`

1. `descripcion_hechos` de cada siniestro se envía a Gemini `text-embedding-004` → vector de 768 dimensiones.
2. Se almacena en la columna `embedding_descripcion` (tipo `vector`) en Supabase.
3. Al ingresar un siniestro nuevo, se consulta pgvector con `<=>` (distancia coseno) para encontrar los k vecinos más cercanos.
4. `similitud_narrativa_max` = máxima similitud encontrada.
5. Si > 0.85 → activa Señal 14 + RF07 (narrativa clonada).

---

## 3. Agente Conversacional (Gemini Function Calling)

**Archivo**: `src/ai_agent/function_agent.py`

El agente responde preguntas en lenguaje natural sobre los datos reales en Supabase. Usa function-calling para evitar alucinaciones: no inventa números, siempre consulta la BD.

### Tools disponibles

| Tool | Descripción |
|------|-------------|
| `get_top_riesgo` | Top N siniestros por score_final |
| `get_siniestro_detalle` | Detalle completo + alertas de un siniestro específico |
| `get_proveedores_alertas` | Ranking de proveedores por concentración de alertas |
| `get_resumen_ejecutivo` | Estadísticas globales: total Rojo/Amarillo/Verde, monto en riesgo |
| `search_siniestros_similares` | Busca siniestros con narrativa similar a un texto dado |

### System prompt (extracto)

```
Eres un asistente especializado en análisis de posibles fraudes en siniestros de seguros.
IMPORTANTE: Solo generas ALERTAS DE REVISIÓN. Nunca acusas a un asegurado de fraude.
Siempre usa lenguaje como "posible indicador", "requiere revisión", "patrón sospechoso".
Cuando respondas sobre datos específicos, DEBES usar las tools disponibles para consultar
la base de datos. No inventes cifras.
```

### Fallback LLM

Si Gemini no está disponible, `src/ai_agent/llm_provider.py` hace fallback a OpenAI GPT-4o con el mismo system prompt y tools.

---

## 4. Análisis de Documentos PDF

**Archivo**: `src/ai_agent/pdf_analyzer.py`

Facturas, partes policiales y declaraciones de accidente se analizan con **Gemini File Search API**:
1. El PDF se sube al File Search Store de Gemini.
2. Gemini extrae: fechas, montos, nombre de taller/médico, inconsistencias detectadas.
3. Si detecta fechas de factura **anteriores** al evento → activa RF02 (adulteración documental).

---

## Limitaciones del Modelo

- **Isolation Forest no tiene etiquetas reales**: entrenado sobre datos sintéticos. En producción, reentrenar periódicamente con casos confirmados de fraude por el equipo antifraude.
- **Falsos positivos esperados**: el sistema está calibrado para alta sensibilidad (recall) sobre precisión. Todo caso Rojo debe pasar por revisión humana.
- **Similitud de narrativas**: captura texto repetido, no intención fraudulenta. Un accidente real puede tener descripción similar a otro sin ser fraude.
- **Dependencia de API externa**: si Gemini no está disponible, las explicaciones LLM y análisis PDF fallan. El scoring por reglas + ML funciona offline.
- **Idioma**: optimizado para español. Narrativas en otro idioma reducen calidad de embeddings.
