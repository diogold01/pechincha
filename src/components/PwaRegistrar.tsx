"use client";

import { useEffect } from "react";

/**
 * Registra o Service Worker (/sw.js) no navegador para habilitar instalação PWA
 * e funcionamento resiliente com sinal fraco dentro do mercado.
 */
export default function PwaRegistrar() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Falha silenciosa em ambientes sem suporte
      });
    }
  }, []);

  return null;
}
