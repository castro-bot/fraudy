"""
Isolation Forest — 6 features + StandardScaler.
Blends: final_score = 0.7 * score_reglas + 0.3 * score_anomalia
Usage: python -m src.models.fraud_model
"""
import os
import joblib
import pathlib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

MODEL_PATH = pathlib.Path("models/fraud_model.pkl")
SCALER_PATH = pathlib.Path("models/fraud_scaler.pkl")
FEATURES = [
    "monto_reclamado",
    "dias_entre_ocurrencia_reporte",
    "dias_desde_inicio_poliza",
    "reclamos_previos_asegurado",
    "ratio_monto_suma",          # monto_reclamado / suma_asegurada
    "similitud_narrativa_max",
]

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_ANON_KEY")
supabase: Client = create_client(url, key)


def _prepare_df(data: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(data)
    df["monto_reclamado"] = pd.to_numeric(df.get("monto_reclamado", 0), errors="coerce").fillna(0)
    df["dias_entre_ocurrencia_reporte"] = pd.to_numeric(df.get("dias_entre_ocurrencia_reporte", 0), errors="coerce").fillna(0)
    df["dias_desde_inicio_poliza"] = pd.to_numeric(df.get("dias_desde_inicio_poliza", 9999), errors="coerce").fillna(9999)
    df["reclamos_previos_asegurado"] = pd.to_numeric(df.get("reclamos_previos_asegurado", 0), errors="coerce").fillna(0)
    df["similitud_narrativa_max"] = pd.to_numeric(df.get("similitud_narrativa_max", 0), errors="coerce").fillna(0)
    suma = pd.to_numeric(df.get("suma_asegurada", 1), errors="coerce").fillna(1).replace(0, 1)
    df["ratio_monto_suma"] = df["monto_reclamado"] / suma
    return df


def _score_anomalia_from_raw(raw_score: float) -> int:
    """Convert sklearn decision_function output → 0–100 anomaly score."""
    # decision_function: negative = anomaly, positive = normal
    if raw_score < 0:
        return min(int(abs(raw_score) * 150 + 40), 100)
    return max(int(20 - raw_score * 80), 0)


def entrenar_y_aplicar_modelo():
    print("Fetching data from Supabase...")
    res = supabase.table("siniestros").select(",".join([
        "id_siniestro", "monto_reclamado", "dias_entre_ocurrencia_reporte",
        "dias_desde_inicio_poliza", "reclamos_previos_asegurado",
        "similitud_narrativa_max", "suma_asegurada", "score_reglas",
    ])).execute()
    data = res.data
    if not data:
        print("❌ No data to train on.")
        return

    df = _prepare_df(data)
    X_raw = df[FEATURES].values

    print("Training StandardScaler + Isolation Forest...")
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_raw)

    model = IsolationForest(n_estimators=200, contamination=0.08, random_state=42)
    model.fit(X_scaled)

    # Persist model + scaler
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    print(f"Model saved → {MODEL_PATH}")

    scores_raw = model.decision_function(X_scaled)

    print("Updating score_anomalia + final_score in Supabase...")
    updated = 0
    for i, row in df.iterrows():
        sid = row["id_siniestro"]
        score_anomalia = _score_anomalia_from_raw(float(scores_raw[i]))
        score_reglas = int(row.get("score_reglas") or 0)
        final_score = min(int(0.7 * score_reglas + 0.3 * score_anomalia), 100)

        supabase.table("siniestros").update({
            "score_anomalia": score_anomalia,
        }).eq("id_siniestro", sid).execute()
        updated += 1

    print(f"✅ Updated {updated} siniestros.")


def predict_anomalia(siniestro: dict) -> int:
    """Single-record inference. Returns score_anomalia 0–100."""
    if not MODEL_PATH.exists() or not SCALER_PATH.exists():
        return 0
    model = joblib.load(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)

    df = _prepare_df([siniestro])
    X = df[FEATURES].values
    X_scaled = scaler.transform(X)
    raw = model.decision_function(X_scaled)[0]
    return _score_anomalia_from_raw(float(raw))


def compute_final_score(score_reglas: int, siniestro: dict) -> dict:
    """Blend rules + anomaly into final_score. Called from evaluar_siniestro."""
    score_anomalia = predict_anomalia(siniestro)
    final_score = min(int(0.7 * score_reglas + 0.3 * score_anomalia), 100)
    return {"score_anomalia": score_anomalia, "final_score": final_score}


if __name__ == "__main__":
    entrenar_y_aplicar_modelo()