"""
Backfill script to calculate and save scores for all existing siniestros.
Usage: python -m src.ingestion.backfill_scores
"""
import os
from supabase import create_client, Client
from dotenv import load_dotenv
from src.rules.fraud_rules import evaluar_siniestro

load_dotenv()

def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_ANON_KEY")
    if not url or not key:
        print("Missing SUPABASE_URL or SUPABASE_ANON_KEY")
        return

    supabase: Client = create_client(url, key)

    print("Fetching siniestros...")
    # Using range or just getting all of them if < 1000
    res = supabase.table("siniestros").select("*").execute()
    siniestros = res.data

    if not siniestros:
        print("No siniestros found.")
        return

    print(f"Found {len(siniestros)} siniestros. Fetching asegurados...")
    
    # We could fetch all asegurados into a map to avoid N+1 queries
    asegurados_res = supabase.table("asegurados_sinteticos").select("*").execute()
    asegurados_map = {a["id_asegurado"]: a for a in asegurados_res.data}

    print("Evaluating and updating...")
    updates = []
    
    for s in siniestros:
        asegurado = asegurados_map.get(s.get("id_asegurado"))
        eval_result = evaluar_siniestro(s, asegurado)
        
        # update object
        updates.append({
            "id_siniestro": s["id_siniestro"],
            "score_reglas": eval_result["score_reglas"],
            "score_anomalia": eval_result["score_anomalia"],
            "nivel_riesgo": eval_result["nivel_riesgo"],
            "alertas": eval_result["alertas"]
        })

    # batch upsert
    chunk = 100
    for i in range(0, len(updates), chunk):
        batch = updates[i: i + chunk]
        supabase.table("siniestros").upsert(batch, on_conflict="id_siniestro").execute()
        print(f"Upserted rows {i}–{i+len(batch)-1}")

    print("✅ Backfill complete.")

if __name__ == "__main__":
    main()
