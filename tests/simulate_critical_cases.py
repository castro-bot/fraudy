"""
Simulate critical cases (RF-01 to RF-07) and insert them into Supabase.
"""
import os
import uuid
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.rules.fraud_rules import evaluar_siniestro

load_dotenv()

def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_ANON_KEY")
    if not url or not key:
        print("Missing SUPABASE_URL or SUPABASE_ANON_KEY")
        return

    supabase: Client = create_client(url, key)
    
    # Grab a random asegurado and proveedor to use
    asegurados = supabase.table("asegurados_sinteticos").select("*").limit(1).execute()
    asegurado = asegurados.data[0] if asegurados.data else {"id_asegurado": "ASEG-SIM-01", "reclamos_12_meses": 0}
    
    proveedores = supabase.table("proveedores").select("*").limit(1).execute()
    proveedor_id = proveedores.data[0]["id_proveedor"] if proveedores.data else "PROV-SIM-01"

    now = datetime.now()
    
    cases = [
        # RF-01: Cobertura Robo
        {
            "id_siniestro": f"SIM-RF01-{uuid.uuid4().hex[:6]}",
            "id_asegurado": asegurado["id_asegurado"],
            "id_proveedor": proveedor_id,
            "ramo": "Autos",
            "cobertura": "Robo",
            "monto_reclamado": 15000,
            "descripcion_hechos": "Vehículo robado mientras estaba estacionado.",
            "fecha_ocurrencia": (now - timedelta(days=2)).isoformat(),
            "fecha_reporte": now.isoformat(),
            "dias_entre_ocurrencia_reporte": 2,
            "documentos_completos": "Sí"
        },
        # RF-02: Documentos inconsistentes
        {
            "id_siniestro": f"SIM-RF02-{uuid.uuid4().hex[:6]}",
            "id_asegurado": asegurado["id_asegurado"],
            "id_proveedor": proveedor_id,
            "ramo": "Autos",
            "cobertura": "Daños",
            "monto_reclamado": 5000,
            "descripcion_hechos": "Choque leve, pero el cliente indica que está sin factura de la reparación.",
            "documentos_completos": "Sí",
            "dias_entre_ocurrencia_reporte": 1,
        },
        # RF-03: Proveedor restrictivo
        {
            "id_siniestro": f"SIM-RF03-{uuid.uuid4().hex[:6]}",
            "id_asegurado": asegurado["id_asegurado"],
            "id_proveedor": proveedor_id,
            "ramo": "Autos",
            "cobertura": "Daños",
            "monto_reclamado": 8000,
            "descripcion_hechos": "Reparación en taller.",
            "prov_lista_restrictiva": "Sí",
            "dias_entre_ocurrencia_reporte": 1,
        },
        # RF-04: Dinámica grave + nocturno
        {
            "id_siniestro": f"SIM-RF04-{uuid.uuid4().hex[:6]}",
            "id_asegurado": asegurado["id_asegurado"],
            "id_proveedor": proveedor_id,
            "ramo": "Autos",
            "cobertura": "Responsabilidad Civil",
            "monto_reclamado": 25000,
            "descripcion_hechos": "Volcadura múltiple ocurrida durante la madrugada.",
            "dias_entre_ocurrencia_reporte": 1,
        },
        # RF-05: < 2 días desde inicio póliza
        {
            "id_siniestro": f"SIM-RF05-{uuid.uuid4().hex[:6]}",
            "id_asegurado": asegurado["id_asegurado"],
            "id_proveedor": proveedor_id,
            "ramo": "Autos",
            "cobertura": "Daños",
            "monto_reclamado": 3000,
            "descripcion_hechos": "Choque contra poste.",
            "dias_desde_inicio_poliza": 1,
            "dias_entre_ocurrencia_reporte": 1,
        },
        # RF-06: Robo + demora > 4 días
        {
            "id_siniestro": f"SIM-RF06-{uuid.uuid4().hex[:6]}",
            "id_asegurado": asegurado["id_asegurado"],
            "id_proveedor": proveedor_id,
            "ramo": "Autos",
            "cobertura": "Robo",
            "monto_reclamado": 18000,
            "descripcion_hechos": "Robo de vehículo.",
            "dias_entre_ocurrencia_reporte": 6,
        },
        # RF-07: Narrativa clonada
        {
            "id_siniestro": f"SIM-RF07-{uuid.uuid4().hex[:6]}",
            "id_asegurado": asegurado["id_asegurado"],
            "id_proveedor": proveedor_id,
            "ramo": "Autos",
            "cobertura": "Daños",
            "monto_reclamado": 4000,
            "descripcion_hechos": "Choque por alcance en la avenida principal.",
            "similitud_narrativa_max": 0.95,
            "dias_entre_ocurrencia_reporte": 1,
        }
    ]

    print(f"Evaluating and inserting {len(cases)} cases...")
    for c in cases:
        eval_res = evaluar_siniestro(c, asegurado)
        c["score_reglas"] = eval_res["score_reglas"]
        c["score_anomalia"] = eval_res["score_anomalia"]
        c["nivel_riesgo"] = eval_res["nivel_riesgo"]
        c["alertas"] = eval_res["alertas"]
    
    # Upsert
    res = supabase.table("siniestros").upsert(cases).execute()
    print("✅ Successfully inserted critical cases.")

if __name__ == "__main__":
    main()
