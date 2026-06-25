"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Plus,
  MapPin,
  Phone,
  User,
  UserX,
  AlertTriangle,
  Shield,
  Heart,
  Eye,
  Clock,
  Loader2,
  WifiOff,
  Send,
  X,
  Activity,
  FileText,
  BarChart3,
  Users,
  HelpCircle,
  Truck,
  TrendingUp,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────
interface Reporte {
  id: string;
  tipoReporte: string;
  nombreCompleto: string | null;
  descripcionFisica: string | null;
  ubicacionExacta: string;
  estado: string;
  contacto: string;
  notaAdicional: string | null;
  urgenciaAi: number | null;
  prioridadDesc: string | null;
  fechaRegistro: string;
}

interface Metrics {
  total: number;
  conocidos: number;
  sinIdentificar: number;
  aSalvo: number;
  heridos: number;
  desaparecidos: number;
  enTransito: number;
  conIa: number;
  pendienteIa: number;
}

type EstadoType = "A salvo" | "Herido" | "Desaparecido" | "En tránsito";
type TabType = "reportes" | "desconocidos" | "metricas";

// ─── Config ──────────────────────────────────────────────────────
const urgencyConfig: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: "Baja", color: "text-emergency-safe", bg: "bg-emergency-safe/10 border-emergency-safe/30" },
  2: { label: "Moderada", color: "text-urgency-2", bg: "bg-urgency-2/10 border-urgency-2/30" },
  3: { label: "Media", color: "text-urgency-3", bg: "bg-urgency-3/10 border-urgency-3/30" },
  4: { label: "Alta", color: "text-urgency-4", bg: "bg-urgency-4/10 border-urgency-4/30" },
  5: { label: "Crítica", color: "text-urgency-5", bg: "bg-urgency-5/10 border-urgency-5/30" },
};

const estadoConfig: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  "A salvo": { label: "A salvo", color: "text-emergency-safe", bg: "bg-emergency-safe/15", icon: <Shield className="size-4" /> },
  Herido: { label: "Herido", color: "text-emergency-injured", bg: "bg-emergency-injured/15", icon: <Heart className="size-4" /> },
  Desaparecido: { label: "Desaparecido", color: "text-emergency-missing", bg: "bg-emergency-missing/15", icon: <Eye className="size-4" /> },
  "En tránsito": { label: "En tránsito", color: "text-urgency-2", bg: "bg-urgency-2/15", icon: <Truck className="size-4" /> },
};

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Ahora";
  if (diffMins < 60) return `Hace ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Hace ${diffHours}h`;
  return `Hace ${Math.floor(diffHours / 24)}d`;
}

