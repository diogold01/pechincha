"use client";

import React, { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, RefreshCw, AlertCircle } from "lucide-react";

interface QrCodeScannerProps {
  onScan: (decodedText: string) => void;
  ativo: boolean;
}

export default function QrCodeScanner({ onScan, ativo }: QrCodeScannerProps) {
  const [iniciado, setIniciado] = useState(false);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [cameraTraseira, setCameraTraseira] = useState(true);
  const scannerRef = useRef<any>(null);
  const elementId = "html5qr-code-scanner-region";

  useEffect(() => {
    let cancelado = false;

    async function initScanner() {
      if (!ativo) return;

      try {
        setErroCamera(null);
        const { Html5Qrcode } = await import("html5-qrcode");

        if (cancelado) return;

        // Se já houver uma instância rodando, para antes de recriar
        if (scannerRef.current) {
          try {
            await scannerRef.current.stop();
          } catch {
            // Silencioso
          }
        }

        const html5QrCode = new Html5Qrcode(elementId);
        scannerRef.current = html5QrCode;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        };

        const facingMode = cameraTraseira ? "environment" : "user";

        await html5QrCode.start(
          { facingMode },
          config,
          (decodedText) => {
            // Sucesso ao ler o QR Code
            if (decodedText && decodedText.trim().length > 0) {
              onScan(decodedText.trim());
            }
          },
          () => {
            // Frames sem QR code (esperado enquanto busca)
          }
        );

        if (!cancelado) {
          setIniciado(true);
        }
      } catch (err: any) {
        if (!cancelado) {
          setIniciado(false);
          const msg = (err?.message || "").toLowerCase();
          if (msg.includes("permission") || msg.includes("notallowed")) {
            setErroCamera("Permissão de câmera negada. Autorize o acesso à câmera no seu navegador.");
          } else {
            setErroCamera("Não foi possível acessar a câmera do aparelho.");
          }
        }
      }
    }

    if (ativo) {
      initScanner();
    }

    return () => {
      cancelado = true;
      if (scannerRef.current) {
        try {
          scannerRef.current.stop().catch(() => {});
        } catch {
          // Silencioso
        }
      }
    };
  }, [ativo, cameraTraseira, onScan]);

  function alternarCamera() {
    setCameraTraseira((prev) => !prev);
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {/* Container visual da câmera */}
      <div className="relative w-full max-w-sm aspect-square bg-black rounded-3xl overflow-hidden border-2 border-border shadow-inner flex items-center justify-center">
        <div id={elementId} className="w-full h-full object-cover" />

        {/* Guia de mira visual quando a câmera estiver ativa */}
        {iniciado && !erroCamera && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-56 h-56 border-2 border-primary/70 rounded-2xl relative animate-pulse">
              <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-primary rounded-tl-lg" />
              <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-primary rounded-tr-lg" />
              <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-primary rounded-bl-lg" />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-primary rounded-br-lg" />
            </div>
          </div>
        )}

        {/* Mensagem de Erro de Câmera */}
        {erroCamera && (
          <div className="absolute inset-0 bg-background/95 p-6 flex flex-col items-center justify-center text-center gap-3">
            <CameraOff className="w-10 h-10 text-budget-red" />
            <p className="text-xs font-semibold text-budget-red-text max-w-xs">
              {erroCamera}
            </p>
          </div>
        )}

        {/* Loading inicial da Câmera */}
        {!iniciado && !erroCamera && (
          <div className="absolute inset-0 bg-background/90 flex flex-col items-center justify-center gap-2">
            <Camera className="w-8 h-8 text-primary animate-bounce" />
            <span className="text-xs font-semibold text-text-muted">
              Iniciando câmera...
            </span>
          </div>
        )}
      </div>

      {/* Controles da Câmera */}
      {iniciado && !erroCamera && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={alternarCamera}
            className="h-10 px-3.5 rounded-full bg-card border border-border text-xs font-bold text-text-muted hover:text-text-main flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Alternar câmera ({cameraTraseira ? "Traseira" : "Frontal"})</span>
          </button>
        </div>
      )}
    </div>
  );
}
