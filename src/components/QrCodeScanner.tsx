"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  RefreshCw,
  ZoomIn,
  Image as ImageIcon,
  Sparkles,
  AlertCircle,
} from "lucide-react";

interface QrCodeScannerProps {
  onScan: (decodedText: string) => void;
  ativo: boolean;
}

export default function QrCodeScanner({ onScan, ativo }: QrCodeScannerProps) {
  const [iniciado, setIniciado] = useState(false);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [cameraTraseira, setCameraTraseira] = useState(true);
  const [zoomAtual, setZoomAtual] = useState<number>(1);
  const [lendoFoto, setLendoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState<string | null>(null);

  const scannerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const elementId = "html5qr-code-scanner-region";
  const helperElementId = "html5qr-file-helper";

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
          fps: 15,
          qrbox: { width: 260, height: 260 },
          aspectRatio: 1.0,
        };

        // Preferência por câmera de alta resolução com foco contínuo
        const videoConstraints: MediaTrackConstraints = {
          facingMode: cameraTraseira ? { ideal: "environment" } : { ideal: "user" },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        };

        await html5QrCode.start(
          videoConstraints,
          config,
          (decodedText) => {
            if (decodedText && decodedText.trim().length > 0) {
              onScan(decodedText.trim());
            }
          },
          () => {
            // Frames em busca de QR code
          }
        );

        if (!cancelado) {
          setIniciado(true);
          // Tenta aplicar foco contínuo no hardware da câmera após a inicialização do stream
          setTimeout(async () => {
            try {
              await html5QrCode.applyVideoConstraints({
                advanced: [{ focusMode: "continuous" } as any],
              } as any);
            } catch {
              // Navegador ou hardware sem suporte a focusMode ignora
            }
          }, 600);
        }
      } catch (err: any) {
        if (!cancelado) {
          setIniciado(false);
          const msg = (err?.message || "").toLowerCase();
          if (msg.includes("permission") || msg.includes("notallowed")) {
            setErroCamera(
              "Permissão de câmera negada. Autorize o acesso à câmera no seu navegador."
            );
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

  async function alternarZoom(nivel: number) {
    setZoomAtual(nivel);
    if (scannerRef.current) {
      try {
        await scannerRef.current.applyVideoConstraints({
          advanced: [{ zoom: nivel } as any],
        });
      } catch {
        // Dispositivos que não suportam zoom programático mantêm normal
      }
    }
  }

  // Leitura de foto capturada pelo aplicativo nativo de câmera ou galeria
  async function handleFotoArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLendoFoto(true);
    setErroFoto(null);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scannerArquivo = new Html5Qrcode(helperElementId);
      const decodedText = await scannerArquivo.scanFile(file, false);
      try {
        scannerArquivo.clear();
      } catch {}

      if (decodedText && decodedText.trim().length > 0) {
        onScan(decodedText.trim());
      } else {
        setErroFoto("Não conseguimos ler o QR Code nesta foto. Tente tirar mais perto ou com mais iluminação.");
      }
    } catch {
      setErroFoto("QR Code não identificado na imagem. Aproxime a foto do quadradinho preto e branco.");
    } finally {
      setLendoFoto(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {/* Container visual da câmera */}
      <div className="relative w-full max-w-sm aspect-square bg-black rounded-3xl overflow-hidden border-2 border-border shadow-inner flex items-center justify-center">
        <div id={elementId} className="w-full h-full object-cover" />

        {/* Guia de mira visual quando a câmera estiver ativa */}
        {iniciado && !erroCamera && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-60 h-60 border-2 border-primary/70 rounded-2xl relative animate-pulse">
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-lg" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-lg" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-lg" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-lg" />
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

        {/* Loading inicial da Câmera ou Processando Foto */}
        {(!iniciado && !erroCamera) || lendoFoto ? (
          <div className="absolute inset-0 bg-background/90 flex flex-col items-center justify-center gap-2">
            <Camera className="w-8 h-8 text-primary animate-bounce" />
            <span className="text-xs font-semibold text-text-muted">
              {lendoFoto ? "Lendo QR Code da foto..." : "Iniciando câmera..."}
            </span>
          </div>
        ) : null}
      </div>

      {/* Controles de Foco, Zoom e Alternar Câmera */}
      {iniciado && !erroCamera && (
        <div className="flex flex-wrap items-center justify-center gap-2 w-full max-w-sm">
          {/* Seletor de Zoom (Ajuda a focar papel sem precisar aproximar demais) */}
          <div className="flex items-center bg-card border border-border rounded-full p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => alternarZoom(1)}
              className={`h-8 px-3 rounded-full text-xs font-bold transition-all cursor-pointer ${
                zoomAtual === 1
                  ? "bg-primary text-white"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              1x
            </button>
            <button
              type="button"
              onClick={() => alternarZoom(2)}
              className={`h-8 px-3 rounded-full text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                zoomAtual === 2
                  ? "bg-primary text-white"
                  : "text-text-muted hover:text-text-main"
              }`}
              title="Aumenta o zoom para focar o papel a 25cm"
            >
              <ZoomIn className="w-3 h-3" />
              <span>2x (Foco Papel)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={alternarCamera}
            className="h-9 px-3.5 rounded-full bg-card border border-border text-xs font-bold text-text-muted hover:text-text-main flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{cameraTraseira ? "Traseira" : "Frontal"}</span>
          </button>
        </div>
      )}

      {/* Alerta de erro da foto */}
      {erroFoto && (
        <div className="bg-budget-red-bg text-budget-red-text px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 max-w-sm w-full">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{erroFoto}</span>
        </div>
      )}

      {/* Botões de Ação para Fotos Nítidas (Solução definitiva para problemas de foco) */}
      <div className="w-full max-w-sm flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-12 bg-primary/10 border border-primary/30 hover:bg-primary/20 text-primary rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
        >
          <Camera className="w-4 h-4" />
          <span>Tirar foto com o app da câmera (Foco Nítido)</span>
        </button>

        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          className="text-xs font-semibold text-text-muted hover:text-text-main flex items-center justify-center gap-1.5 transition-colors cursor-pointer py-1"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Ou escolher foto do cupom na galeria</span>
        </button>

        {/* Inputs de arquivo ocultos */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFotoArquivo}
          className="hidden"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleFotoArquivo}
          className="hidden"
        />

        {/* Dica simples de leitura */}
        <p className="text-[11px] text-text-muted text-center px-2">
          💡 <strong>Dica:</strong> Para papel térmico, mantenha o celular a cerca de 20cm com boa iluminação ou toque no botão de <strong>2x Zoom</strong>.
        </p>
      </div>

      {/* Elemento oculto auxiliar para leitura de arquivos de foto */}
      <div id={helperElementId} className="hidden" />
    </div>
  );
}
