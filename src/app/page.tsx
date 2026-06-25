"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Plus,
  MapPin,
  Phone,
  User,
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

// --- Types ---
interface Reporte {
  id: string;
  nombreCompleto: string;
  ubicacionExacta: string;
  estado: string;
  contacto: string;
  notaAdicional: string | null;
  urgenciaAi: number | null;
  prioridadDesc: string | null;
  fechaRegistro: string;
}

type EstadoType = "A salvo" | "Herido" | "Desaparecido";

// --- Urgency Config ---
const urgencyConfig: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: "Baja", color: "text-emergency-safe", bg: "bg-emergency-safe/10 border-emergency-safe/30" },
  2: { label: "Moderada", color: "text-urgency-2", bg: "bg-urgency-2/10 border-urgency-2/30" },
  3: { label: "Media", color: "text-urgency-3", bg: "bg-urgency-3/10 border-urgency-3/30" },
  4: { label: "Alta", color: "text-urgency-4", bg: "bg-urgency-4/10 border-urgency-4/30" },
  5: { label: "Crítica", color: "text-urgency-5", bg: "bg-urgency-5/10 border-urgency-5/30" },
};

const estadoConfig: Record<EstadoType, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  "A salvo": { label: "A salvo", color: "text-emergency-safe", bg: "bg-emergency-safe/15", icon: <Shield className="size-4" /> },
  Herido: { label: "Herido", color: "text-emergency-injured", bg: "bg-emergency-injured/15", icon: <Heart className="size-4" /> },
  Desaparecido: { label: "Desaparecido", color: "text-emergency-missing", bg: "bg-emergency-missing/15", icon: <Eye className="size-4" /> },
};

// --- Helpers ---
function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Ahora";
  if (diffMins < 60) return `Hace ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Hace ${diffDays}d`;
}

