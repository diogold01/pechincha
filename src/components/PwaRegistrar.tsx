"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

/**
 * Registra o Service Worker (/sw.js) no navegador para habilitar instalação PWA,
 * funcionamento resiliente offline e detecção de novas versões sem perda de tela.
 */
export default function PwaRegistrar() {
  const [atualizacaoDisponivel, setAtualizacaoDisponivel] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const tinhaController = Boolean(navigator.serviceWorker.controller);
    let registration: ServiceWorkerRegistration | undefined;

    const verificarAtualizacao = () => {
      registration?.update().catch(() => {});
    };

    const aoTrocarController = () => {
      if (tinhaController) {
        setAtualizacaoDisponivel(true);
      }
    };

    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "visible") {
        verificarAtualizacao();
      }
    };

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
        verificarAtualizacao();
      })
      .catch(() => {
        // Falha silenciosa em ambientes sem suporte
      });

    navigator.serviceWorker.addEventListener("controllerchange", aoTrocarController);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", aoTrocarController);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, []);

  if (!atualizacaoDisponivel) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-primary text-white pl-3.5 pr-2 py-2 rounded-full shadow-lg border border-white/20 text-xs font-bold whitespace-nowrap">
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 cursor-pointer hover:opacity-90"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>Nova versão do app disponível · Toque para atualizar</span>
      </button>
      <button
        type="button"
        onClick={() => setAtualizacaoDisponivel(false)}
        aria-label="Fechar aviso de atualização"
        className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 cursor-pointer"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
