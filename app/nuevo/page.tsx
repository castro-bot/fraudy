"use client";

import { useState } from "react";
import { FilePlus2, ShieldAlert, AlertTriangle, TrendingUp, CheckCircle2 } from "lucide-react";
import { invalidateSiniestrosCache } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function NuevoSiniestroPage() {
  // 1. Estados del formulario
  const [formData, setFormData] = useState({
    cobertura: "Robo",
    fechaOcurrencia: "",
    fechaReporte: "",
    montoReclamado: "",
    reclamosPrevios: "0",
    descripcion: "",
  });

  // 2. Estados de la API
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  // File Upload states
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);

  // 3. Manejador de cambios
  const handleChange = (e: any) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileUpload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("http://localhost:8001/api/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      setUploadResult(data);
      if (!data.error) invalidateSiniestrosCache();
    } catch (e) {
      setUploadResult({ error: "Upload failed" });
    } finally {
      setUploading(false);
    }
  };

  // 4. Utilidad para calcular días (necesario para tu regla RF-06)
  const calcularDias = (inicio: string, fin: string) => {
    if (!inicio || !fin) return 0;
    const diffTime = new Date(fin).getTime() - new Date(inicio).getTime();
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  };

  // 5. Enviar a tu API FastAPI
  const handleSubmit = async () => {
    setLoading(true);
    setResultado(null);
    try {
      const payload = {
        cobertura: formData.cobertura,
        monto_reclamado: parseFloat(formData.montoReclamado) || 0,
        dias_entre_ocurrencia_reporte: calcularDias(formData.fechaOcurrencia, formData.fechaReporte),
        reclamos_12_meses: parseInt(formData.reclamosPrevios) || 0,
        descripcion: formData.descripcion,
      };

      const res = await fetch("http://localhost:8001/api/evaluar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setResultado(data);
    } catch (error) {
      console.error("Error evaluando siniestro:", error);
    } finally {
      setLoading(false);
    }
  };

  // 6. Colores dinámicos para el semáforo
  const getColorSemáforo = (nivel: string) => {
    if (nivel === "Rojo") return "text-[var(--rojo)]";
    if (nivel === "Amarillo") return "text-[var(--amarillo)]";
    return "text-[var(--verde)]";
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/30">
          <FilePlus2 className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Carga de Datos</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Sube tu dataset (.xlsx) para procesar nuevos siniestros
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 max-w-3xl">
        <Card className="border-white/[0.08] bg-white/[0.03]">
          <CardHeader className="pb-3 px-5 pt-4 border-b border-white/[0.06]">
            <CardTitle className="text-sm font-semibold">Carga de Dataset (.xlsx)</CardTitle>
          </CardHeader>
          <CardContent className="px-5 py-6">
            <div className="flex items-center gap-4">
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-muted-foreground
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-indigo-500/10 file:text-indigo-400
                  hover:file:bg-indigo-500/20"
              />
              <Button
                onClick={handleFileUpload}
                disabled={!file || uploading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                {uploading ? "Subiendo..." : "Subir Archivo"}
              </Button>
            </div>
            {uploadResult && (
              <div className="mt-4 text-sm bg-white/[0.04] p-3 rounded-lg border border-white/[0.05]">
                {uploadResult.error ? (
                  <span className="text-[var(--rojo)]">{uploadResult.error}</span>
                ) : (
                  <>
                    <div className="text-[var(--verde)]">
                      ¡Carga exitosa! Se procesaron:
                      <ul className="list-disc ml-5 mt-2">
                        {Object.entries(uploadResult.summary || {}).map(([table, count]) => (
                          <li key={table}>{table}: {count as React.ReactNode} registros</li>
                        ))}
                      </ul>
                    </div>
                    {uploadResult.errors && uploadResult.errors.length > 0 && (
                      <div className="mt-2 text-[var(--amarillo)]">
                        <p className="font-semibold">Advertencias:</p>
                        <ul className="list-disc ml-5 mt-1">
                          {uploadResult.errors.map((err: string, i: number) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}