// ─── Component ───────────────────────────────────────────────────
export default function EmergenciaPage() {
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [filteredReportes, setFilteredReportes] = useState<Reporte[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"conocido" | "desconocido">("conocido");
  const [activeTab, setActiveTab] = useState<TabType>("reportes");
  const [isOnline, setIsOnline] = useState(true);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { toast } = useToast();

  // Form state — Conocido
  const [formConocido, setFormConocido] = useState({
    nombre_completo: "",
    ubicacion_exacta: "",
    estado: "" as EstadoType | "",
    contacto: "",
    nota_adicional: "",
  });
  // Form state — Desconocido
  const [formDesconocido, setFormDesconocido] = useState({
    descripcion_fisica: "",
    ubicacion_exacta: "",
    estado: "" as EstadoType | "",
    contacto: "",
    nota_adicional: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Update status state
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateId, setUpdateId] = useState("");
  const [updateNombre, setUpdateNombre] = useState("");
  const [updateEstado, setUpdateEstado] = useState<EstadoType | "">("");
  const [updateNota, setUpdateNota] = useState("");
  const [updating, setUpdating] = useState(false);

  // ── Fetch ──
  const fetchReportes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/reportes");
      if (!res.ok) throw new Error("Error al cargar reportes");
      const data = await res.json();
      setReportes(data.reportes);
      if (data.metrics) setMetrics(data.metrics);
    } catch {
      toast({ title: "Error", description: "No se pudieron cargar los reportes", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchReportes(); }, [fetchReportes]);

  // ── Filter + Search ──
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      let base = reportes;
      // Tab filter
      if (activeTab === "desconocidos") {
        base = base.filter((r) => r.tipoReporte === "Sin Identificar");
      } else if (activeTab === "reportes") {
        base = base.filter((r) => r.tipoReporte === "Conocido");
      }
      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        base = base.filter(
          (r) =>
            (r.nombreCompleto?.toLowerCase().includes(q)) ||
            r.ubicacionExacta.toLowerCase().includes(q) ||
            (r.descripcionFisica?.toLowerCase().includes(q))
        );
      }
      setFilteredReportes(base);
    }, 200);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [searchQuery, reportes, activeTab]);

  // ── Online / Offline ──
  useEffect(() => {
    const on = () => {
      setIsOnline(true);
      const pending = localStorage.getItem("pendingReports");
      if (pending) {
        try {
          const items = JSON.parse(pending) as Array<Record<string, unknown>>;
          items.forEach((r) => fetch("/api/reportes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) }).catch(() => {}));
          localStorage.removeItem("pendingReports");
          toast({ title: "Sincronizado", description: `${items.length} reporte(s) pendiente(s) enviado(s)` });
          fetchReportes();
        } catch { /* ignore */ }
      }
    };
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    setIsOnline(navigator.onLine);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [toast, fetchReportes]);

  // ── Submit ──
  function validate(): boolean {
    const err: Record<string, string> = {};
    if (dialogMode === "conocido") {
      if (!formConocido.nombre_completo.trim()) err.nombre = "Nombre requerido";
      if (!formConocido.ubicacion_exacta.trim()) err.ubicacion = "Ubicación requerida";
      if (!formConocido.estado) err.estado = "Seleccione un estado";
      if (!formConocido.contacto.trim()) err.contacto = "Contacto requerido";
    } else {
      if (!formDesconocido.descripcion_fisica.trim()) err.descripcion = "Descripción física requerida";
      if (!formDesconocido.ubicacion_exacta.trim()) err.ubicacion = "Ubicación requerida";
      if (!formDesconocido.estado) err.estado = "Seleccione un estado";
      if (!formDesconocido.contacto.trim()) err.contacto = "Contacto requerido";
    }
    setFormErrors(err);
    return Object.keys(err).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const payload = dialogMode === "conocido"
      ? { id, tipo_reporte: "Conocido", nombre_completo: formConocido.nombre_completo.trim(), ubicacion_exacta: formConocido.ubicacion_exacta.trim(), estado: formConocido.estado, contacto: formConocido.contacto.trim(), nota_adicional: formConocido.nota_adicional.trim() || undefined }
      : { id, tipo_reporte: "Sin Identificar", descripcion_fisica: formDesconocido.descripcion_fisica.trim(), ubicacion_exacta: formDesconocido.ubicacion_exacta.trim(), estado: formDesconocido.estado, contacto: formDesconocido.contacto.trim(), nota_adicional: formDesconocido.nota_adicional.trim() || undefined };

    try {
      if (!navigator.onLine) {
        const pending = JSON.parse(localStorage.getItem("pendingReports") || "[]");
        pending.push({ ...payload, timestamp: Date.now() });
        localStorage.setItem("pendingReports", JSON.stringify(pending));
        toast({ title: "Guardado offline", description: "Se enviará al recuperar conexión" });
      } else {
        const res = await fetch("/api/reportes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al enviar");
        toast({ title: "Reporte enviado", description: "La IA está analizando la urgencia..." });
      }
      setFormConocido({ nombre_completo: "", ubicacion_exacta: "", estado: "", contacto: "", nota_adicional: "" });
      setFormDesconocido({ descripcion_fisica: "", ubicacion_exacta: "", estado: "", contacto: "", nota_adicional: "" });
      setFormErrors({});
      setDialogOpen(false);
      fetchReportes();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Error desconocido", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function openDialog(mode: "conocido" | "desconocido") {
    setDialogMode(mode);
    setFormErrors({});
    setDialogOpen(true);
  }

  // ── Update Status ──
  function openUpdateDialog(reporte: Reporte) {
    setUpdateId(reporte.id);
    setUpdateNombre(reporte.nombreCompleto || "Persona sin identificar");
    setUpdateEstado(reporte.estado as EstadoType);
    setUpdateNota("");
    setUpdateOpen(true);
  }

  async function handleUpdateEstado() {
    if (!updateEstado) return;
    setUpdating(true);
    try {
      const res = await fetch("/api/reportes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: updateId, estado: updateEstado, nota_actualizacion: updateNota.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al actualizar");
      toast({ title: "Estado actualizado", description: `${updateNombre} → ${updateEstado}` });
      setUpdateOpen(false);
      fetchReportes();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Error desconocido", variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  }

  // ── Tab config ──
  const tabs: { key: TabType; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "reportes", label: "Reportes", icon: <Users className="size-4" />, count: metrics?.conocidos },
    { key: "desconocidos", label: "Sin Identificar", icon: <UserX className="size-4" />, count: metrics?.sinIdentificar },
    { key: "metricas", label: "Métricas", icon: <BarChart3 className="size-4" /> },
  ];

  // ── Progress bar helper ──
  function MetricBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-[#1a1a1a]">{label}</span>
          <span className="text-muted-foreground">{value} <span className="text-xs">({pct}%)</span></span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={`h-full rounded-full ${color}`}
          />
        </div>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="min-h-screen flex flex-col">
      {/* Offline Banner */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="bg-urgency-5 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 overflow-hidden">
            <WifiOff className="size-4" /> Sin conexión — Los reportes se guardarán localmente
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-[#1a1a1a] text-white sticky top-0 z-40 shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#e86100] rounded-lg p-2"><AlertTriangle className="size-5 text-white" /></div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight">EmergenciaVE</h1>
              <p className="text-xs text-gray-400 hidden sm:block">Sistema Nacional de Reportes de Emergencia</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${isOnline ? "bg-emergency-safe/20 text-emergency-safe" : "bg-urgency-5/20 text-urgency-5"}`}>
              <span className={`size-2 rounded-full ${isOnline ? "bg-emergency-safe" : "bg-urgency-5 urgency-pulse"}`} />
              {isOnline ? "En línea" : "Sin conexión"}
            </div>
            <div className="flex gap-1">
              <Button onClick={() => openDialog("conocido")} size="sm" className="bg-[#e86100] hover:bg-[#d45700] text-white font-semibold gap-1.5 rounded-xl px-3 sm:px-4 shadow-lg shadow-[#e86100]/25 active:scale-95 transition-all">
                <Plus className="size-4" /><span className="hidden sm:inline">Reportar</span>
              </Button>
              <Button onClick={() => openDialog("desconocido")} size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10 rounded-xl px-3 sm:px-4 active:scale-95 transition-all">
                <HelpCircle className="size-4" /><span className="hidden sm:inline">Desconocido</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-transparent z-10" />
        <img src="/hero-emergency.png" alt="Emergencia" className="w-full h-40 sm:h-56 md:h-64 object-cover" />
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-white text-center px-4">
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6 }}>
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight drop-shadow-lg">
              Reporta. Busca. <span className="text-[#ff8c33]">Rescata.</span>
            </h2>
            <p className="mt-2 text-sm sm:text-base md:text-lg text-gray-200 max-w-xl mx-auto">
              Plataforma de respuesta rápida para localizar personas tras un desastre natural en Venezuela
            </p>
          </motion.div>
        </div>
      </section>

      {/* Solidarity Banner */}
      <section className="bg-gradient-to-r from-[#e86100] via-[#ff8c33] to-[#e86100] text-white">
        <div className="max-w-6xl mx-auto px-4 py-3.5 sm:py-4 text-center">
          <p className="text-sm sm:text-base font-medium leading-relaxed">
            🇻🇪&nbsp; Con toda nuestra solidaridad y apoyo al pueblo venezolano ante la emergencia.
            <br className="hidden sm:block" />
            <span className="block sm:inline mt-1 sm:mt-0 text-white/90">Juntos somos más fuertes. Esta herramienta es para ti, para tu familia, para todos.</span>
          </p>
        </div>
      </section>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-5 space-y-5">
        {/* Quick Stats Row */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { label: "Total Reportes", value: metrics.total, icon: <FileText className="size-5" />, color: "text-[#e86100]", bg: "bg-[#e86100]/10 border-[#e86100]/20" },
              { label: "A salvo", value: metrics.aSalvo, icon: <Shield className="size-5" />, color: "text-emergency-safe", bg: "bg-emergency-safe/10 border-emergency-safe/20" },
              { label: "Heridos", value: metrics.heridos, icon: <Heart className="size-5" />, color: "text-emergency-injured", bg: "bg-emergency-injured/10 border-emergency-injured/20" },
              { label: "Desaparecidos", value: metrics.desaparecidos, icon: <Eye className="size-5" />, color: "text-emergency-missing", bg: "bg-emergency-missing/10 border-emergency-missing/20" },
            ].map((s) => (
              <Card key={s.label} className={`border ${s.bg}`}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`${s.color} p-2 rounded-lg`}>{s.icon}</div>
                  <div>
                    <p className="text-2xl sm:text-3xl font-bold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSearchQuery(""); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-white text-[#e86100] shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              <span className="hidden xs:inline">{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? "bg-[#e86100]/10 text-[#e86100]" : "bg-gray-200 text-gray-500"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ─── TAB: Reportes / Desconocidos ─── */}
        {(activeTab === "reportes" || activeTab === "desconocidos") && (
          <>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
              <Input
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={activeTab === "desconocidos" ? "Buscar por descripción o ubicación..." : "Buscar por nombre o ubicación..."}
                className="pl-12 pr-10 py-5 text-base rounded-2xl border-2 border-[#d4d4d4] focus:border-[#e86100] bg-white shadow-sm h-auto"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="size-5" /></button>
              )}
            </div>

            {/* Status filters */}
            <div className="flex flex-wrap gap-2">
              {(["Todos", "A salvo", "Herido", "Desaparecido", "En tránsito"] as const).map((f) => {
                const c = f === "Todos" ? filteredReportes.length : filteredReportes.filter((r) => r.estado === f).length;
                return (
                  <button key={f} onClick={() => {
                    if (f === "Todos") { setSearchQuery(""); } 
                    else { setFilteredReportes(reportes.filter((r) => r.tipoReporte === (activeTab === "desconocidos" ? "Sin Identificar" : "Conocido") && r.estado === f)); setSearchQuery(""); }
                  }} className="px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium border border-[#d4d4d4] bg-white hover:bg-[#fff3e6] hover:border-[#e86100] transition-all active:scale-95">
                    {f} <span className="text-muted-foreground font-normal">({c})</span>
                  </button>
                );
              })}
            </div>

            {/* List */}
            {loading ? (
              <div className="grid gap-3">{Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="border border-[#d4d4d4]"><CardContent className="p-4"><div className="flex items-start gap-4"><Skeleton className="size-12 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-full max-w-sm" /></div></div></CardContent></Card>
              ))}</div>
            ) : filteredReportes.length === 0 ? (
              <div className="text-center py-14 px-4">
                <div className="bg-gray-100 rounded-full w-20 h-20 mx-auto flex items-center justify-center mb-4">
                  {activeTab === "desconocidos" ? <UserX className="size-8 text-gray-400" /> : <Search className="size-8 text-gray-400" />}
                </div>
                <h3 className="text-lg font-semibold text-gray-600">{reportes.length === 0 ? "Sin reportes aún" : "Sin resultados"}</h3>
                <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
                  {activeTab === "desconocidos" ? "No hay personas sin identificar reportadas." : "Intenta con otro nombre o ubicación."}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 custom-scrollbar max-h-[55vh] overflow-y-auto pr-1">
                <AnimatePresence mode="popLayout">
                  {filteredReportes.map((r, i) => {
                    const isUnknown = r.tipoReporte === "Sin Identificar";
                    const estCfg = estadoConfig[r.estado] || estadoConfig["Desaparecido"];
                    return (
                      <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2, delay: i * 0.02 }}>
                        <Card className="border border-[#d4d4d4] bg-white hover:shadow-md transition-all hover:border-[#e86100]/30">
                          <CardContent className="p-4 sm:p-5">
                            <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                              {/* Avatar */}
                              <div className={`shrink-0 size-11 sm:size-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                                r.estado === "A salvo" ? "bg-emergency-safe" : r.estado === "Herido" ? "bg-emergency-injured" : r.estado === "En tránsito" ? "bg-urgency-2" : "bg-[#e86100]"
                              }`}>
                                {isUnknown ? <HelpCircle className="size-5" /> : (r.nombreCompleto?.charAt(0).toUpperCase() || "?")}
                              </div>
                              <div className="flex-1 min-w-0">
                                {/* Title + badges */}
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  {isUnknown ? (
                                    <h3 className="text-base font-bold text-[#e86100]">Persona sin identificar</h3>
                                  ) : (
                                    <h3 className="text-base font-bold truncate">{r.nombreCompleto}</h3>
                                  )}
                                  <Badge variant="outline" className={`${estCfg.bg} ${estCfg.color} border gap-1 text-xs font-semibold`}>
                                    {estCfg.icon}{estCfg.label}
                                  </Badge>
                                  {r.urgenciaAi && (
                                    <Badge variant="outline" className={`${urgencyConfig[r.urgenciaAi]?.bg} ${urgencyConfig[r.urgenciaAi]?.color} border gap-1 text-xs font-semibold ${r.urgenciaAi >= 4 ? "urgency-pulse" : ""}`}>
                                      <Activity className="size-3" />{r.urgenciaAi}/5 — {r.prioridadDesc || urgencyConfig[r.urgenciaAi]?.label}
                                    </Badge>
                                  )}
                                </div>
                                {/* Description for unknowns */}
                                {isUnknown && r.descripcionFisica && (
                                  <p className="text-sm text-gray-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 mb-2 italic">"{r.descripcionFisica}"</p>
                                )}
                                {/* Location */}
                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                                  <MapPin className="size-3.5 shrink-0" /><span className="truncate">{r.ubicacionExacta}</span>
                                </div>
                                {/* Contact */}
                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1.5">
                                  <Phone className="size-3.5 shrink-0" /><span>{r.contacto}</span>
                                </div>
                                {/* Note */}
                                {r.notaAdicional && (
                                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mb-2 border border-gray-100">{r.notaAdicional}</p>
                                )}
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                    <Clock className="size-3" />{formatRelativeTime(r.fechaRegistro)}
                                  </div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openUpdateDialog(r); }}
                                    className="flex items-center gap-1.5 text-xs font-medium text-[#e86100] hover:text-[#d45700] hover:bg-[#e86100]/10 rounded-lg px-2.5 py-1.5 transition-all active:scale-95"
                                    title="Actualizar estado"
                                  >
                                    <RefreshCw className="size-3.5" />
                                    <span className="hidden sm:inline">Actualizar estado</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </>
        )}

        {/* ─── TAB: Métricas ─── */}
        {activeTab === "metricas" && (
          <>
            {!metrics ? (
              <div className="grid gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                {/* Summary header */}
                <Card className="border border-[#e86100]/20 bg-gradient-to-r from-[#fff7ed] to-white">
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="bg-[#e86100] p-2.5 rounded-xl"><TrendingUp className="size-5 text-white" /></div>
                      <div>
                        <h3 className="text-lg font-bold text-[#1a1a1a]">Panel de Métricas</h3>
                        <p className="text-sm text-muted-foreground">Resumen en tiempo real de la emergencia</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-white rounded-xl p-3 border border-gray-100">
                        <p className="text-2xl sm:text-3xl font-extrabold text-[#e86100]">{metrics.total}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Total</p>
                      </div>
                      <div className="bg-white rounded-xl p-3 border border-gray-100">
                        <p className="text-2xl sm:text-3xl font-extrabold text-emergency-safe">{metrics.aSalvo}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Rescatados</p>
                      </div>
                      <div className="bg-white rounded-xl p-3 border border-gray-100">
                        <p className="text-2xl sm:text-3xl font-extrabold text-emergency-injured">{metrics.heridos + metrics.desaparecidos}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">En Riesgo</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* By Status */}
                <Card className="border border-[#d4d4d4]">
                  <CardContent className="p-5 sm:p-6 space-y-4">
                    <h4 className="font-bold text-[#1a1a1a] flex items-center gap-2"><Activity className="size-5 text-[#e86100]" />Por Estado</h4>
                    <MetricBar label="✅ A salvo" value={metrics.aSalvo} total={metrics.total} color="bg-emergency-safe" />
                    <MetricBar label="🏥 Heridos" value={metrics.heridos} total={metrics.total} color="bg-emergency-injured" />
                    <MetricBar label="🔍 Desaparecidos" value={metrics.desaparecidos} total={metrics.total} color="bg-[#e86100]" />
                    <MetricBar label="🚚 En tránsito" value={metrics.enTransito} total={metrics.total} color="bg-urgency-2" />
                  </CardContent>
                </Card>

                {/* By Type */}
                <Card className="border border-[#d4d4d4]">
                  <CardContent className="p-5 sm:p-6 space-y-4">
                    <h4 className="font-bold text-[#1a1a1a] flex items-center gap-2"><Users className="size-5 text-[#e86100]" />Por Tipo de Reporte</h4>
                    <MetricBar label="👤 Conocidos" value={metrics.conocidos} total={metrics.total} color="bg-[#e86100]" />
                    <MetricBar label="❓ Sin Identificar" value={metrics.sinIdentificar} total={metrics.total} color="bg-[#8b5cf6]" />
                  </CardContent>
                </Card>

                {/* AI Analysis */}
                <Card className="border border-[#d4d4d4]">
                  <CardContent className="p-5 sm:p-6 space-y-4">
                    <h4 className="font-bold text-[#1a1a1a] flex items-center gap-2"><TrendingUp className="size-5 text-[#e86100]" />Análisis de IA</h4>
                    <MetricBar label="🤖 Clasificados por IA" value={metrics.conIa} total={metrics.total} color="bg-[#e86100]" />
                    <MetricBar label="⏳ Pendientes de IA" value={metrics.pendienteIa} total={metrics.total} color="bg-gray-300" />
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </>
        )}
      </main>

      {/* Floating Mobile Buttons */}
      <div className="sm:hidden fixed bottom-6 right-6 z-50 flex flex-col gap-3">
        <button onClick={() => openDialog("desconocido")} className="bg-[#1a1a1a] text-white rounded-full p-3.5 shadow-2xl active:scale-90 transition-transform" aria-label="Reportar desconocido">
          <HelpCircle className="size-6" />
        </button>
        <button onClick={() => openDialog("conocido")} className="bg-[#e86100] text-white rounded-full p-3.5 shadow-2xl shadow-[#e86100]/40 active:scale-90 transition-transform" aria-label="Nuevo reporte">
          <Plus className="size-6" />
        </button>
      </div>

      {/* ─── Dialog: Report Form ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
              <div className="bg-[#e86100] rounded-lg p-1.5"><Send className="size-4 text-white" /></div>
              {dialogMode === "conocido" ? "Reportar Persona Conocida" : "Reportar Persona Sin Identificar"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "conocido"
                ? "Complete la información de la persona. La IA analizará la urgencia automáticamente."
                : "Reporte una persona encontrada que no sabe quién es o alguien que está siendo buscado."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-4 mt-2">
            {dialogMode === "conocido" ? (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-[#1a1a1a]"><User className="size-4 inline mr-1.5 text-[#e86100]" />Nombre completo *</Label>
                  <Input value={formConocido.nombre_completo} onChange={(e) => setFormConocido({ ...formConocido, nombre_completo: e.target.value })} placeholder="Ej: María García López" className={`py-5 text-base rounded-xl ${formErrors.nombre ? "border-emergency-injured" : "border-[#d4d4d4] focus:border-[#e86100]"}`} />
                  {formErrors.nombre && <p className="text-xs text-emergency-injured">{formErrors.nombre}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-[#1a1a1a]"><MapPin className="size-4 inline mr-1.5 text-[#e86100]" />Ubicación exacta *</Label>
                  <Input value={formConocido.ubicacion_exacta} onChange={(e) => setFormConocido({ ...formConocido, ubicacion_exacta: e.target.value })} placeholder="Ej: Barrio San Martín, calle 123, Caracas, Venezuela" className={`py-5 text-base rounded-xl ${formErrors.ubicacion ? "border-emergency-injured" : "border-[#d4d4d4] focus:border-[#e86100]"}`} />
                  {formErrors.ubicacion && <p className="text-xs text-emergency-injured">{formErrors.ubicacion}</p>}
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-[#1a1a1a]"><UserX className="size-4 inline mr-1.5 text-[#e86100]" />Descripción física *</Label>
                  <Textarea value={formDesconocido.descripcion_fisica} onChange={(e) => setFormDesconocido({ ...formDesconocido, descripcion_fisica: e.target.value })} placeholder="Ej: Hombre, ~60 años, camisa blanca, pantalón oscuro, herida visible en brazo izquierdo. No recuerda su nombre." className={`py-4 text-base rounded-xl border-[#d4d4d4] focus:border-[#e86100] min-h-[90px] ${formErrors.descripcion ? "border-emergency-injured" : ""}`} rows={3} />
                  {formErrors.descripcion && <p className="text-xs text-emergency-injured">{formErrors.descripcion}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-[#1a1a1a]"><MapPin className="size-4 inline mr-1.5 text-[#e86100]" />Dónde fue encontrado *</Label>
                  <Input value={formDesconocido.ubicacion_exacta} onChange={(e) => setFormDesconocido({ ...formDesconocido, ubicacion_exacta: e.target.value })} placeholder="Ej: Refugio temporal Plaza Bolívar, Caracas" className={`py-5 text-base rounded-xl ${formErrors.ubicacion ? "border-emergency-injured" : "border-[#d4d4d4] focus:border-[#e86100]"}`} />
                  {formErrors.ubicacion && <p className="text-xs text-emergency-injured">{formErrors.ubicacion}</p>}
                </div>
              </>
            )}

            {/* Estado */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-[#1a1a1a]"><Activity className="size-4 inline mr-1.5 text-[#e86100]" />Estado *</Label>
              <Select value={dialogMode === "conocido" ? formConocido.estado : formDesconocido.estado} onValueChange={(val) => {
                if (dialogMode === "conocido") setFormConocido({ ...formConocido, estado: val as EstadoType });
                else setFormDesconocido({ ...formDesconocido, estado: val as EstadoType });
              }}>
                <SelectTrigger className={`w-full py-5 text-base rounded-xl ${formErrors.estado ? "border-emergency-injured" : "border-[#d4d4d4]"}`}><SelectValue placeholder="Seleccionar estado..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A salvo"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-emergency-safe" />A salvo</span></SelectItem>
                  <SelectItem value="Herido"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-emergency-injured" />Herido</span></SelectItem>
                  <SelectItem value="Desaparecido"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-[#e86100]" />Desaparecido</span></SelectItem>
                  <SelectItem value="En tránsito"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-urgency-2" />En tránsito</span></SelectItem>
                </SelectContent>
              </Select>
              {formErrors.estado && <p className="text-xs text-emergency-injured">{formErrors.estado}</p>}
            </div>

            {/* Contacto */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-[#1a1a1a]"><Phone className="size-4 inline mr-1.5 text-[#e86100]" />Teléfono o contacto *</Label>
              <Input
                value={dialogMode === "conocido" ? formConocido.contacto : formDesconocido.contacto}
                onChange={(e) => {
                  if (dialogMode === "conocido") setFormConocido({ ...formConocido, contacto: e.target.value });
                  else setFormDesconocido({ ...formDesconocido, contacto: e.target.value });
                }}
                placeholder="Ej: +58 412 555-1234"
                className={`py-5 text-base rounded-xl ${formErrors.contacto ? "border-emergency-injured" : "border-[#d4d4d4] focus:border-[#e86100]"}`}
              />
              {formErrors.contacto && <p className="text-xs text-emergency-injured">{formErrors.contacto}</p>}
            </div>

            {/* Nota */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-[#1a1a1a]"><FileText className="size-4 inline mr-1.5 text-[#e86100]" />Nota adicional (opcional)</Label>
              <Textarea
                value={dialogMode === "conocido" ? formConocido.nota_adicional : formDesconocido.nota_adicional}
                onChange={(e) => {
                  if (dialogMode === "conocido") setFormConocido({ ...formConocido, nota_adicional: e.target.value });
                  else setFormDesconocido({ ...formDesconocido, nota_adicional: e.target.value });
                }}
                placeholder={dialogMode === "conocido" ? "Información extra: heridas, necesidades, última vez visto..." : "Detalles adicionales: quién lo encontró, a dónde fue trasladado..."}
                className="py-4 text-base rounded-xl border-[#d4d4d4] focus:border-[#e86100] min-h-[70px]"
                rows={2}
              />
            </div>

            <Button type="submit" disabled={submitting} className="w-full bg-[#e86100] hover:bg-[#d45700] text-white font-bold text-base py-6 rounded-xl shadow-lg shadow-[#e86100]/25 transition-all active:scale-[0.98] disabled:opacity-50">
              {submitting ? <><Loader2 className="size-5 animate-spin mr-2" />Enviando...</> : <><Send className="size-5 mr-2" />{dialogMode === "conocido" ? "Enviar Reporte" : "Reportar como Sin Identificar"}</>}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Update Status ─── */}
      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-[#1a1a1a]">
              <div className="bg-[#e86100] rounded-lg p-1.5"><CheckCircle2 className="size-4 text-white" /></div>
              Actualizar Estado
            </DialogTitle>
            <DialogDescription>
              Cambia el estado de <span className="font-semibold text-foreground">{updateNombre}</span>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleUpdateEstado(); }} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-[#1a1a1a]"><Activity className="size-4 inline mr-1.5 text-[#e86100]" />Nuevo estado *</Label>
              <Select value={updateEstado} onValueChange={(val) => setUpdateEstado(val as EstadoType)}>
                <SelectTrigger className="w-full py-5 text-base rounded-xl border-[#d4d4d4]"><SelectValue placeholder="Seleccionar estado..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A salvo"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-emergency-safe" />A salvo — Fue encontrado/a a salvo</span></SelectItem>
                  <SelectItem value="Herido"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-emergency-injured" />Herido — Requiere atención médica</span></SelectItem>
                  <SelectItem value="Desaparecido"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-[#e86100]" />Desaparecido — Sigue sin localizarse</span></SelectItem>
                  <SelectItem value="En tránsito"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-urgency-2" />En tránsito — Siendo trasladado/a</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-[#1a1a1a]"><FileText className="size-4 inline mr-1.5 text-[#e86100]" />Nota de actualización (opcional)</Label>
              <Textarea
                value={updateNota}
                onChange={(e) => setUpdateNota(e.target.value)}
                placeholder="Ej: Fue encontrado en el refugio de Plaza Bolívar. Está bien de salud."
                className="py-4 text-base rounded-xl border-[#d4d4d4] focus:border-[#e86100] min-h-[80px]"
                rows={3}
              />
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setUpdateOpen(false)} className="flex-1 rounded-xl py-5">Cancelar</Button>
              <Button type="submit" disabled={updating || !updateEstado} className="flex-1 bg-[#e86100] hover:bg-[#d45700] text-white font-bold text-base py-5 rounded-xl shadow-lg shadow-[#e86100]/25 transition-all disabled:opacity-50">
                {updating ? <><Loader2 className="size-4 animate-spin mr-2" />Actualizando...</> : <><CheckCircle2 className="size-4 mr-2" />Confirmar</>}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="bg-[#1a1a1a] text-gray-400 mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col items-center gap-2.5 text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-[#e86100]" />
            <span className="text-white font-semibold">EmergenciaVE</span>
            <span>— Sistema de Respuesta Rápida</span>
          </div>
          <p className="text-center text-gray-500">Potenciado con IA para clasificación de urgencia · PWA · Funciona sin conexión</p>
          <p className="text-center text-gray-600 text-[11px]">© {new Date().getFullYear()} Alserla Holdings LLC. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}