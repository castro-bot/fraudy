"""
Multimodal PDF analysis using Gemini Files API.
Detects document inconsistencies (RF-02) by cross-checking PDF content vs claim data.
"""
import os
import json
import pathlib
from google import genai

PDF_DIR = pathlib.Path("data/raw/evento")


def find_pdf_for_siniestro(id_siniestro: str) -> pathlib.Path | None:
    """Search PDF_DIR for a PDF matching the siniestro ID."""
    if not PDF_DIR.exists():
        return None
    # Try direct match first
    direct = PDF_DIR / f"{id_siniestro}.pdf"
    if direct.exists():
        return direct
    # Try partial match
    for f in PDF_DIR.glob("*.pdf"):
        if id_siniestro.lower() in f.stem.lower():
            return f
    return None


def analyze_document(pdf_path: str | pathlib.Path, siniestro_data: dict) -> dict:
    """
    Upload PDF to Gemini Files API and cross-check against siniestro_data.
    Returns {fecha_documento, monto_documento, inconsistencia_detectada, observacion}.
    """
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        return {"inconsistencia_detectada": False, "observacion": "GOOGLE_API_KEY no configurada"}

    client = genai.Client(api_key=api_key)
    pdf_path = pathlib.Path(pdf_path)

    if not pdf_path.exists():
        return {"inconsistencia_detectada": False, "observacion": f"PDF no encontrado: {pdf_path}"}

    try:
        # Upload to Gemini Files API
        file_ref = client.files.upload(
            path=str(pdf_path),
            config={"mime_type": "application/pdf"}
        )

        prompt = f"""Analiza este documento de siniestro de seguro.
Datos registrados en el sistema:
- ID Siniestro: {siniestro_data.get('id_siniestro', 'N/A')}
- Fecha ocurrencia: {siniestro_data.get('fecha_ocurrencia', 'N/A')}
- Monto reclamado: ${siniestro_data.get('monto_reclamado', 'N/A'):,}
- Descripción: {siniestro_data.get('descripcion_hechos', 'N/A')}
- Documentos marcados completos: {siniestro_data.get('documentos_completos', 'N/A')}

Revisa el documento PDF y detecta inconsistencias. Responde ÚNICAMENTE con JSON válido:
{{
  "fecha_documento": "YYYY-MM-DD o null si no visible",
  "monto_documento": null_o_numero,
  "inconsistencia_detectada": true_o_false,
  "tipo_inconsistencia": "fecha|monto|descripcion|firma|ninguna",
  "observacion": "descripcion breve de la inconsistencia o 'Sin inconsistencias detectadas'"
}}"""

        response = client.models.generate_content(
            model="gemini-3.1-flash-lite",
            contents=[file_ref, prompt]
        )

        # Parse JSON from response
        text = response.text.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()

        result = json.loads(text)
        return result

    except json.JSONDecodeError:
        return {
            "inconsistencia_detectada": False,
            "observacion": f"No se pudo parsear respuesta: {response.text[:200]}"
        }
    except Exception as e:
        return {
            "inconsistencia_detectada": False,
            "observacion": f"Error en análisis PDF: {str(e)}"
        }


def analyze_siniestro_pdf(siniestro_data: dict) -> dict | None:
    """
    Find and analyze PDF for a siniestro. Returns analysis dict or None if no PDF found.
    If inconsistencia_detectada=True, this should trigger RF-02 in the rules engine.
    """
    id_sin = siniestro_data.get("id_siniestro", "")
    pdf = find_pdf_for_siniestro(id_sin)
    if not pdf:
        return None
    return analyze_document(pdf, siniestro_data)
