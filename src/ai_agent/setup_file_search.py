import os
import time
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

def main():
    client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY"))
    
    file_path = "data/raw/evento/Evento_Datasets_Sinteticos_Fraude_500_v2.xlsx"
    print(f"Uploading file {file_path} to Gemini...")
    sample_file = client.files.upload(file=file_path, config={'name': 'fraudy-dataset-excel'})

    print("Creating File Search Store...")
    file_search_store = client.file_search_stores.create(
        config={
            'display_name': 'fraudy-dataset-store',
            'embedding_model': 'models/gemini-embedding-2'
        }
    )

    print(f"Importing file to store: {file_search_store.name}...")
    operation = client.file_search_stores.import_file(
        file_search_store_name=file_search_store.name,
        file_name=sample_file.name
    )

    while not operation.done:
        print("Waiting for import to complete...")
        time.sleep(5)
        operation = client.operations.get(operation)

    print("✅ File import complete.")
    print(f"File Search Store Name: {file_search_store.name}")
    
    # Save the store name to .env
    env_path = ".env"
    with open(env_path, "a") as f:
        f.write(f"\nGEMINI_FILE_SEARCH_STORE={file_search_store.name}\n")
    
    print("Store name saved to .env")

if __name__ == "__main__":
    main()
