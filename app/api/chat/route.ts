import { createClient } from '@supabase/supabase-js';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool, convertToModelMessages, stepCountIs } from 'ai';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY
});
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
import { z } from 'zod';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function POST(req: Request) {
  const body = await req.json();
  const messages = body.messages || [];

  if (!Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "Invalid request: messages must be an array" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const systemPrompt = `Eres FraudIA, agente experto en antifraude para Aseguradora del Sur.
NUNCA acuses de fraude directamente. Usa 'posible riesgo', 'anomalía', 'requiere revisión'.
Responde en español. Usa las herramientas disponibles para consultar datos reales.
Limita tus respuestas para que sean concisas pero informativas.
Usa viñetas (bullet points) para listas. NO uses tablas markdown.`;

  try {
    const result = streamText({
      model: google('gemini-3-flash-preview'),
      messages: await convertToModelMessages(messages),
      system: systemPrompt,
      tools: {
        get_top_risky: tool({
          description: 'Obtiene los N siniestros con mayor score de riesgo en la base de datos',
          inputSchema: z.object({
            n: z.number().describe('Número de siniestros a devolver (máx 20)').default(10)
          }),
          execute: async ({ n }) => {
            const limit = Math.min(n, 20);
            const { data, error } = await supabase
              .from('siniestros')
              .select('id_siniestro,cobertura,ramo,monto_reclamado,nivel_riesgo,score_reglas,sucursal,id_asegurado')
              .order('score_reglas', { ascending: false })
              .limit(limit);
            if (error) throw error;
            return data;
          }
        }),
        explain_siniestro: tool({
          description: 'Explica por qué un siniestro fue marcado como alto riesgo, devolviendo sus datos completos y alertas',
          inputSchema: z.object({
            id_siniestro: z.string().describe('ID del siniestro a explicar')
          }),
          execute: async ({ id_siniestro }) => {
            const { data, error } = await supabase
              .from('siniestros')
              .select('*')
              .eq('id_siniestro', id_siniestro)
              .single();
            if (error) throw error;
            return data;
          }
        }),
        top_proveedores_alertas: tool({
          description: 'Devuelve los proveedores con mayor concentración de siniestros de alto riesgo (Rojo/Amarillo)',
          inputSchema: z.object({
            n: z.number().describe('Número de proveedores').default(5)
          }),
          execute: async ({ n }) => {
            const limit = Math.min(n, 20);
            const { data, error } = await supabase
              .from('siniestros')
              .select('id_proveedor,nivel_riesgo')
              .in('nivel_riesgo', ['Rojo', 'Amarillo']);
            if (error) throw error;

            const counts: Record<string, number> = {};
            for (const row of data || []) {
              if (row.id_proveedor) {
                counts[row.id_proveedor] = (counts[row.id_proveedor] || 0) + 1;
              }
            }

            return Object.entries(counts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, limit)
              .map(([id, count]) => ({ id_proveedor: id, count }));
          }
        }),
        alertas_por_ramo: tool({
          description: 'Cuenta siniestros Rojo y Amarillo agrupados por ramo de seguro',
          inputSchema: z.object({}),
          execute: async () => {
            const { data, error } = await supabase
              .from('siniestros')
              .select('ramo,nivel_riesgo');
            if (error) throw error;

            const agg: Record<string, { rojo: number; amarillo: number; total: number }> = {};
            for (const row of data || []) {
              const r = row.ramo || 'Otro';
              if (!agg[r]) agg[r] = { rojo: 0, amarillo: 0, total: 0 };
              agg[r].total++;
              if (row.nivel_riesgo === 'Rojo') agg[r].rojo++;
              else if (row.nivel_riesgo === 'Amarillo') agg[r].amarillo++;
            }
            return agg;
          }
        }),
        alertas_por_ciudad: tool({
          description: 'Ciudades (sucursales) con mayor número de siniestros de alto riesgo',
          inputSchema: z.object({
            n: z.number().describe('Top N ciudades').default(5)
          }),
          execute: async ({ n }) => {
            const limit = Math.min(n, 20);
            const { data, error } = await supabase
              .from('siniestros')
              .select('sucursal,nivel_riesgo')
              .in('nivel_riesgo', ['Rojo', 'Amarillo']);
            if (error) throw error;

            const counts: Record<string, number> = {};
            for (const row of data || []) {
              const city = row.sucursal || 'Desconocido';
              counts[city] = (counts[city] || 0) + 1;
            }
            return Object.entries(counts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, limit)
              .map(([ciudad, count]) => ({ ciudad, count }));
          }
        }),
        top_asegurados_frecuencia: tool({
          description: 'Asegurados con mayor historial de reclamos (posibles patrones recurrentes)',
          inputSchema: z.object({
            n: z.number().describe('Top N asegurados').default(10)
          }),
          execute: async ({ n }) => {
            const limit = Math.min(n, 20);
            const { data, error } = await supabase
              .from('asegurados_sinteticos')
              .select('id_asegurado,nombre_completo,reclamos_historico,reclamos_12_meses,perfil_riesgo')
              .order('reclamos_historico', { ascending: false })
              .limit(limit);
            if (error) throw error;
            return data;
          }
        }),
        casos_sin_documentos: tool({
          description: 'Lista de siniestros con documentación incompleta',
          inputSchema: z.object({
            limit: z.number().describe('Límite de resultados').default(10)
          }),
          execute: async ({ limit }) => {
            const l = Math.min(limit, 50);
            const { data, error } = await supabase
              .from('siniestros')
              .select('id_siniestro,ramo,cobertura,monto_reclamado,nivel_riesgo')
              .eq('documentos_completos', 'No')
              .limit(l);
            if (error) throw error;
            return data;
          }
        }),
      },
      stopWhen: stepCountIs(5),
    });

    return result.toUIMessageStreamResponse();
  } catch (error: any) {
    console.error("Chat API Error:", error);

    if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('Quota') || error?.message?.includes('quota')) {
      return new Response("El sistema está procesando demasiada información (Límite de cuota excedido). Por favor, espera un minuto e intenta de nuevo.", {
        status: 429,
      });
    }

    return new Response("Ocurrió un error inesperado al procesar tu solicitud.", {
      status: 500,
    });
  }
}
