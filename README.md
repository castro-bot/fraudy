# 🔍 Fraudy — Detector de Posibles Fraudes en Siniestros

## 🌟 Introducción

Bienvenidos a **Fraudy**, nuestro proyecto para el **hackIAthon**. Abordamos el **Reto Aseguradora del Sur**: *Detector de Posibles Fraudes en Siniestros usando Inteligencia Artificial*.

Fraudy es un prototipo funcional que analiza siniestros de seguros y genera un **score de riesgo explicable**, combinando reglas de negocio, detección de anomalías con Machine Learning, análisis semántico de narrativas y un agente conversacional con IA generativa. La solución genera **alertas de revisión**, no acusaciones automáticas de fraude.

---

## 📑 Tabla de Contenidos

1. [Acerca del Proyecto](#-acerca-del-proyecto)
2. [Características Principales](#-características-principales)
3. [Stack Tecnológico](#-stack-tecnológico)
4. [Arquitectura del Sistema](#-arquitectura-del-sistema)
5. [Modelo de IA y Scoring](#-modelo-de-ia-y-scoring)
6. [Señales de Fraude y Reglas de Negocio](#-señales-de-fraude-y-reglas-de-negocio)
7. [Dataset](#-dataset)
8. [Estructura del Proyecto](#-estructura-del-proyecto)
9. [Empezando](#-empezando)
10. [Configuración](#-configuración)
11. [Seguridad y Ética](#-seguridad-y-ética)
12. [Autores](#-autores)

---

## 💡 Acerca del Proyecto

Los analistas de siniestros de Aseguradora del Sur procesan cientos de reclamos bajo presión de tiempo. La detección de fraude depende hoy de la experiencia individual del analista, reglas dispersas y revisiones documentales lentas.

**Fraudy** actúa como el primer nivel de triage: cada siniestro recibe un score de riesgo (0–100), una clasificación semáforo (🟢 Verde / 🟡 Amarillo / 🔴 Rojo), y una explicación en lenguaje natural de qué señales lo activaron. El analista decide; la IA prioriza y fundamenta.

---

## ✨ Características Principales

- 🚨 **Score Híbrido de Riesgo**: Combina 14 señales de reglas de negocio + Isolation Forest (ML) para calcular un puntaje 0–100 por siniestro.
- 🧠 **Agente Explicativo con IA**: Gemini con function-calling responde preguntas en lenguaje natural: *"¿Por qué este siniestro es rojo?"*, *"¿Qué proveedores concentran más alertas?"*.
- 📄 **Análisis de Documentos PDF**: Extrae y analiza facturas, partes policiales y declaraciones de accidente directamente desde archivos adjuntos.
- 🔗 **Red de Relaciones**: Visualización de conexiones entre asegurados, proveedores y siniestros observados para detectar patrones de red.
- 🗣️ **Similitud de Narrativas**: Embeddings de Gemini + pgvector detectan descripciones clonadas o muy similares entre reclamos.
- 📊 **Dashboard de Analista**: Bandeja priorizada por riesgo, filtros, semáforo visual, y vista detallada por siniestro con desglose de alertas.
- 📤 **Carga de Datasets**: Ingesta de archivos XLSX con siniestros, scoring en batch con backfill automático.
- 🔴 **Reglas Críticas (RF)**: 7 reglas que garantizan clasificación Rojo inmediata ante señales graves (pérdida total por robo, falsificación documental, lista restrictiva).

---

## 🛠️ Stack Tecnológico

**Frontend:**
- Next.js 16 (App Router)
- React 19
- Tailwind CSS + Shadcn UI
- Recharts (visualizaciones)
- Fetch nativo (data fetching)

**Backend:**
- Python 3.11+
- FastAPI + Uvicorn
- Supabase Python SDK

**Base de Datos:**
- Supabase (PostgreSQL)
- pgvector (búsqueda semántica de narrativas)

**IA y Modelos:**
- **LLM**: Google Gemini (`gemini-3-flash-preview`) con function-calling
- **Embeddings**: `models/gemini-embedding-2` (Gemini)
- **Anomaly Detection**: Isolation Forest (scikit-learn) + StandardScaler
- **PDF Analysis**: Gemini File Search API

**Infraestructura:**
- Docker + docker-compose
- Vercel (frontend)

---

## 🏗️ Arquitectura del Sistema

```mermaid
flowchart TD
    U[👤 Analista] -->|Dashboard / Chat| FE[Next.js Frontend]
    FE -->|REST API| BE[FastAPI Backend]
    FE -->|SWR cache| FE

    BE -->|Queries| DB[(Supabase\nPostgreSQL + pgvector)]
    BE -->|Evalúa señales| RU[Rules Engine\n14 señales + 7 RF]
    BE -->|Score anomalía| ML[Isolation Forest\nML Model]
    BE -->|Embeddings narrativa| EMB[Gemini Embeddings\ngemini-embedding-2]
    BE -->|Explicaciones / Chat| LLM[Gemini LLM\ngemini-3-flash-preview]
    BE -->|Análisis PDF| PDF[Gemini File Search\nFacturas / Partes / Declaraciones]

    RU -->|score_reglas 0-100| BLEND[Score Híbrido\n70% reglas + 30% anomalía]
    ML -->|score_anomalia 0-100| BLEND
    BLEND -->|score_final| DB

    DB -->|Siniestros + scores| FE
    LLM -->|Explicación NL| FE
```

**Flujo de scoring de un siniestro:**
1. Carga del siniestro (XLSX o API)
2. Rules Engine evalúa 14 señales → `score_reglas`
3. Isolation Forest evalúa 6 features numéricas → `score_anomalia`
4. Blend: `score_final = 0.7 × score_reglas + 0.3 × score_anomalia`
5. Clasificación: Verde (0–40) / Amarillo (41–75) / Rojo (76–100)
6. Gemini genera explicación en lenguaje natural
7. Vectorización de narrativa → almacenada en pgvector para detección de similitud

---

## 🤖 Modelo de IA y Scoring

### Isolation Forest
- **Features**: `monto_reclamado`, `dias_entre_ocurrencia_reporte`, `dias_desde_inicio_poliza`, `reclamos_previos_asegurado`, `ratio_monto_suma`, `similitud_narrativa_max`
- **Contaminación estimada**: 8% (casos anómalos esperados)
- **Estimadores**: 200 árboles, `random_state=42`
- El modelo detecta casos fuera del comportamiento esperado sin necesitar etiquetas de fraude.

### Blend Final
```
score_final = 0.7 × score_reglas + 0.3 × score_anomalia
```
Las reglas aportan trazabilidad y explicabilidad. El ML captura anomalías numéricas no cubiertas por reglas.

### Clasificación Semáforo

| Rango | Nivel | Acción sugerida |
|-------|-------|----------------|
| 0 – 40 | 🟢 Verde — Bajo | Continuar flujo normal |
| 41 – 75 | 🟡 Amarillo — Medio | Escalar a Unidad Antifraude para revisión documental |
| 76 – 100 | 🔴 Rojo — Alto | Escalar a Unidad Antifraude para revisión especializada de campo |

### Agente de IA (Gemini Function Calling)
El agente puede responder en lenguaje natural:
- ¿Cuáles son los 10 siniestros con mayor riesgo?
- ¿Por qué este siniestro fue marcado como rojo?
- ¿Qué proveedores concentran más alertas?
- ¿Qué ramos tienen mayor porcentaje de casos sospechosos?
- Generar resumen ejecutivo de casos críticos.

---

## 🚨 Señales de Fraude y Reglas de Negocio

### 14 Señales de Riesgo (Scoring)

| Señal | Puntos máx. |
|-------|------------|
| Reclamo cercano al borde de vigencia (≤ 30 días) | 8 pts |
| Demora denuncia por robo (> 48 hrs) | 8 pts |
| Alta frecuencia de reclamos — asegurado (≥ 3 en 18 meses) | 8 pts |
| Alta frecuencia de reclamos — vehículo | 6 pts |
| Alta frecuencia — conductor en múltiples siniestros | 8 pts |
| Alta frecuencia reclamos solo RC | 6 pts |
| Beneficiario / proveedor recurrente observado | 10 pts |
| Documentos incompletos | 4 pts |
| Dinámica sospechosa (relato ilógico vs. tipo de impacto) | 6 pts |
| Evento sin tercero identificado | 6 pts |
| Documentos inconsistentes / adulterados | 10 pts |
| Reporte tardío (> 7 días) | 5 pts |
| Narrativas similares (> 85% similitud textual) | 8 pts |
| Monto cercano o superior a suma asegurada | 5 pts |

### 7 Reglas Críticas (Garantizan Rojo inmediato)

| Código | Regla | Clasificación |
|--------|-------|--------------|
| RF01 | Cobertura Pérdida Total por Robo (PTxRB) | 🔴 Rojo |
| RF02 | Evidencia de Falsificación o Adulteración Documental | 🔴 Rojo |
| RF03 | Asegurado / Beneficiario / APS en Lista Restrictiva | 🔴 Rojo |
| RF04 | Dinámica del Accidente Físicamente Imposible | 🔴 Rojo |
| RF05 | Siniestro Extremo al Borde de Vigencia (< 48 hrs) | 🟡 Amarillo |
| RF06 | Demora Atípica en Denuncia de Robo (> 4 días) | 🟡 Amarillo |
| RF07 | Narrativa Idéntica (Clonada) | 🟡 Amarillo |

---

## 📊 Dataset

El proyecto utiliza datos **sintéticos** que simulan la estructura real de siniestros de Aseguradora del Sur. No contienen información personal identificable.

```
data/
├── raw/
│   ├── evento/
│   │   ├── Evento_Datasets_Sinteticos_Fraude_500_v2.xlsx   ← Dataset principal (500 casos)
│   │   ├── declaracion_accidente/    ← PDFs de declaraciones sintéticas
│   │   ├── facturas/                 ← PDFs de facturas sintéticas
│   │   └── parte_policial/           ← PDFs de partes policiales sintéticos
└── synthetic/
    ├── siniestros_seed.csv           ← Datos semilla para Supabase
    └── asegurados_seed.csv
```

**Dataset principal** (`Evento_Datasets_Sinteticos_Fraude_500_v2.xlsx`):
- 500 siniestros sintéticos con distribución realista de tipos de fraude
- Campos: id_siniestro, id_poliza, id_asegurado, ramo, cobertura, fechas, montos, estado, documentos, narrativa, etiqueta_fraude_simulada

---

## 🗄️ Modelado de Datos

El esquema de la base de datos (PostgreSQL / Supabase) se compone de las siguientes tablas principales:

```sql
-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.asegurados_sinteticos (
  id_asegurado text NOT NULL,
  nombre_completo text,
  segmento text,
  ciudad text,
  antiguedad_anios numeric,
  polizas_activas integer,
  reclamos_12_meses integer,
  reclamos_historico integer,
  reclamos_rc_sin_tercero integer,
  perfil_riesgo text,
  CONSTRAINT asegurados_sinteticos_pkey PRIMARY KEY (id_asegurado)
);
CREATE TABLE public.documentos (
  id_documento text NOT NULL,
  id_siniestro text,
  tipo_documento text,
  nombre_archivo text,
  CONSTRAINT documentos_pkey PRIMARY KEY (id_documento),
  CONSTRAINT documentos_id_siniestro_fkey FOREIGN KEY (id_siniestro) REFERENCES public.siniestros(id_siniestro),
  CONSTRAINT fk_documentos_siniestro FOREIGN KEY (id_siniestro) REFERENCES public.siniestros(id_siniestro)
);
CREATE TABLE public.polizas (
  id_poliza text NOT NULL,
  id_asegurado text,
  ramo text,
  fecha_inicio date,
  fecha_fin date,
  suma_asegurada numeric,
  prima_anual numeric,
  canal_venta text,
  estado_poliza text,
  CONSTRAINT polizas_pkey PRIMARY KEY (id_poliza),
  CONSTRAINT polizas_id_asegurado_fkey FOREIGN KEY (id_asegurado) REFERENCES public.asegurados_sinteticos(id_asegurado)
);
CREATE TABLE public.proveedores (
  id_proveedor text NOT NULL,
  nombre_proveedor text,
  tipo text,
  ciudad text,
  n_siniestros_asociados integer,
  en_lista_restrictiva text,
  motivo_restriccion text,
  promedio_monto numeric,
  CONSTRAINT proveedores_pkey PRIMARY KEY (id_proveedor)
);
CREATE TABLE public.siniestros (
  id_siniestro text NOT NULL,
  id_poliza text,
  id_asegurado text,
  ramo text,
  placa_vehiculo text,
  cobertura text,
  fecha_ocurrencia date,
  fecha_reporte date,
  dias_entre_ocurrencia_reporte numeric,
  monto_reclamado numeric,
  monto_estimado numeric,
  monto_pagado numeric,
  estado text,
  sucursal text,
  id_proveedor text,
  descripcion_hechos text,
  documentos_completos text,
  prov_lista_restrictiva text,
  dias_desde_inicio_poliza numeric,
  dias_hasta_fin_poliza numeric,
  reclamos_previos_asegurado numeric,
  suma_asegurada numeric,
  similitud_narrativa_max numeric,
  numero_parte_policial text,
  score_reglas integer,
  nivel_riesgo text,
  alertas jsonb,
  score_anomalia integer,
  embedding_descripcion USER-DEFINED,
  explicacion_agente text,
  pdf_analysis jsonb,
  CONSTRAINT siniestros_pkey PRIMARY KEY (id_siniestro),
  CONSTRAINT siniestros_id_poliza_fkey FOREIGN KEY (id_poliza) REFERENCES public.polizas(id_poliza),
  CONSTRAINT siniestros_id_asegurado_fkey FOREIGN KEY (id_asegurado) REFERENCES public.asegurados_sinteticos(id_asegurado),
  CONSTRAINT siniestros_id_proveedor_fkey FOREIGN KEY (id_proveedor) REFERENCES public.proveedores(id_proveedor),
  CONSTRAINT fk_siniestros_asegurado FOREIGN KEY (id_asegurado) REFERENCES public.asegurados_sinteticos(id_asegurado),
  CONSTRAINT fk_siniestros_poliza FOREIGN KEY (id_poliza) REFERENCES public.polizas(id_poliza),
  CONSTRAINT fk_siniestros_proveedor FOREIGN KEY (id_proveedor) REFERENCES public.proveedores(id_proveedor)
);
```

---

## 📂 Estructura del Proyecto

```text
fraudy-claims/
├── README.md
├── requirements.txt
├── .env.example
├── Dockerfile
├── docker-compose.yml
│
├── data/
│   ├── raw/evento/                   # Dataset Aseguradora del Sur
│   └── synthetic/                    # CSVs semilla
│
├── src/
│   ├── app/main.py                   # FastAPI — endpoints de scoring, upload, chat
│   ├── rules/fraud_rules.py          # 14 señales + 7 reglas RF
│   ├── models/fraud_model.py         # Isolation Forest + blend
│   ├── ai_agent/
│   │   ├── claims_agent.py           # Agente conversacional Gemini
│   │   ├── function_agent.py         # Function-calling tools
│   │   ├── pdf_analyzer.py           # Análisis de PDFs con Gemini
│   │   ├── llm_provider.py           # Abstracción LLM (Gemini / OpenAI fallback)
│   │   └── setup_file_search.py      # Configuración File Search API
│   └── ingestion/
│       ├── load_data.py              # Carga y seed de Supabase
│       ├── backfill_scores.py        # Re-scoring en batch
│       ├── load_official.py          # Carga dataset oficial
│       ├── seed_data.py              # Seed inicial
│       └── vectorize_db.py           # Vectorización de narrativas en pgvector
│
├── app/                              # Next.js App Router
│   ├── page.tsx                      # Dashboard principal
│   ├── siniestros/                   # Lista y detalle de siniestros
│   ├── chat/                         # Chat con el agente de IA
│   ├── red/                          # Red de relaciones
│   ├── nuevo/                        # Carga de nuevo siniestro
│   ├── proveedores/                  # Vista de proveedores
│   └── api/                          # Route handlers (Next.js)
│
├── components/                       # Componentes React (Shadcn UI)
├── tests/                            # Tests de reglas y casos críticos
└── models/                           # Modelos .pkl (Isolation Forest)
```

---

## 🚀 Empezando (Guía de Instalación Local)

Para ejecutar este proyecto en tu máquina local y asegurar que todo funcione correctamente (especialmente útil para validar antes de ir a producción), sigue estos pasos detallados:

### Prerrequisitos
- **Node.js** v18+
- **Python** 3.11+
- **Cuenta en Supabase** (con un proyecto nuevo creado)
- **Google Gemini API Key**

### 1. Clonar e Instalar Dependencias

Abre tu terminal y clona el repositorio:

```bash
git clone https://github.com/drahcirok/fraudy-claims.git
cd fraudy-claims
```

#### Configurar Frontend (Next.js)
```bash
npm install
```

#### Configurar Backend (Python FastAPI)
```bash
# Crear entorno virtual
python -m venv venv

# Activar entorno (Mac/Linux)
source venv/bin/activate
# Activar entorno (Windows - PowerShell)
.\venv\Scripts\Activate

# Instalar dependencias backend
pip install -r requirements.txt
```

### 2. Configurar Base de Datos en Supabase

1. Crea un proyecto en [Supabase](https://supabase.com).
2. Ve al **SQL Editor** en tu proyecto de Supabase.
3. Asegúrate de habilitar la extensión `pgvector` ejecutando:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
4. Ejecuta el esquema SQL documentado en la sección [🗄️ Modelado de Datos](#️-modelado-de-datos) para crear todas las tablas necesarias.

### 3. Configurar Variables de Entorno

Crea el archivo `.env` en la raíz del proyecto. **Ojo:** Si estás desplegando en Vercel u otra plataforma, asegúrate de configurar estas mismas variables allá.

```env
# URL y Claves de Supabase (las encuentras en Project Settings > API)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key

# Google Gemini (Consíguela en Google AI Studio)
GEMINI_API_KEY=tu_gemini_api_key

# OpenAI (Opcional — fallback)
OPENAI_API_KEY=tu_openai_api_key

# Variables públicas para Next.js (Mismos valores que arriba)
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
```

### 4. Carga de Datos y Entrenar Modelos

Antes de correr estos scripts de Python, **es crítico configurar el PYTHONPATH** para que Python reconozca los módulos.

```bash
# Mac/Linux:
export PYTHONPATH=.

# Windows (PowerShell):
$env:PYTHONPATH="."
```

Luego, inicializa la base de datos y entrena el modelo:

```bash
# 1. Sembrar Supabase con los asegurados, pólizas, proveedores y siniestros base
python -m src.ingestion.load_data

# 2. Entrenar el modelo de Machine Learning (Isolation Forest) y guardar el .pkl
python -m src.models.fraud_model

# 3. Calcular el score_final para todos los siniestros insertados (Puede tomar tiempo)
python -m src.ingestion.backfill_scores
```

> **Nota:** Si algún script falla por rate limits de Gemini (HTTP 429), espera unos minutos e inténtalo de nuevo.

### 5. Ejecutar la Aplicación

Deberás correr el Frontend y el Backend simultáneamente en diferentes terminales.

**Terminal 1 (Backend - FastAPI):**
```bash
# Asegúrate de tener el entorno virtual activado y el PYTHONPATH configurado
uvicorn src.app.main:app --reload --port 8000
```
> El backend estará corriendo en `http://localhost:8000`. Puedes revisar que la API responde entrando a `http://localhost:8000/docs`.

**Terminal 2 (Frontend - Next.js):**
```bash
npm run dev
```
> El frontend estará corriendo en `http://localhost:3000`.

---

## 🛠️ Solución de Problemas (Troubleshooting)

- **Errores de importación en Python (`ModuleNotFoundError: No module named 'src'`)**: Olvidaste configurar la variable `PYTHONPATH=.`. Revisa el Paso 4.
- **Problemas en Producción / Vercel**: Asegúrate de que las variables de entorno en tu plataforma de hosting incluyan **todas** las variables, especialmente las `NEXT_PUBLIC_` para que el frontend pueda hablar con Supabase.
- **Error `relation "public.siniestros" does not exist`**: Olvidaste ejecutar el código SQL en el SQL Editor de Supabase (Paso 2).
- **Error conectando a Supabase desde la API**: Verifica que la `SUPABASE_SERVICE_ROLE_KEY` esté configurada, ya que el backend la requiere para tener privilegios de administrador.

---

## 🛡️ Seguridad y Ética

**Privacidad de datos:**
- Solo se usan datos sintéticos. No se procesa información personal real.
- Ningún identificador en el dataset corresponde a personas reales.

**Ética en IA:**
- El sistema genera **alertas de revisión**, nunca acusaciones de fraude.
- Toda decisión final es tomada por un **analista humano**.
- El lenguaje siempre es *"posible indicador"* / *"requiere revisión"*.
- El sistema documenta sus limitaciones: falsos positivos son esperados e inherentes.

**Seguridad técnica:**
- Credenciales gestionadas vía `.env`; nunca en el repositorio.
- CORS configurado en FastAPI.
- Claves API nunca expuestas al frontend.

---

## 👥 Autores

Desarrollado para el **hackIAthon 2026 — Reto Aseguradora del Sur**:

- **Castro Adolfo**
- **Burgos Richard**

Organizado por: **Viamatica** · Co-organizador: **IT ahora**
