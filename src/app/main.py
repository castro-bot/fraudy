from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os
from supabase import create_client, Client
from dotenv import load_dotenv
from src.rules.fraud_rules import evaluar_siniestro

# Cargar variables de entorno
load_dotenv()

app = FastAPI(title="FraudIA API - Aseguradora del Sur")

# Inicializar Supabase
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_ANON_KEY")
if not url or not key:
    raise RuntimeError("Faltan las credenciales de Supabase en el .env")

supabase: Client = create_client(url, key)

# Modelo de datos para el formulario del frontend
class NuevoSiniestroRequest(BaseModel):
    dias_entre_ocurrencia_reporte: int
    monto_reclamado: float
    cobertura: str
    reclamos_12_meses: int

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Backend de FraudIA corriendo al 100%"}

@app.get("/api/siniestros")
def listar_siniestros_priorizados():
    """
    Devuelve los siniestros de Supabase evaluados por el motor de reglas.
    Ideal para poblar la 'Bandeja Semáforo' del dashboard.
    """
    try:
        # Traemos una muestra de 20 siniestros para la demo
        res_siniestros = supabase.table('siniestros').select('*').limit(20).execute()
        res_asegurados = supabase.table('asegurados_sinteticos').select('*').execute()
        
        # Mapeamos los asegurados por ID para búsqueda rápida
        asegurados_dict = {a['id_asegurado']: a for a in res_asegurados.data}
        
        resultados = []
        for sin in res_siniestros.data:
            asegurado = asegurados_dict.get(sin['id_asegurado'], {})
            
            # Pasamos por nuestro motor de reglas
            evaluacion = evaluar_siniestro(sin, asegurado)
            
            # Unimos los datos del siniestro con su evaluación de riesgo
            caso_completo = {**sin, **evaluacion}
            resultados.append(caso_completo)
            
        # Ordenamos por score descendente (los críticos rojos aparecen primero)
        resultados.sort(key=lambda x: x['score_reglas'], reverse=True)
        return resultados
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/evaluar")
def evaluar_nuevo_siniestro(request: NuevoSiniestroRequest):
    """
    Endpoint en vivo para el formulario 'Nuevo Siniestro'.
    Evalúa el riesgo al instante sin guardarlo en base de datos.
    """
    siniestro = {
        "dias_entre_ocurrencia_reporte": request.dias_entre_ocurrencia_reporte,
        "monto_reclamado": request.monto_reclamado,
        "cobertura": request.cobertura
    }
    asegurado = {
        "reclamos_12_meses": request.reclamos_12_meses
    }
    
    return evaluar_siniestro(siniestro, asegurado)