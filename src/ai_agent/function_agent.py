"""
Fraudy Function-Calling Agent using Gemini.
Ships 3 core tools + 4 extended tools.
"""
import os
from collections import Counter, defaultdict
from google import genai
from google.genai import types

# ── Tool Declarations ────────────────────────────────────────────────

GET_TOP_RISKY = types.FunctionDeclaration(
    name="get_top_risky",
    description="Obtiene los N siniestros con mayor score de riesgo en la base de datos",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={"n": types.Schema(type=types.Type.INTEGER, description="Número de siniestros a devolver (máx 20)")},
        required=["n"]
    )
)

EXPLAIN_SINIESTRO = types.FunctionDeclaration(
    name="explain_siniestro",
    description="Explica por qué un siniestro fue marcado como alto riesgo, devolviendo sus datos completos y alertas",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={"id_siniestro": types.Schema(type=types.Type.STRING, description="ID del siniestro a explicar")},
        required=["id_siniestro"]
    )
)

TOP_PROVEEDORES = types.FunctionDeclaration(
    name="top_proveedores_alertas",
    description="Devuelve los proveedores con mayor concentración de siniestros de alto riesgo (Rojo/Amarillo)",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={"n": types.Schema(type=types.Type.INTEGER, description="Número de proveedores")},
        required=["n"]
    )
)

ALERTAS_POR_RAMO = types.FunctionDeclaration(
    name="alertas_por_ramo",
    description="Cuenta siniestros Rojo y Amarillo agrupados por ramo de seguro",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={},
        required=[]
    )
)

ALERTAS_POR_CIUDAD = types.FunctionDeclaration(
    name="alertas_por_ciudad",
    description="Ciudades (sucursales) con mayor número de siniestros de alto riesgo",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={"n": types.Schema(type=types.Type.INTEGER, description="Top N ciudades")},
        required=["n"]
    )
)

TOP_ASEGURADOS = types.FunctionDeclaration(
    name="top_asegurados_frecuencia",
    description="Asegurados con mayor historial de reclamos (posibles patrones recurrentes)",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={"n": types.Schema(type=types.Type.INTEGER, description="Top N asegurados")},
        required=["n"]
    )
)

CASOS_SIN_DOCS = types.FunctionDeclaration(
    name="casos_sin_documentos",
    description="Lista de siniestros con documentación incompleta",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={"limit": types.Schema(type=types.Type.INTEGER, description="Límite de resultados")},
        required=[]
    )
)

TOOL = types.Tool(function_declarations=[
    GET_TOP_RISKY,
    EXPLAIN_SINIESTRO,
    TOP_PROVEEDORES,
    ALERTAS_POR_RAMO,
    ALERTAS_POR_CIUDAD,
    TOP_ASEGURADOS,
    CASOS_SIN_DOCS,
])


# ── Tool Implementations ─────────────────────────────────────────────

def run_tool(name: str, args: dict, sb) -> str:
    try:
        if name == "get_top_risky":
            n = min(int(args.get("n", 10)), 20)
            res = sb.table("siniestros").select(
                "id_siniestro,cobertura,ramo,monto_reclamado,nivel_riesgo,score_reglas,sucursal,id_asegurado"
            ).order("score_reglas", desc=True).limit(n).execute()
            return str(res.data)

        if name == "explain_siniestro":
            id_ = args["id_siniestro"]
            res = sb.table("siniestros").select("*").eq("id_siniestro", id_).single().execute()
            return str(res.data)

        if name == "top_proveedores_alertas":
            n = min(int(args.get("n", 5)), 20)
            res = sb.table("siniestros").select("id_proveedor,nivel_riesgo").in_("nivel_riesgo", ["Rojo", "Amarillo"]).execute()
            counts = Counter(r["id_proveedor"] for r in res.data if r.get("id_proveedor"))
            return str(counts.most_common(n))

        if name == "alertas_por_ramo":
            res = sb.table("siniestros").select("ramo,nivel_riesgo").execute()
            agg: dict = defaultdict(lambda: {"rojo": 0, "amarillo": 0, "total": 0})
            for s in res.data:
                r = s.get("ramo") or "Otro"
                agg[r]["total"] += 1
                if s.get("nivel_riesgo") == "Rojo":
                    agg[r]["rojo"] += 1
                elif s.get("nivel_riesgo") == "Amarillo":
                    agg[r]["amarillo"] += 1
            return str(dict(agg))

        if name == "alertas_por_ciudad":
            n = min(int(args.get("n", 5)), 20)
            res = sb.table("siniestros").select("sucursal,nivel_riesgo").in_("nivel_riesgo", ["Rojo", "Amarillo"]).execute()
            counts = Counter(r.get("sucursal") or "Desconocido" for r in res.data)
            return str(counts.most_common(n))

        if name == "top_asegurados_frecuencia":
            n = min(int(args.get("n", 10)), 20)
            res = sb.table("asegurados_sinteticos").select(
                "id_asegurado,nombre_completo,reclamos_historico,reclamos_12_meses,perfil_riesgo"
            ).order("reclamos_historico", desc=True).limit(n).execute()
            return str(res.data)

        if name == "casos_sin_documentos":
            limit = min(int(args.get("limit", 10)), 50)
            res = sb.table("siniestros").select(
                "id_siniestro,ramo,cobertura,monto_reclamado,nivel_riesgo"
            ).eq("documentos_completos", "No").limit(limit).execute()
            return str(res.data)

        return f"Herramienta '{name}' no encontrada."
    except Exception as e:
        return f"Error ejecutando {name}: {e}"


