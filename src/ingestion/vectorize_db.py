import os
from supabase import create_client
from dotenv import load_dotenv
from src.ai_agent.llm_provider import LLMProvider

load_dotenv()
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_ANON_KEY")
supabase = create_client(url, key)
ia = LLMProvider()

def vectorizar_todo():
    print("Obteniendo siniestros de Supabase...")
    res = supabase.table('siniestros').select('id_siniestro, descripcion_hechos').execute()
    
    print("Convirtiendo textos a vectores matemáticos (Embeddings)...")
    for sin in res.data:
        texto = sin.get('descripcion_hechos')
        if texto:
            vector = ia.get_embedding(texto)
            if vector:
                # Guardamos el vector en la nueva columna
                supabase.table('siniestros').update({'embedding_descripcion': vector}).eq('id_siniestro', sin['id_siniestro']).execute()
                print(f"✅ Siniestro {sin['id_siniestro'][:8]}... vectorizado.")
                
    print("🎉 ¡Base de datos lista para NLP!")

if __name__ == '__main__':
    vectorizar_todo()