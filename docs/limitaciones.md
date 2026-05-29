# Limitaciones, Riesgos y Consideraciones Éticas — Fraudy

## Principio Fundamental

> Fraudy es una herramienta de **apoyo al analista**, no un sistema decisor.
> Ninguna alerta debe traducirse en rechazo automático de un siniestro ni en acusación formal.
> **Toda decisión final es responsabilidad del analista humano.**

---

## Limitaciones Técnicas

### Modelo de Anomalías (Isolation Forest)

| Limitación | Impacto | Mitigación |
|------------|---------|------------|
| Entrenado sobre datos sintéticos | Score de anomalía puede no reflejar patrones reales | Reentrenar con casos confirmados de fraude una vez en producción |
| Sin etiquetas de fraude real | No se puede calcular precision/recall real | Usar validación manual con equipo antifraude en fase piloto |
| Sensible a distribución de datos | Cambios en la composición del portafolio pueden degradar el modelo | Monitorear `score_anomalia` medio mensualmente; reentrenar si hay deriva |
| 6 features numéricas solamente | No captura señales cualitativas complejas | Complementado por Rules Engine con 14 señales específicas de dominio |

### Reglas de Negocio

| Limitación | Impacto | Mitigación |
|------------|---------|------------|
| Umbrales fijos | Un caso legítimo puede cruzar umbrales por razones válidas | Analista siempre revisa el detalle; el score es orientativo |
| Dependencia de datos completos | Si faltan campos (placa, dates, narrativa), señales no se activan | Validar completitud en carga; score bajo por datos incompletos no significa bajo riesgo |
| No aprende automáticamente | Nuevos patrones de fraude no detectados hasta actualizar reglas | Revisar reglas trimestralmente con equipo antifraude |

### Similitud de Narrativas

| Limitación | Impacto | Mitigación |
|------------|---------|------------|
| Similitud textual ≠ fraude | Dos accidentes legítimos pueden tener descripciones similares | RF07 es Amarillo, no Rojo; requiere revisión, no conclusión |
| Calidad de embeddings en español | Gemini `gemini-embedding-2` funciona bien en español, pero jerga regional puede afectar | Evaluar con muestras reales en fase piloto |

### Agente LLM

| Limitación | Impacto | Mitigación |
|------------|---------|------------|
| Dependencia de API Gemini | Si la API está caída, chat no funciona | Fallback a OpenAI; scoring por reglas+ML sigue operativo offline |
| Alucinaciones posibles | El agente puede interpretar mal una pregunta ambigua | System prompt estricto + function-calling; el agente consulta BD real |
| Latencia de explicaciones | Gemini puede tardar 3–8 segundos por explicación | Cache en Supabase: `explicacion_agente` se guarda y no se regenera |

---

## Riesgos Éticos y Mitigaciones

| Riesgo | Descripción | Mitigación implementada |
|--------|-------------|------------------------|
| **Sesgo algorítmico** | El modelo podría marcar ciertos segmentos (ciudad, ramo) con mayor frecuencia sin que sea por fraude real | Features usadas son numéricas/temporales, no demográficas. No se usa ciudad, edad, ni nombre. |
| **Falsos positivos** | Un siniestro legítimo clasificado como Rojo puede demorar el pago al asegurado | Todo caso Rojo requiere revisión humana obligatoria antes de cualquier acción. |
| **Mal uso del score** | Usar el score como rechazo automático sin revisión | UI y documentación reiteran que el score es orientativo. El sistema no tiene endpoint de "rechazar siniestro". |
| **Exposición de datos** | Datos del asegurado visibles en dashboard | Dataset es 100% sintético en el prototipo. En producción, aplicar RBAC y anonimización. |
| **Dependencia excesiva en IA** | Analistas podrían dejar de ejercer juicio propio | Diseño deliberado: UI muestra "posible indicador" y siempre presenta el detalle de señales para que el analista evalúe. |

---

## Datos y Privacidad

- El prototipo usa **exclusivamente datos sintéticos**. No se procesó información personal real.
- El dataset `Evento_Datasets_Sinteticos_Fraude_500_v2.xlsx` fue generado con distribuciones estadísticas realistas, sin PII.
- En una implementación real se requeriría: anonimización de `id_asegurado`, cifrado en tránsito (TLS), y cumplimiento de normativa de protección de datos aplicable en Ecuador.

---

## Lo que el sistema NO hace

- ❌ No rechaza siniestros automáticamente.
- ❌ No envía notificaciones a asegurados.
- ❌ No toma decisiones de pago.
- ❌ No acusa a ninguna persona de fraude.
- ❌ No reemplaza el criterio del analista especializado.
- ❌ No accede a datos externos (bureau de crédito, registros vehiculares, etc.) en el prototipo.
