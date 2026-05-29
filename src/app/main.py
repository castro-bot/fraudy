from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
import os
from supabase import create_client, Client
from dotenv import load_dotenv
from src.rules.fraud_rules import evaluar_siniestro, redactar_explicacion
from typing import Optional
from collections import Counter, defaultdict
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI(title="Fraudy API - Aseguradora del Sur")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_ANON_KEY")
if not url or not key:
    raise RuntimeError("Faltan las credenciales de Supabase en el .env")

supabase: Client = create_client(url, key)


class NuevoSiniestroRequest(BaseModel):
    dias_entre_ocurrencia_reporte: int
    monto_reclamado: float
    cobertura: str
    reclamos_12_meses: int
    descripcion: str = ""


class ChatMessage(BaseModel):
    message: str


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Backend de Fraudy corriendo al 100%"}


@app.get("/api/siniestros")
def listar_siniestros_priorizados(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    nivel: Optional[str] = Query(default=None),
    ramo: Optional[str] = Query(default=None),
):
    """
    Bandeja semáforo. Soporta paginación y filtros: ?limit=20&offset=0&nivel=Rojo&ramo=Vehículos
    Uses nested join (PostgREST FK) to avoid N+1 asegurado queries.
    Falls back to separate query if FK not available.
    """
    try:
        # Exclude heavy columns: embedding_descripcion (~6KB/row), pdf_analysis, explicacion_agente
        LIGHT_COLS = (
            "id_siniestro,id_asegurado,id_proveedor,id_poliza,"
            "ramo,cobertura,estado,fecha_ocurrencia,fecha_reporte,"
            "monto_reclamado,monto_estimado,descripcion_hechos,"
            "documentos_completos,dias_desde_inicio_poliza,"
            "dias_entre_ocurrencia_reporte,sucursal,"
            "score_reglas,score_anomalia,nivel_riesgo,alertas,"
            "placa_vehiculo,prov_lista_restrictiva,numero_parte_policial,"
            "suma_asegurada,similitud_narrativa_max,dias_hasta_fin_poliza,"
            "reclamos_previos_asegurado"
        )
        ASE_COLS = "id_asegurado,nombre_completo,reclamos_12_meses,reclamos_historico,perfil_riesgo,reclamos_rc_sin_tercero"

        # Layer 2: nested join — requires FK constraint on siniestros.id_asegurado
        try:
            query = supabase.table("siniestros").select(
                f"{LIGHT_COLS}, asegurados_sinteticos({ASE_COLS})"
            ).order("fecha_reporte", desc=True)
            if nivel:
                query = query.eq("nivel_riesgo", nivel)
            if ramo:
                query = query.eq("ramo", ramo)
            query = query.range(offset, offset + limit - 1)
            res = query.execute()
            # If nested join worked, asegurados_sinteticos is already embedded
            use_nested = True
        except Exception:
            # Fallback: separate query
            query = supabase.table("siniestros").select(LIGHT_COLS).order("fecha_reporte", desc=True)
            if nivel:
                query = query.eq("nivel_riesgo", nivel)
            if ramo:
                query = query.eq("ramo", ramo)
            query = query.range(offset, offset + limit - 1)
            res = query.execute()
            use_nested = False

        if not use_nested:
            asegurado_ids = list({s["id_asegurado"] for s in res.data if s.get("id_asegurado")})
            res_ase = supabase.table("asegurados_sinteticos").select(ASE_COLS).in_("id_asegurado", asegurado_ids).execute() if asegurado_ids else type("R", (), {"data": []})()
            ase_dict = {a["id_asegurado"]: a for a in res_ase.data}
        else:
            ase_dict = {}

        resultados = []
        for sin in res.data:
            if use_nested:
                asegurado = sin.get("asegurados_sinteticos") or {}
            else:
                asegurado = ase_dict.get(sin.get("id_asegurado") or "", {})
            # Re-evaluate if no score yet in DB
            if not sin.get("score_reglas"):
                evaluacion = evaluar_siniestro(sin, asegurado)
                sin = {**sin, **evaluacion}
            else:
                if "final_score" not in sin:
                    sr = sin.get("score_reglas") or 0
                    sa = sin.get("score_anomalia") or 0
                    sin["final_score"] = min(int(0.7 * sr + 0.3 * sa), 100)
            sin["asegurados_sinteticos"] = asegurado
            resultados.append(sin)

        return resultados
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/siniestros/{id}")
def get_siniestro_detail(id: str):
    """Full siniestro detail: JOIN asegurado+poliza+proveedor+docs + rules eval + AI explanation (cached) + top 3 similares."""
    try:
        # Layer 2: 1 nested join instead of 5 sequential queries
        # Requires FK constraints. Falls back to sequential if FKs absent.
        try:
            res = supabase.table("siniestros").select(
                "*, asegurados_sinteticos(*), polizas(*), proveedores(*), documentos(*)"
            ).eq("id_siniestro", id).single().execute()
            sin = res.data
            asegurado = sin.pop("asegurados_sinteticos", None) or {}
            poliza = sin.pop("polizas", None) or {}
            proveedor = sin.pop("proveedores", None) or {}
            docs = sin.pop("documentos", None) or []
        except Exception:
            # Fallback: sequential queries
            res = supabase.table("siniestros").select("*").eq("id_siniestro", id).execute()
            if not res.data:
                raise HTTPException(status_code=404, detail="Siniestro not found")
            sin = res.data[0]

            asegurado = {}
            if sin.get("id_asegurado"):
                r = supabase.table("asegurados_sinteticos").select("*").eq("id_asegurado", sin["id_asegurado"]).execute()
                asegurado = r.data[0] if r.data else {}

            poliza = {}
            if sin.get("id_poliza"):
                r = supabase.table("polizas").select("*").eq("id_poliza", sin["id_poliza"]).execute()
                poliza = r.data[0] if r.data else {}

            proveedor = {}
            if sin.get("id_proveedor"):
                r = supabase.table("proveedores").select("*").eq("id_proveedor", sin["id_proveedor"]).execute()
                proveedor = r.data[0] if r.data else {}

            r = supabase.table("documentos").select("*").eq("id_siniestro", id).execute()
            docs = r.data or []

        # Rules evaluation
        # Only evaluate if missing from DB to maintain consistency with the dashboard
        if not sin.get("score_reglas"):
            evaluacion = evaluar_siniestro(sin, asegurado)
        else:
            sr = sin.get("score_reglas") or 0
            sa = sin.get("score_anomalia") or 0
            final_score = min(int(0.7 * sr + 0.3 * sa), 100)
            evaluacion = {
                "score_reglas": sr,
                "score_anomalia": sa,
                "final_score": final_score,
                "nivel_riesgo": sin.get("nivel_riesgo") or "Verde",
                "alertas": sin.get("alertas") or [],
            }

        # Top 3 similares via RPC (if embedding available)
        similares = []
        if sin.get("embedding_descripcion"):
            try:
                r = supabase.rpc("match_siniestros", {
                    "query_embedding": sin["embedding_descripcion"],
                    "match_threshold": 0.70,
                    "match_count": 4,
                }).execute()
                similares = [s for s in (r.data or []) if s.get("id_siniestro") != id][:3]
            except Exception:
                pass

        # Only use cached values for AI to avoid blocking the main endpoint
        explicacion = sin.get("explicacion_agente")
        pdf_analysis = sin.get("pdf_analysis")

        return {
            **sin,
            **evaluacion,
            "asegurado": asegurado,
            "poliza": poliza,
            "proveedor": proveedor,
            "documentos": docs,
            "explicacion_agente": explicacion,
            "similares": similares,
            "pdf_analysis": pdf_analysis,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/siniestros/{id}/explicacion")
def get_siniestro_explicacion(id: str):
    """Generates or retrieves the AI explanation for a siniestro."""
    try:
        res = supabase.table("siniestros").select("*").eq("id_siniestro", id).single().execute()
        sin = res.data
        if not sin:
            raise HTTPException(status_code=404, detail="Siniestro not found")

        explicacion = sin.get("explicacion_agente")
        if explicacion:
            return {"explicacion_agente": explicacion}

        # Need asegurado for rules eval
        asegurado = {}
        if sin.get("id_asegurado"):
            r = supabase.table("asegurados_sinteticos").select("*").eq("id_asegurado", sin["id_asegurado"]).execute()
            asegurado = r.data[0] if r.data else {}

        if not sin.get("score_reglas"):
            evaluacion = evaluar_siniestro(sin, asegurado)
        else:
            evaluacion = {
                "score_reglas": sin.get("score_reglas") or 0,
                "nivel_riesgo": sin.get("nivel_riesgo") or "Verde",
                "alertas": sin.get("alertas") or [],
            }

        explicacion = redactar_explicacion(
            siniestro=sin,
            nivel_riesgo=evaluacion["nivel_riesgo"],
            score=evaluacion["score_reglas"],
            alertas=evaluacion["alertas"],
        )
        try:
            supabase.table("siniestros").update(
                {"explicacion_agente": explicacion}
            ).eq("id_siniestro", id).execute()
        except Exception:
            pass

        return {"explicacion_agente": explicacion}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/siniestros/{id}/pdf-analysis")
def get_siniestro_pdf_analysis(id: str):
    """Generates or retrieves the PDF multimodal analysis for a siniestro."""
    try:
        res = supabase.table("siniestros").select("*, documentos(*)").eq("id_siniestro", id).single().execute()
        sin = res.data
        if not sin:
            raise HTTPException(status_code=404, detail="Siniestro not found")

        pdf_analysis = sin.get("pdf_analysis")
        if pdf_analysis:
            return {"pdf_analysis": pdf_analysis}

        from src.ai_agent.pdf_analyzer import analyze_siniestro_pdf
        pdf_analysis = analyze_siniestro_pdf(sin)
        
        if pdf_analysis:
            try:
                supabase.table("siniestros").update(
                    {"pdf_analysis": pdf_analysis}
                ).eq("id_siniestro", id).execute()
            except Exception:
                pass
                
        return {"pdf_analysis": pdf_analysis}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stats")
def get_stats():
    """KPI cards: totales, monto_expuesto, alertas_por_ramo, top_ciudades, top_proveedores."""
    try:
        res = supabase.table("siniestros").select(
            "id_siniestro,nivel_riesgo,monto_reclamado,ramo,sucursal,id_proveedor,score_reglas"
        ).execute()
        data = res.data or []

        total = len(data)
        por_nivel: dict[str, int] = Counter(s["nivel_riesgo"] or "Verde" for s in data)
        monto_expuesto = sum(
            float(s["monto_reclamado"] or 0)
            for s in data
            if (s.get("nivel_riesgo") or "Verde") in ("Rojo", "Amarillo")
        )

        # Alertas por ramo
        ramo_counts: dict[str, dict] = defaultdict(lambda: {"total": 0, "rojo": 0, "amarillo": 0})
        for s in data:
            r = s.get("ramo") or "Otro"
            ramo_counts[r]["total"] += 1
            if (s.get("nivel_riesgo") or "Verde") == "Rojo":
                ramo_counts[r]["rojo"] += 1
            elif (s.get("nivel_riesgo") or "Verde") == "Amarillo":
                ramo_counts[r]["amarillo"] += 1
        alertas_por_ramo = [{"ramo": k, **v} for k, v in ramo_counts.items()]

        # Top ciudades (sucursal) by rojo count
        ciudad_counts: dict[str, int] = Counter()
        for s in data:
            if (s.get("nivel_riesgo") or "Verde") == "Rojo":
                ciudad_counts[s.get("sucursal") or "Desconocido"] += 1
        top_ciudades = [{"ciudad": k, "count_rojo": v} for k, v in ciudad_counts.most_common(5)]

        # Top proveedores by alert count
        prov_counts: dict[str, int] = Counter()
        for s in data:
            if (s.get("nivel_riesgo") or "Verde") in ("Rojo", "Amarillo"):
                if s.get("id_proveedor"):
                    prov_counts[s["id_proveedor"]] += 1
        top_proveedores = [{"id_proveedor": k, "count_alertas": v} for k, v in prov_counts.most_common(10)]

        return {
            "total": total,
            "por_nivel": dict(por_nivel),
            "monto_expuesto": monto_expuesto,
            "alertas_por_ramo": alertas_por_ramo,
            "top_ciudades": top_ciudades,
            "top_proveedores": top_proveedores,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/proveedores/alertas")
def get_proveedores_alertas():
    """Proveedores ranking: count siniestros por nivel, avg score."""
    try:
        res_sin = supabase.table("siniestros").select(
            "id_proveedor,nivel_riesgo,score_reglas,monto_reclamado"
        ).execute()
        res_prov = supabase.table("proveedores").select("*").execute()
        prov_info = {p["id_proveedor"]: p for p in (res_prov.data or [])}

        agg: dict[str, dict] = defaultdict(lambda: {
            "count_rojo": 0, "count_amarillo": 0, "count_verde": 0,
            "total": 0, "scores": [], "monto_total": 0.0
        })
        for s in (res_sin.data or []):
            pid = s.get("id_proveedor")
            if not pid:
                continue
            nivel = s.get("nivel_riesgo") or "Verde"
            agg[pid]["total"] += 1
            agg[pid][f"count_{nivel.lower()}"] += 1
            if s.get("score_reglas"):
                agg[pid]["scores"].append(s["score_reglas"])
            agg[pid]["monto_total"] += float(s.get("monto_reclamado") or 0)

        result = []
        for pid, stats in agg.items():
            info = prov_info.get(pid, {})
            avg_score = round(sum(stats["scores"]) / len(stats["scores"]), 1) if stats["scores"] else 0
            result.append({
                "id_proveedor": pid,
                "nombre_proveedor": info.get("nombre_proveedor", pid),
                "ciudad": info.get("ciudad"),
                "tipo": info.get("tipo"),
                "en_lista_restrictiva": info.get("en_lista_restrictiva", "No"),
                "count_rojo": stats["count_rojo"],
                "count_amarillo": stats["count_amarillo"],
                "count_verde": stats["count_verde"],
                "total_siniestros": stats["total"],
                "avg_score": avg_score,
                "monto_total": round(stats["monto_total"], 2),
            })

        result.sort(key=lambda x: x["count_rojo"], reverse=True)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/asegurados/frecuencia")
def get_asegurados_frecuencia():
    """Top 10 asegurados by reclamos_previos + nombre."""
    try:
        res = supabase.table("asegurados_sinteticos").select(
            "id_asegurado,nombre_completo,reclamos_12_meses,reclamos_historico,perfil_riesgo,segmento,ciudad"
        ).order("reclamos_historico", desc=True).limit(10).execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/red")
def get_red():
    """Relation network: nodes (asegurados + proveedores) + edges (siniestros)."""
    try:
        res = supabase.table("siniestros").select(
            "id_siniestro,id_asegurado,id_proveedor,nivel_riesgo,ramo"
        ).execute()
        data = res.data or []

        nodes: dict[str, dict] = {}
        edges = []

        for s in data:
            aid = s.get("id_asegurado")
            pid = s.get("id_proveedor")
            nivel = (s.get("nivel_riesgo") or "Verde").lower()

            if aid and aid not in nodes:
                nodes[aid] = {"id": aid, "label": aid, "tipo": "asegurado", "nivel": nivel}
            if pid and pid not in nodes:
                nodes[pid] = {"id": pid, "label": pid, "tipo": "proveedor", "nivel": nivel}
            if aid and pid:
                edges.append({"source": aid, "target": pid, "id_siniestro": s["id_siniestro"]})

        return {"nodes": list(nodes.values()), "edges": edges}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/evaluar")
def evaluar_nuevo_siniestro(request: NuevoSiniestroRequest):
    siniestro = {
        "dias_entre_ocurrencia_reporte": request.dias_entre_ocurrencia_reporte,
        "monto_reclamado": request.monto_reclamado,
        "cobertura": request.cobertura,
        "descripcion_hechos": request.descripcion,
    }
    asegurado = {"reclamos_12_meses": request.reclamos_12_meses}

    resultado = evaluar_siniestro(siniestro, asegurado)
    explicacion_ia = redactar_explicacion(
        siniestro=siniestro,
        nivel_riesgo=resultado["nivel_riesgo"],
        score=resultado["score_reglas"],
        alertas=resultado["alertas"],
    )
    resultado["explicacion_agente"] = explicacion_ia
    return resultado


@app.post("/api/chat")
def chat_con_agente(request: ChatMessage):
    """Chat UI — delegates to function_calling agent."""
    try:
        from src.ai_agent.function_agent import chat_with_agent
        respuesta = chat_with_agent(request.message, supabase)
        return {"response": respuesta}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """Uploads an Excel file, processes it, and persists it to Supabase immediately."""
    import tempfile
    import openpyxl
    from src.ingestion.load_official import SHEET_MAP, load_sheet
    
    try:
        if not file.filename.endswith(".xlsx"):
            raise HTTPException(status_code=400, detail="Only .xlsx files are supported")
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        try:
            wb = openpyxl.load_workbook(tmp_path, read_only=True, data_only=True)
            load_order = ["3_Asegurados", "4_Proveedores", "2_Polizas", "1_Siniestros", "5_Documentos"]
            
            summary = {}
            errors: list[str] = []
            for sheet_name in load_order:
                if sheet_name not in SHEET_MAP:
                    continue
                try:
                    table, col_map = SHEET_MAP[sheet_name]

                    matched = None
                    for s in wb.sheetnames:
                        if sheet_name in s or s in sheet_name:
                            matched = s
                            break
                    if not matched:
                        errors.append(f"{sheet_name}: hoja no encontrada en el archivo")
                        continue

                    ws = wb[matched]
                    rows = load_sheet(ws, col_map)

                    if rows:
                        if table == "siniestros":
                            # We evaluate the siniestro immediately to persist scores
                            asegurados_res = supabase.table("asegurados_sinteticos").select("*").execute()
                            asegurados_map = {a["id_asegurado"]: a for a in asegurados_res.data}

                            for row in rows:
                                asegurado = asegurados_map.get(row.get("id_asegurado"))
                                eval_res = evaluar_siniestro(row, asegurado)
                                row["score_reglas"] = eval_res["score_reglas"]
                                row["score_anomalia"] = eval_res["score_anomalia"]
                                row["nivel_riesgo"] = eval_res["nivel_riesgo"]
                                row["alertas"] = eval_res["alertas"]

                        chunk_size = 100
                        for i in range(0, len(rows), chunk_size):
                            batch = rows[i: i + chunk_size]
                            supabase.table(table).upsert(batch, on_conflict="id_siniestro" if table == "siniestros" else None).execute()

                        summary[table] = len(rows)
                except Exception as e:
                    errors.append(f"{sheet_name}: {e}")

        finally:
            os.unlink(tmp_path)

        return {"message": "Upload successful", "summary": summary, "errors": errors}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))