"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, ShieldAlert, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // No mostrar si ya está instalado (PWA en modo standalone)
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    // No mostrar en iOS Safari (no soporta beforeinstallprompt)
    if (!window.matchMedia("(display-mode: browser)").matches) return;
    // No mostrar si ya fue descartado (persiste 7 días)
    const dismissedAt = localStorage.getItem("pwa-dismissed");
    if (dismissedAt && Date.now() - Number(dismissedAt) < 7 * 24 * 60 * 60 * 1000) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Mostrar después de 4 segundos para no interrumpir la carga
      setTimeout(() => setVisible(true), 4000);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Cerrar temporalmente (7 días)
  const handleDismiss = () => {
    setVisible(false);
    setDismissed(true);
    localStorage.setItem("pwa-dismissed", String(Date.now()));
  };

  // Disparar el prompt de instalación nativo
  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  // No renderizar si no hay prompt disponible, ya se descartó, o está en standalone
  if (!visible || dismissed || !deferredPrompt) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-20 left-3 right-3 sm:left-auto sm:right-4 sm:w-[380px] z-50"
        >
          <div className="relative bg-white rounded-2xl shadow-2xl border border-orange-200/60 overflow-hidden">
            {/* Barra decorativa superior */}
            <div className="h-1 bg-gradient-to-r from-[#e86100] via-red-500 to-[#e86100]" />

            <div className="p-4">
              {/* Botón cerrar */}
              <button
                onClick={handleDismiss}
                className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="size-4" />
              </button>

              {/* Contenido */}
              <div className="flex items-start gap-3.5">
                {/* Ícono */}
                <div className="shrink-0 w-12 h-12 rounded-xl bg-[#e86100]/10 flex items-center justify-center">
                  <Smartphone className="size-6 text-[#e86100]" />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-gray-900 mb-1 pr-6">
                    ¿Vives en una zona de riesgo?
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Instala esta app en tu teléfono para tener acceso instantáneo al sistema de emergencias, incluso sin señal.
                  </p>

                  {/* Botones */}
                  <div className="flex items-center gap-2 mt-3">
                    <Button
                      onClick={handleInstall}
                      size="sm"
                      className="bg-[#e86100] hover:bg-[#d45500] text-white text-xs font-semibold gap-1.5 h-9 px-4 shadow-sm shadow-orange-200"
                    >
                      <Download className="size-3.5" />
                      Instalar App
                    </Button>
                    <button
                      onClick={handleDismiss}
                      className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors px-2"
                    >
                      Ahora no
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Indicador de seguridad */}
            <div className="bg-gray-50 px-4 py-2 flex items-center gap-1.5 text-[10px] text-gray-400">
              <ShieldAlert className="size-3 text-[#e86100]/50" />
              Acceso rápido a reportes y alertas sísmicas en tu pantalla de inicio
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}