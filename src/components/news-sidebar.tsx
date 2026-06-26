"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Newspaper,
  Radio,
  ExternalLink,
  ChevronLeft,
  RefreshCw,
  AlertTriangle,
  Activity,
  Rss,
  Zap,
  X,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// ─── Types ─────────────────────────────────────────────────────
interface Sismo {
  id: string;
  lugar: string;
  magnitud: number;
  profundidad: number;
  tiempo: string;
  url: string;
  tipo: "alerta" | "moderado" | "info";
}

interface Noticia {
  id: string;
  titulo: string;
  fuente: string;
  enlace: string;
  resumen: string | null;
  fecha: string;
}

interface NoticiasData {
  sismos: Sismo[];
  noticias: Noticia[];
  timestamp: string;
  fuentes: {
    sismos: string;
    noticias: string[];
    twitter: boolean;
    telegram: boolean;
  };
}

type TabNoticia = "sismos" | "noticias";

// ─── Helpers ───────────────────────────────────────────────────
function timeAgo(isoOrEpoch: string): string {
  const ms = typeof isoOrEpoch === "string" && !isoOrEpoch.includes("T")
    ? Number(isoOrEpoch)
    : new Date(isoOrEpoch).getTime();
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

function magColor(mag: number): string {
  if (mag >= 6) return "text-red-600 bg-red-50 border-red-200";
  if (mag >= 4.5) return "text-orange-600 bg-orange-50 border-orange-200";
  if (mag >= 3.5) return "text-yellow-600 bg-yellow-50 border-yellow-200";
  return "text-gray-600 bg-gray-50 border-gray-200";
}

function magLabel(tipo: string): { text: string; cls: string } {
  switch (tipo) {
    case "alerta": return { text: "ALERTA", cls: "bg-red-600 text-white" };
    case "moderado": return { text: "ATENCIÓN", cls: "bg-orange-500 text-white" };
    default: return { text: "MONITOREO", cls: "bg-gray-200 text-gray-600" };
  }
}

// ─── Component ─────────────────────────────────────────────────
export function NewsSidebar() {
  const [open, setOpen] = useState(true); // Abierto por defecto para máxima visibilidad
  const [data, setData] = useState<NoticiasData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabNoticia>("sismos");
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const fetchNoticias = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch("/api/noticias");
      if (!res.ok) throw new Error("Error");
      const json = await res.json();
      setData(json);
    } catch {
      if (!silent) toast({ title: "Sin conexión", description: "No se pudieron cargar las noticias", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchNoticias();
    // Auto-refresh every 2 min
    refreshTimer.current = setInterval(() => fetchNoticias(true), 120_000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [fetchNoticias]);

  const alertas = data?.sismos.filter((s) => s.tipo === "alerta").length || 0;

  return (
    <>
      {/* ── Toggle Button (floating) ── */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed top-20 right-4 z-50 flex items-center gap-2 bg-[#1a1a1a] text-white rounded-full pl-3.5 pr-3 py-2.5 shadow-2xl hover:bg-[#2a2a2a] transition-all active:scale-95 group"
        aria-label="Panel de noticias y alertas"
      >
        <Newspaper className="size-4 text-[#e86100] group-hover:scale-110 transition-transform" />
        <span className="text-xs font-semibold hidden sm:inline max-w-[80px] truncate">En vivo</span>
        {alertas > 0 && (
          <span className="flex items-center justify-center size-5 bg-red-600 text-white text-[10px] font-bold rounded-full animate-pulse">
            {alertas}
          </span>
        )}
        {open && <ChevronLeft className="size-3.5 text-gray-400 group-hover:text-white transition-colors" />}
      </button>

      {/* ── Sidebar Panel ── */}
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 250 }}
            className="fixed top-0 right-0 z-40 h-full w-full sm:w-[400px] bg-white shadow-2xl border-l border-gray-200 flex flex-col"
          >
            {/* Header */}
            <div className="bg-[#1a1a1a] text-white px-4 py-3.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="bg-[#e86100] rounded-lg p-1.5">
                  <Radio className="size-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold">Centro de Monitoreo</h2>
                  <p className="text-[10px] text-gray-400">Sismos · Noticias · Alertas Venezuela</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => fetchNoticias()}
                  disabled={loading}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  title="Actualizar"
                >
                  <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors sm:hidden"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Alert Banner */}
            {alertas > 0 && (
              <div className="bg-red-600 text-white px-4 py-2 text-center text-xs font-bold flex items-center justify-center gap-2 shrink-0">
                <Zap className="size-3.5 animate-pulse" />
                {alertas} alerta{alertas > 1 ? "s" : ""} sísmica{alertas > 1 ? "s" : ""} activa{alertas > 1 ? "s" : ""}
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-gray-200 shrink-0">
              <button
                onClick={() => setActiveTab("sismos")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold border-b-2 transition-all ${
                  activeTab === "sismos"
                    ? "border-[#e86100] text-[#e86100]"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                <Activity className="size-3.5" />
                Sismos
                {data?.sismos.length ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    {data.sismos.length}
                  </span>
                ) : null}
              </button>
              <button
                onClick={() => setActiveTab("noticias")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold border-b-2 transition-all ${
                  activeTab === "noticias"
                    ? "border-[#e86100] text-[#e86100]"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                <Rss className="size-3.5" />
                Noticias
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {loading && !data ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="animate-pulse space-y-2">
                      <div className="h-4 bg-gray-100 rounded w-3/4" />
                      <div className="h-3 bg-gray-100 rounded w-full" />
                      <div className="h-3 bg-gray-100 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : activeTab === "sismos" ? (
                <SismosTab sismos={data?.sismos || []} />
              ) : (
                <NoticiasTab noticias={data?.noticias || []} fuentes={data?.fuentes} />
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 px-4 py-2.5 text-[10px] text-gray-400 flex items-center justify-between shrink-0 bg-gray-50/50">
              <div className="flex items-center gap-1.5">
                <div className={`size-1.5 rounded-full ${data ? "bg-emergency-safe" : "bg-gray-300"}`} />
                {data ? `Actualizado ${timeAgo(data.timestamp)}` : "Sin datos"}
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <Activity className="size-2.5" />USGS
                </span>
                <span>RSS</span>
                {data?.fuentes.twitter && <span>𝕏</span>}
                {data?.fuentes.telegram && <span>✈️</span>}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Backdrop (mobile) ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-black/40 z-30 sm:hidden"
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Sismos Sub-tab ────────────────────────────────────────────
function SismosTab({ sismos }: { sismos: Sismo[] }) {
  if (sismos.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400">
        <Activity className="size-10 mx-auto mb-3 text-gray-200" />
        <p className="text-sm font-medium">Sin actividad sísmica reciente</p>
        <p className="text-xs mt-1">Monitoreando región de Venezuela</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      {sismos.map((s) => {
        const label = magLabel(s.tipo);
        return (
          <a
            key={s.id}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 rounded-xl border border-gray-100 hover:border-[#e86100]/30 hover:shadow-sm transition-all group"
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <span className={`text-lg font-extrabold ${magColor(s.magnitud).split(" ")[0]}`}>
                  M{s.magnitud.toFixed(1)}
                </span>
                <Badge className={`${label.cls} text-[9px] px-1.5 py-0 font-bold border-0`}>
                  {label.text}
                </Badge>
              </div>
              <span className="text-[10px] text-gray-400 whitespace-nowrap">{timeAgo(s.tiempo)}</span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed flex items-start gap-1.5">
              <MapPinIcon className="size-3 shrink-0 mt-0.5 text-gray-400" />
              <span className="line-clamp-2">{s.lugar}</span>
            </p>
            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
              <span>Profundidad: {s.profundidad} km</span>
              <ExternalLink className="size-2.5 group-hover:text-[#e86100] transition-colors" />
            </div>
          </a>
        );
      })}
    </div>
  );
}

// ─── Noticias Sub-tab ──────────────────────────────────────────
function NoticiasTab({
  noticias,
  fuentes,
}: {
  noticias: Noticia[];
  fuentes: ApiResponse["fuentes"] | undefined;
}) {
  if (noticias.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400">
        <Newspaper className="size-10 mx-auto mb-3 text-gray-200" />
        <p className="text-sm font-medium">Sin noticias relacionadas</p>
        <p className="text-xs mt-1">Fuentes: {fuentes?.noticias.join(", ") || "configurando..."}</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      {noticias.map((n) => (
        <a
          key={n.id}
          href={n.enlace}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-3 rounded-xl border border-gray-100 hover:border-[#e86100]/30 hover:shadow-sm transition-all group"
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className="text-xs font-bold text-gray-800 leading-snug line-clamp-2 group-hover:text-[#e86100] transition-colors flex-1">
              {n.titulo}
            </h4>
            <ExternalLink className="size-3 shrink-0 text-gray-300 group-hover:text-[#e86100] transition-colors mt-0.5" />
          </div>
          {n.resumen && (
            <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2 mb-1.5">{n.resumen}</p>
          )}
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-medium bg-gray-100 text-gray-500 hover:bg-gray-100">
              {n.fuente}
            </Badge>
            <span className="text-[10px] text-gray-400">{timeAgo(n.fecha)}</span>
          </div>
        </a>
      ))}
    </div>
  );
}

// Tiny map pin icon (inline SVG to avoid extra import)
function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}