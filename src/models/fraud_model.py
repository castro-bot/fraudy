import os
import pandas as pd
from sklearn.ensemble import IsolationForest
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Conexión a Supabase
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_ANON_KEY")
supabase: Client = create_client(url, key)

def entrenar_y_aplicar_modelo():
    print("Iniciando entrenamiento del modelo Isolation Forest...")
    
    # 1. Obtener datos de Supabase
    res_siniestros = supabase.table('siniestros').select('*').execute()
    siniestros_data = res_siniestros.data
    
    if not siniestros_data:
        print("❌ No hay datos para entrenar.")
        return

    # Convertir a DataFrame de Pandas (ideal para scikit-learn)
    df = pd.DataFrame(siniestros_data)
    
    # 2. Seleccionar características (features) para el modelo
    # Isolation Forest buscará anomalías numéricas en estas columnas
    features = ['monto_reclamado', 'dias_entre_ocurrencia_reporte']
    X = df[features].fillna(0) # Llenar nulos con 0 por seguridad

    # 3. Configurar y Entrenar el Modelo
    # contamination=0.08 porque simulamos un 8% de fraude en la semilla
    modelo = IsolationForest(n_estimators=100, contamination=0.08, random_state=42)
    modelo.fit(X)

    # 4. Obtener las predicciones y los scores de anomalía
    # anomaly_score de sklearn da valores negativos para anomalías (ej: -0.15) y positivos para normales (0.10)
    scores_crudos = modelo.decision_function(X)
    
    print("Calculando y actualizando scores de anomalía en Supabase...")
    
    # 5. Normalizar el score de 0 a 100 y guardarlo en Supabase
    actualizados = 0
    for idx, row in df.iterrows():
        id_siniestro = row['id_siniestro']
        score_crudo = float(scores_crudos[idx])
        
        # Invertir y normalizar: Mientras más negativo el crudo, más cercano a 100 el score_anomalia
        # Un mapeo simplificado para el hackathon:
        if score_crudo < 0:
            # Es una anomalía detectada por el modelo
            score_anomalia = min(int(abs(score_crudo) * 200 + 40), 100) 
        else:
            # Es normal
            score_anomalia = max(int(20 - (score_crudo * 100)), 0)
            
        # Actualizar en la base de datos
        supabase.table('siniestros').update({'score_anomalia': score_anomalia}).eq('id_siniestro', id_siniestro).execute()
        actualizados += 1

    print(f"✅ ¡Modelo ejecutado! Se actualizaron los scores de anomalía de {actualizados} siniestros.")

if __name__ == "__main__":
    entrenar_y_aplicar_modelo()