# ── Agent Loop ───────────────────────────────────────────────────────

def chat_with_agent(user_message: str, supabase_client) -> str:
    # --- GEMINI ATTEMPT ---
    try:
        client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])

        rules_text = (
            "Considera estas REGLAS CRÍTICAS (RF-01 a RF-07) al evaluar siniestros:\n"
            "- RF-01: Cobertura es Robo -> Crítico\n"
            "- RF-02: Documentos dice 'Sí' pero la descripción menciona falta de factura o acta -> Crítico\n"
            "- RF-03: Proveedor en lista restrictiva -> Crítico\n"
            "- RF-04: Siniestro grave (volcadura, múltiple) y nocturno -> Crítico\n"
            "- RF-05: Siniestro ocurre con menos de 2 días desde el inicio de la póliza -> Riesgo Amarillo/Crítico\n"
            "- RF-06: Robo con demora de reporte > 4 días -> Riesgo Amarillo\n"
            "- RF-07: Narrativa clonada (similitud alta) -> Riesgo Amarillo\n"
        )

        system = (
            "Eres Fraudy, agente experto en antifraude para Aseguradora del Sur. "
            "NUNCA acuses de fraude directamente. Usa 'posible riesgo', 'anomalía', 'requiere revisión'. "
            "Responde en español. Usa las herramientas disponibles para consultar datos reales.\n\n"
            f"{rules_text}"
        )
        messages = [types.Content(role="user", parts=[types.Part(text=f"{system}\n\n{user_message}")])]

        # Tools configuration
        tools = [TOOL]
        store_name = os.environ.get("GEMINI_FILE_SEARCH_STORE")
        if store_name:
            tools.append(types.Tool(file_search=types.FileSearch(file_search_store_names=[store_name])))

        for _ in range(8):  # max iterations guard
            response = client.models.generate_content(
                model="gemini-3-flash-preview",
                contents=messages,
                config=types.GenerateContentConfig(tools=tools)
            )
            candidate = response.candidates[0]

            if not candidate.content or not candidate.content.parts:
                break

            has_tool_call = any(
                hasattr(p, "function_call") and p.function_call
                for p in candidate.content.parts
            )

            if not has_tool_call:
                return "".join(
                    p.text for p in candidate.content.parts
                    if hasattr(p, "text") and p.text
                )

            # Execute tool calls
            messages.append(candidate.content)
            tool_results = []
            for part in candidate.content.parts:
                if hasattr(part, "function_call") and part.function_call:
                    fc = part.function_call
                    result = run_tool(fc.name, dict(fc.args), supabase_client)
                    tool_results.append(types.Part(
                        function_response=types.FunctionResponse(
                            name=fc.name,
                            response={"result": result}
                        )
                    ))
            messages.append(types.Content(role="tool", parts=tool_results))

        return "No pude obtener una respuesta. Intenta reformular la pregunta."

    except Exception as e:
        print(f"Gemini API failed: {e}. Falling back to OpenAI.")
        # --- OPENAI FALLBACK ---
        import openai
        openai_key = os.environ.get("OPENAI_API_KEY")
        if not openai_key:
            return "El agente Gemini falló y no hay OPENAI_API_KEY configurada para el respaldo."

        try:
            oai_client = openai.OpenAI(api_key=openai_key)
            oai_response = oai_client.chat.completions.create(
                model="gpt-5-nano-2025-08-07",
                messages=[
                    {"role": "system", "content": "Eres Fraudy. " + rules_text},
                    {"role": "user", "content": user_message}
                ]
            )
            return oai_response.choices[0].message.content
        except Exception as oai_error:
            return f"Error en el fallback de OpenAI: {oai_error}"
