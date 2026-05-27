import os
import csv
from supabase import create_client, Client
from dotenv import load_dotenv

# Cargar variables de entorno (por si lo corremos localmente fuera de docker)
load_dotenv()

# Obtener credenciales
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_ANON_KEY")

if not url or not key:
    print("❌ Error: No se encontraron las credenciales de Supabase en las variables de entorno.")
    exit(1)

# Iniciar cliente de Supabase
supabase: Client = create_client(url, key)

def cargar_asegurados():
    print("Cargando asegurados...")
    with open('data/synthetic/asegurados.csv', mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        data = [row for row in reader]
        
        # Insertar en lote a la tabla
        response = supabase.table('asegurados_sinteticos').insert(data).execute()
        print(f"✅ Se insertaron {len(response.data)} asegurados en Supabase.")

def cargar_siniestros():
    print("Cargando siniestros...")
    with open('data/synthetic/siniestros.csv', mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        data = []
        for row in reader:
            # Los CSV guardan todo como texto, Supabase prefiere que los tipos coincidan
            # pero la API de Supabase en Python hace el casting automático en la mayoría de los casos.
            data.append(row)
            
        # Insertar en lote a la tabla
        response = supabase.table('siniestros').insert(data).execute()
        print(f"✅ Se insertaron {len(response.data)} siniestros en Supabase.")

if __name__ == "__main__":
    print("Iniciando carga de datos a Supabase...")
    cargar_asegurados()
    cargar_siniestros()
    print("¡Proceso de ingesta completado!")