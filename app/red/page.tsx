"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Network } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface GraphNode {
  id: string;
  label: string;
  tipo: "asegurado" | "proveedor";
  nivel: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  id_siniestro: string;
}

const NIVEL_COLOR: Record<string, string> = {
  rojo: "#ef4444",
  amarillo: "#f59e0b",
  verde: "#22c55e",
};

function getColor(nivel: string) {
  return NIVEL_COLOR[nivel?.toLowerCase()] ?? "#6366f1";
}

export default function RedPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<GraphNode[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/api/red`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const w = 900, h = 600;
        const positioned: GraphNode[] = d.nodes.map((n: GraphNode) => ({
          ...n,
          x: Math.random() * w,
          y: Math.random() * h,
          vx: 0,
          vy: 0,
        }));
        setNodes(positioned);
        nodesRef.current = positioned;
        setEdges(d.edges);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Simple force-directed layout
  useEffect(() => {
    if (nodes.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nodeMap = new Map<string, GraphNode>(nodesRef.current.map((n) => [n.id, n]));

    function tick() {
      const ns = nodesRef.current;
      const w = canvas!.width, h = canvas!.height;

      // Repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = (ns[j].x ?? 0) - (ns[i].x ?? 0);
          const dy = (ns[j].y ?? 0) - (ns[i].y ?? 0);
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
          const force = 800 / (dist * dist);
          ns[i].vx! -= (dx / dist) * force;
          ns[i].vy! -= (dy / dist) * force;
          ns[j].vx! += (dx / dist) * force;
          ns[j].vy! += (dy / dist) * force;
        }
      }

      // Attraction (edges)
      for (const e of edges) {
        const a = nodeMap.get(e.source);
        const b = nodeMap.get(e.target);
        if (!a || !b) continue;
        const dx = (b.x ?? 0) - (a.x ?? 0);
        const dy = (b.y ?? 0) - (a.y ?? 0);
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const force = (dist - 100) * 0.005;
        a.vx! += (dx / dist) * force;
        a.vy! += (dy / dist) * force;
        b.vx! -= (dx / dist) * force;
        b.vy! -= (dy / dist) * force;
      }

      // Centering
      for (const n of ns) {
        n.vx! += (w / 2 - (n.x ?? 0)) * 0.001;
        n.vy! += (h / 2 - (n.y ?? 0)) * 0.001;
        n.vx! *= 0.85;
        n.vy! *= 0.85;
        n.x = Math.max(16, Math.min(w - 16, (n.x ?? 0) + (n.vx ?? 0)));
        n.y = Math.max(16, Math.min(h - 16, (n.y ?? 0) + (n.vy ?? 0)));
      }

      // Draw
      ctx!.clearRect(0, 0, w, h);

      // Edges
      ctx!.strokeStyle = "rgba(255,255,255,0.06)";
      ctx!.lineWidth = 0.8;
      for (const e of edges) {
        const a = nodeMap.get(e.source);
        const b = nodeMap.get(e.target);
        if (!a || !b) continue;
        ctx!.beginPath();
        ctx!.moveTo(a.x ?? 0, a.y ?? 0);
        ctx!.lineTo(b.x ?? 0, b.y ?? 0);
        ctx!.stroke();
      }

      // Nodes
      const maxShow = Math.min(ns.length, 300);
      for (let i = 0; i < maxShow; i++) {
        const n = ns[i];
        const r = n.tipo === "proveedor" ? 7 : 5;
        ctx!.beginPath();
        if (n.tipo === "proveedor") {
          // Diamond
          ctx!.moveTo(n.x!, n.y! - r);
          ctx!.lineTo(n.x! + r, n.y!);
          ctx!.lineTo(n.x!, n.y! + r);
          ctx!.lineTo(n.x! - r, n.y!);
          ctx!.closePath();
        } else {
          ctx!.arc(n.x!, n.y!, r, 0, Math.PI * 2);
        }
        ctx!.fillStyle = getColor(n.nivel);
        ctx!.fill();
      }

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes, edges]);

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const scaleX = 900 / rect.width;
    const scaleY = 600 / rect.height;
    const cx = mx * scaleX;
    const cy = my * scaleY;

    for (const n of nodesRef.current) {
      const dx = (n.x ?? 0) - cx;
      const dy = (n.y ?? 0) - cy;
      if (dx * dx + dy * dy < 64) {
        setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, label: `${n.label} (${n.tipo})` });
        return;
      }
    }
    setTooltip(null);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/15">
          <Network className="h-5 w-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Red de Relaciones</h1>
          <p className="text-sm text-muted-foreground">
            Vínculos entre asegurados (círculo) y proveedores (diamante) vía siniestros
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-[#ef4444]" /> Riesgo Rojo</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-[#f59e0b]" /> Riesgo Amarillo</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-[#22c55e]" /> Riesgo Verde</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rotate-45 bg-white/40" /> Proveedor</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-white/40" /> Asegurado</span>
        <Badge variant="outline" className="border-white/[0.08] text-muted-foreground text-[10px] ml-auto">
          {nodes.length} nodos · {edges.length} enlaces
        </Badge>
      </div>

      <Card className="border-white/[0.08] bg-white/[0.03] overflow-hidden">
        <CardContent className="p-0 relative">
          {loading ? (
            <div className="flex items-center justify-center h-[500px] text-sm text-muted-foreground">
              Cargando red…
            </div>
          ) : (
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={900}
                height={600}
                className="w-full h-auto cursor-crosshair"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setTooltip(null)}
              />
              {tooltip && (
                <div
                  className="pointer-events-none absolute z-10 rounded-lg border border-white/[0.08] bg-[oklch(0.158_0.018_264)] px-2.5 py-1.5 text-xs text-foreground shadow-xl"
                  style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
                >
                  {tooltip.label}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
