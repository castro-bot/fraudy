import os

class LLMProvider:
    def __init__(self):
        self.openai_api_key = os.environ.get("OPENAI_API_KEY")
        self.google_api_key = os.environ.get("GOOGLE_API_KEY")

        if self.google_api_key:
            self.provider_type = "google"
            from google import genai
            self.client = genai.Client(api_key=self.google_api_key)
        elif self.openai_api_key:
            self.provider_type = "openai"
            from openai import OpenAI
            self.client = OpenAI(api_key=self.openai_api_key)
        else:
            raise ValueError("❌ Faltó configurar GOOGLE_API_KEY u OPENAI_API_KEY en tu archivo .env")

    def generate_text(self, prompt: str) -> str:
        """Genera texto explicativo usando el LLM disponible"""
        if self.provider_type == "google":
            system_instruction = "Eres un asistente experto en seguros y antifraude."
            full_prompt = f"{system_instruction}\n\n{prompt}"
            response = self.client.models.generate_content(
                model="gemini-3-flash-preview",
                contents=full_prompt,
            )
            return response.text.strip()

        elif self.provider_type == "openai":
            response = self.client.chat.completions.create(
                model="gpt-5-nano-2025-08-07",
                messages=[
                    {"role": "system", "content": "Eres un asistente experto en seguros y antifraude."},
                    {"role": "user", "content": prompt}
                ],
                max_completion_tokens=150
            )
            return response.choices[0].message.content.strip()

    def get_embedding(self, text: str) -> list[float]:
        """Convierte un texto en un vector matemático usando el LLM disponible"""
        try:
            if self.provider_type == "google":
                response = self.client.models.embed_content(
                    model="gemini-embedding-2",
                    contents=text,
                )
                return response.embeddings[0].values

            elif self.provider_type == "openai":
                response = self.client.embeddings.create(
                    input=text,
                    model="text-embedding-3-small"
                )
                return response.data[0].embedding
        except Exception as e:
            print(f"Error generando embedding: {e}")
            return []

    def chat(self, user_message: str, context_data: str) -> str:
        """Endpoint de chat interactivo con inyección de contexto de base de datos"""
        if self.provider_type == "openai":
            response = self.client.chat.completions.create(
                model="gpt-5-nano-2025-08-07",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Eres FraudIA, un agente experto en riesgos para Aseguradora del Sur. "
                            "Responde de forma concisa y profesional. NUNCA acuses directamente de fraude, "
                            "usa términos como 'anomalía', 'patrón atípico' o 'posible riesgo'. "
                            f"Basa tu respuesta en esta información extraída de la base de datos:\n{context_data}"
                        )
                    },
                    {"role": "user", "content": user_message}
                ],
                max_completion_tokens=300
            )
            return response.choices[0].message.content.strip()

        elif self.provider_type == "google":
            system = (
                "Eres FraudIA, agente experto en riesgos para Aseguradora del Sur. "
                "NUNCA acuses de fraude. Usa 'anomalía', 'patrón atípico', 'posible riesgo'. "
                f"Contexto de base de datos:\n{context_data}"
            )
            response = self.client.models.generate_content(
                model="gemini-3-flash-preview",
                contents=f"{system}\n\nUsuario: {user_message}",
            )
            return response.text.strip()

        return "Proveedor no configurado."