// --- Component ---
export default function EmergenciaPage() {
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [filteredReportes, setFilteredReportes] = useState<Reporte[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [stats, setStats] = useState({ total: 0, salvo: 0, herido: 0, desaparecido: 0 });
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    nombre_completo: "",
    ubicacion_exacta: "",
    estado: "" as EstadoType | "",
    contacto: "",
    nota_adicional: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { toast } = useToast();

  // Fetch reports
  const fetchReportes = useCallback(async (query?: string) => {
    try {
      setLoading(true);
      const url = query ? `/api/reportes?q=${encodeURIComponent(query)}` : "/api/reportes";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error al cargar reportes");
      const data = await res.json();
      setReportes(data.reportes);
    } catch {
      toast({ title: "Error", description: "No se pudieron cargar los reportes", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchReportes();
  }, [fetchReportes]);

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      if (searchQuery.trim().length === 0) {
        setFilteredReportes(reportes);
      } else {
        const q = searchQuery.toLowerCase();
        const filtered = reportes.filter(
          (r) =>
            r.nombreCompleto.toLowerCase().includes(q) ||
            r.ubicacionExacta.toLowerCase().includes(q)
        );
        setFilteredReportes(filtered);
      }
    }, 250);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery, reportes]);

  // Stats
  useEffect(() => {
    setStats({
      total: reportes.length,
      salvo: reportes.filter((r) => r.estado === "A salvo").length,
      herido: reportes.filter((r) => r.estado === "Herido").length,
      desaparecido: reportes.filter((r) => r.estado === "Desaparecido").length,
    });
  }, [reportes]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Sync pending reports
      const pending = localStorage.getItem("pendingReports");
      if (pending) {
        try {
          const reports = JSON.parse(pending) as Array<Record<string, unknown>>;
          reports.forEach(async (report) => {
            try {
              await fetch("/api/reportes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(report),
              });
            } catch {
              // silently fail
            }
          });
          localStorage.removeItem("pendingReports");
          toast({ title: "Sincronizado", description: `${reports.length} reporte(s) pendiente(s) enviado(s)` });
          fetchReportes();
        } catch {
          // ignore parse error
        }
      }
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [toast, fetchReportes]);

  // Form validation
  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!formData.nombre_completo.trim()) errors.nombre_completo = "Nombre completo requerido";
    if (!formData.ubicacion_exacta.trim()) errors.ubicacion_exacta = "Ubicación requerida";
    if (!formData.estado) errors.estado = "Seleccione un estado";
    if (!formData.contacto.trim()) errors.contacto = "Contacto requerido";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // Submit report
  async function handleSubmit() {
    if (!validateForm()) return;
    setSubmitting(true);

    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const payload = {
      id,
      nombre_completo: formData.nombre_completo.trim(),
      ubicacion_exacta: formData.ubicacion_exacta.trim(),
      estado: formData.estado,
      contacto: formData.contacto.trim(),
      nota_adicional: formData.nota_adicional.trim() || undefined,
    };

    try {
      if (!navigator.onLine) {
        // Save locally for later sync
        const pending = JSON.parse(localStorage.getItem("pendingReports") || "[]");
        pending.push({ ...payload, timestamp: Date.now() });
        localStorage.setItem("pendingReports", JSON.stringify(pending));
        toast({
          title: "Guardado offline",
          description: "Se enviará al recuperar conexión",
          variant: "default",
        });
      } else {
        const res = await fetch("/api/reportes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al enviar reporte");
        toast({ title: "Reporte enviado", description: "La IA está analizando la urgencia..." });
      }

      // Reset form and close
      setFormData({ nombre_completo: "", ubicacion_exacta: "", estado: "", contacto: "", nota_adicional: "" });
      setFormErrors({});
      setDialogOpen(false);
      fetchReportes();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Offline Banner */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-urgency-5 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 overflow-hidden"
          >
            <WifiOff className="size-4" />
            Sin conexión — Los reportes se guardarán localmente
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-[#1a1a1a] text-white sticky top-0 z-40 shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#e86100] rounded-lg p-2">
              <AlertTriangle className="size-5 text-white" />
            </div>
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
            <Button
              onClick={() => setDialogOpen(true)}
              className="bg-[#e86100] hover:bg-[#d45700] text-white font-semibold gap-2 rounded-xl px-4 sm:px-5 py-5 sm:py-2.5 text-base sm:text-sm shadow-lg shadow-[#e86100]/25 transition-all active:scale-95"
              size="lg"
            >
              <Plus className="size-5 sm:size-4" />
              <span className="sm:hidden">Reportar</span>
              <span className="hidden sm:inline">Nuevo Reporte</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-transparent z-10" />
        <img
          src="/hero-emergency.png"
          alt="Emergencia"
          className="w-full h-48 sm:h-64 md:h-72 object-cover"
        />
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
        <div className="max-w-6xl mx-auto px-4 py-4 sm:py-5 text-center">
          <p className="text-sm sm:text-base font-medium leading-relaxed">
            🇻🇪&nbsp; Con toda nuestra solidaridad y apoyo al pueblo venezolano ante la emergencia.
            <br className="hidden sm:block" />
            <span className="block sm:inline mt-1 sm:mt-0 text-white/90">
              Juntos somos más fuertes. Esta herramienta es para ti, para tu familia, para todos.
            </span>
          </p>
        </div>
      </section>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: "Total Reportes", value: stats.total, icon: <FileText className="size-5" />, color: "text-[#e86100]", bg: "bg-[#e86100]/10 border-[#e86100]/20" },
            { label: "A salvo", value: stats.salvo, icon: <Shield className="size-5" />, color: "text-emergency-safe", bg: "bg-emergency-safe/10 border-emergency-safe/20" },
            { label: "Heridos", value: stats.herido, icon: <Heart className="size-5" />, color: "text-emergency-injured", bg: "bg-emergency-injured/10 border-emergency-injured/20" },
            { label: "Desaparecidos", value: stats.desaparecido, icon: <Eye className="size-5" />, color: "text-emergency-missing", bg: "bg-emergency-missing/10 border-emergency-missing/20" },
          ].map((stat) => (
            <motion.div key={stat.label} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }}>
              <Card className={`border ${stat.bg} backdrop-blur-sm`}>
                <CardContent className="p-3 sm:p-4 flex items-center gap-3">
                  <div className={`${stat.color} p-2 rounded-lg`}>{stat.icon}</div>
                  <div>
                    <p className="text-2xl sm:text-3xl font-bold">{stat.value}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Search Bar */}
        <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre o ubicación..."
            className="pl-12 pr-10 py-6 sm:py-5 text-base sm:text-lg rounded-2xl border-2 border-[#d4d4d4] focus:border-[#e86100] bg-white shadow-sm transition-colors h-auto"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-5" />
            </button>
          )}
        </motion.div>

        {/* Filter by status */}
        <div className="flex flex-wrap gap-2">
          {(["Todos", "A salvo", "Herido", "Desaparecido"] as const).map((filter) => {
            const count =
              filter === "Todos"
                ? filteredReportes.length
                : filteredReportes.filter((r) => r.estado === filter).length;
            return (
              <button
                key={filter}
                onClick={() => {
                  if (filter === "Todos") {
                    setSearchQuery("");
                    setFilteredReportes(reportes);
                  } else {
                    setFilteredReportes(reportes.filter((r) => r.estado === filter));
                    setSearchQuery("");
                  }
                }}
                className="px-4 py-2 rounded-full text-sm font-medium border border-[#d4d4d4] bg-white hover:bg-[#fff3e6] hover:border-[#e86100] transition-all active:scale-95"
              >
                {filter}{" "}
                <span className="text-muted-foreground font-normal">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Reports List */}
        <section>
          {loading ? (
            <div className="grid gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="border border-[#d4d4d4]">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-start gap-4">
                      <Skeleton className="size-12 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-full max-w-sm" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredReportes.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16 px-4"
            >
              <div className="bg-gray-100 rounded-full w-20 h-20 mx-auto flex items-center justify-center mb-4">
                <Search className="size-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-600">
                {searchQuery || reportes.length === 0
                  ? "No se encontraron reportes"
                  : "Sin resultados"}
              </h3>
              <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
                {reportes.length === 0
                  ? "Aún no hay reportes. Sé el primero en reportar una persona."
                  : "Intenta con otro nombre o ubicación."}
              </p>
              {!searchQuery && reportes.length === 0 && (
                <Button
                  onClick={() => setDialogOpen(true)}
                  className="mt-6 bg-[#e86100] hover:bg-[#d45700] text-white font-semibold rounded-xl px-6 py-6 text-base shadow-lg shadow-[#e86100]/25"
                  size="lg"
                >
                  <Plus className="size-5 mr-2" />
                  Crear primer reporte
                </Button>
              )}
            </motion.div>
          ) : (
            <div className="grid gap-3 custom-scrollbar max-h-[60vh] overflow-y-auto pr-1">
              <AnimatePresence mode="popLayout">
                {filteredReportes.map((reporte, index) => (
                  <motion.div
                    key={reporte.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                  >
                    <Card className="border border-[#d4d4d4] bg-white hover:shadow-md transition-all hover:border-[#e86100]/30 group">
                      <CardContent className="p-4 sm:p-6">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                          {/* Avatar with status */}
                          <div
                            className={`shrink-0 size-12 sm:size-14 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                              reporte.estado === "A salvo"
                                ? "bg-emergency-safe"
                                : reporte.estado === "Herido"
                                ? "bg-emergency-injured"
                                : "bg-[#e86100]"
                            }`}
                          >
                            {reporte.nombreCompleto.charAt(0).toUpperCase()}
                          </div>

                          <div className="flex-1 min-w-0">
                            {/* Name + badges row */}
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                              <h3 className="text-base sm:text-lg font-bold truncate">
                                {reporte.nombreCompleto}
                              </h3>
                              <Badge
                                variant="outline"
                                className={`${estadoConfig[reporte.estado as EstadoType]?.bg} ${estadoConfig[reporte.estado as EstadoType]?.color} border gap-1 text-xs font-semibold`}
                              >
                                {estadoConfig[reporte.estado as EstadoType]?.icon}
                                {estadoConfig[reporte.estado as EstadoType]?.label}
                              </Badge>
                              {reporte.urgenciaAi && (
                                <Badge
                                  variant="outline"
                                  className={`${urgencyConfig[reporte.urgenciaAi]?.bg} ${urgencyConfig[reporte.urgenciaAi]?.color} border gap-1 text-xs font-semibold ${reporte.urgenciaAi >= 4 ? "urgency-pulse" : ""}`}
                                >
                                  <Activity className="size-3" />
                                  {reporte.urgenciaAi}/5 — {reporte.prioridadDesc || urgencyConfig[reporte.urgenciaAi]?.label}
                                </Badge>
                              )}
                            </div>

                            {/* Location */}
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                              <MapPin className="size-3.5 shrink-0" />
                              <span className="truncate">{reporte.ubicacionExacta}</span>
                            </div>

                            {/* Contact */}
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
                              <Phone className="size-3.5 shrink-0" />
                              <span>{reporte.contacto}</span>
                            </div>

                            {/* Note */}
                            {reporte.notaAdicional && (
                              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mb-2 border border-gray-100">
                                {reporte.notaAdicional}
                              </p>
                            )}

                            {/* Timestamp */}
                            <div className="flex items-center gap-1.5 text-xs text-gray-400">
                              <Clock className="size-3" />
                              {formatRelativeTime(reporte.fechaRegistro)}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>
      </main>

      {/* Floating Mobile Button */}
      <button
        onClick={() => setDialogOpen(true)}
        className="sm:hidden fixed bottom-6 right-6 z-50 bg-[#e86100] text-white rounded-full p-4 shadow-2xl shadow-[#e86100]/40 active:scale-90 transition-transform"
        aria-label="Nuevo reporte"
      >
        <Plus className="size-7" />
      </button>

      {/* New Report Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
              <div className="bg-[#e86100] rounded-lg p-1.5">
                <Send className="size-4 text-white" />
              </div>
              Nuevo Reporte de Emergencia
            </DialogTitle>
            <DialogDescription>
              Complete la información de la persona. La IA analizará automáticamente el nivel de urgencia.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="space-y-4 mt-2"
          >
            {/* Nombre completo */}
            <div className="space-y-2">
              <Label htmlFor="nombre" className="text-sm font-semibold text-[#1a1a1a]">
                <User className="size-4 inline mr-1.5 text-[#e86100]" />
                Nombre completo *
              </Label>
              <Input
                id="nombre"
                value={formData.nombre_completo}
                onChange={(e) => setFormData({ ...formData, nombre_completo: e.target.value })}
                placeholder="Ej: María García López"
                className={`py-5 text-base rounded-xl ${formErrors.nombre_completo ? "border-emergency-injured" : "border-[#d4d4d4] focus:border-[#e86100]"}`}
              />
              {formErrors.nombre_completo && (
                <p className="text-xs text-emergency-injured">{formErrors.nombre_completo}</p>
              )}
            </div>

            {/* Ubicación */}
            <div className="space-y-2">
              <Label htmlFor="ubicacion" className="text-sm font-semibold text-[#1a1a1a]">
                <MapPin className="size-4 inline mr-1.5 text-[#e86100]" />
                Ubicación exacta *
              </Label>
              <Input
                id="ubicacion"
                value={formData.ubicacion_exacta}
                onChange={(e) => setFormData({ ...formData, ubicacion_exacta: e.target.value })}
                placeholder="Ej: Barrio San Martín, calle 123, Caracas"
                className={`py-5 text-base rounded-xl ${formErrors.ubicacion_exacta ? "border-emergency-injured" : "border-[#d4d4d4] focus:border-[#e86100]"}`}
              />
              {formErrors.ubicacion_exacta && (
                <p className="text-xs text-emergency-injured">{formErrors.ubicacion_exacta}</p>
              )}
            </div>

            {/* Estado */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-[#1a1a1a]">
                <Activity className="size-4 inline mr-1.5 text-[#e86100]" />
                Estado *
              </Label>
              <Select
                value={formData.estado}
                onValueChange={(val) => setFormData({ ...formData, estado: val as EstadoType })}
              >
                <SelectTrigger
                  className={`w-full py-5 text-base rounded-xl ${formErrors.estado ? "border-emergency-injured" : "border-[#d4d4d4]"}`}
                >
                  <SelectValue placeholder="Seleccionar estado..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A salvo">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full bg-emergency-safe" />
                      A salvo
                    </span>
                  </SelectItem>
                  <SelectItem value="Herido">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full bg-emergency-injured" />
                      Herido
                    </span>
                  </SelectItem>
                  <SelectItem value="Desaparecido">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full bg-[#e86100]" />
                      Desaparecido
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              {formErrors.estado && (
                <p className="text-xs text-emergency-injured">{formErrors.estado}</p>
              )}
            </div>

            {/* Contacto */}
            <div className="space-y-2">
              <Label htmlFor="contacto" className="text-sm font-semibold text-[#1a1a1a]">
                <Phone className="size-4 inline mr-1.5 text-[#e86100]" />
                Teléfono o contacto *
              </Label>
              <Input
                id="contacto"
                value={formData.contacto}
                onChange={(e) => setFormData({ ...formData, contacto: e.target.value })}
                placeholder="Ej: +58 412 555-1234"
                className={`py-5 text-base rounded-xl ${formErrors.contacto ? "border-emergency-injured" : "border-[#d4d4d4] focus:border-[#e86100]"}`}
              />
              {formErrors.contacto && (
                <p className="text-xs text-emergency-injured">{formErrors.contacto}</p>
              )}
            </div>

            {/* Nota adicional */}
            <div className="space-y-2">
              <Label htmlFor="nota" className="text-sm font-semibold text-[#1a1a1a]">
                <FileText className="size-4 inline mr-1.5 text-[#e86100]" />
                Nota adicional (opcional)
              </Label>
              <Textarea
                id="nota"
                value={formData.nota_adicional}
                onChange={(e) => setFormData({ ...formData, nota_adicional: e.target.value })}
                placeholder="Información extra: heridas visibles, necesidades, última vez visto..."
                className="py-4 text-base rounded-xl border-[#d4d4d4] focus:border-[#e86100] min-h-[80px]"
                rows={3}
              />
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#e86100] hover:bg-[#d45700] text-white font-bold text-base py-6 rounded-xl shadow-lg shadow-[#e86100]/25 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-5 animate-spin mr-2" />
                  Enviando reporte...
                </>
              ) : (
                <>
                  <Send className="size-5 mr-2" />
                  Enviar Reporte de Emergencia
                </>
              )}
            </Button>
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
          <p className="text-center text-gray-500">
            Potenciado con IA para clasificación de urgencia · PWA · Funciona sin conexión
          </p>
          <p className="text-center text-gray-600 text-[11px]">
            © {new Date().getFullYear()} Alserla Holdings LLC. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}