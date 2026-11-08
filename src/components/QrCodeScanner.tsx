"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  RefreshCw,
  ZoomIn,
  Image as ImageIcon,
  AlertCircle,
  Sparkles,
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

  // Estado do Toque para Focar (Tap-to-Focus)
  const [pontoFoco, setPontoFoco] = useState<{ x: number; y: number; ativo: boolean }>({
    x: 0,
    y: 0,
    ativo: false,
  });

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

        // Restrições de vídeo seguras para celular (sem min forçado para evitar OverconstrainedError)
        const videoConstraints = {
          facingMode: cameraTraseira ? "environment" : "user",
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

  // Toque na tela para focar a câmera no ponto tocado (Tap-to-Focus)
  async function handleToqueFocar(
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) {
    if (!iniciado || erroCamera) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const touch =
      "touches" in e
        ? e.touches[0] || (e as React.TouchEvent).changedTouches[0]
        : (e as React.MouseEvent);

    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    setPontoFoco({ x, y, ativo: true });

    try {
      const video = document.querySelector(
        `#${elementId} video`
      ) as HTMLVideoElement | null;
      const stream = video?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()[0];

      if (track) {
        const caps = (track.getCapabilities?.() || {}) as any;
        const settings = track.getSettings?.() || {};

        const sensorX = Math.round((x / rect.width) * (settings.width || 1280));
        const sensorY = Math.round((y / rect.height) * (settings.height || 720));

        // Tenta passar o ponto de interesse para medição do foco
        if ("pointsOfInterest" in caps) {
          try {
            await track.applyConstraints({
              advanced: [{ pointsOfInterest: { x: sensorX, y: sensorY } } as any],
            });
          } catch {}
        }

        // Aciona o motor de foco (single-shot) para focar imediatamente no local
        try {
          await track.applyConstraints({
            advanced: [{ focusMode: "single-shot" } as any],
          });
        } catch {}

        // Restaura para contínuo para manter o foco estável
        setTimeout(async () => {
          try {
            await track.applyConstraints({
              advanced: [{ focusMode: "continuous" } as any],
            });
          } catch {}
        }, 800);
      } else if (scannerRef.current) {
        await scannerRef.current.applyVideoConstraints({
          advanced: [{ focusMode: "single-shot" } as any],
        });
      }
    } catch {
      // Ignora silenciosamente se o hardware não responder
    } finally {
      setTimeout(() => {
        setPontoFoco((prev) => ({ ...prev, ativo: false }));
      }, 1200);
    }
  }

  // Focar no centro da mira via botão
  function focarCentro() {
    const el = document.getElementById(elementId);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = rect.width / 2;
    const y = rect.height / 2;

    setPontoFoco({ x, y, ativo: true });

    const video = document.querySelector(`#${elementId} video`) as HTMLVideoElement | null;
    const stream = video?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()[0];

    if (track) {
      track
        .applyConstraints({
          advanced: [{ focusMode: "single-shot" } as any],
        })
        .catch(() => {})
        .finally(() => {
          setTimeout(() => {
            track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }).catch(() => {});
            setPontoFoco((prev) => ({ ...prev, ativo: false }));
          }, 800);
        });
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
        setErroFoto(
          "Não conseguimos ler o QR Code nesta foto. Tente tirar mais perto ou com mais iluminação."
        );
      }
    } catch {
      setErroFoto(
        "QR Code não identificado na imagem. Aproxime a foto do quadradinho preto e branco."
      );
    } finally {
      setLendoFoto(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {/* Dica de toque para focar */}
      {iniciado && !erroCamera && (
        <p className="text-[11px] font-bold text-primary flex items-center gap-1.5 animate-pulse">
          <span>👆 Toque na imagem para focar a câmera no papel</span>
        </p>
      )}

      {/* Container visual da câmera com suporte a clique/toque para focar */}
      <div
        onClick={handleToqueFocar}
        className="relative w-full max-w-sm aspect-square bg-black rounded-3xl overflow-hidden border-2 border-border shadow-inner flex items-center justify-center cursor-pointer select-none"
        title="Toque para focar a câmera"
      >
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

        {/* Retículo de Foco ao Tocar na Tela (Tap-to-Focus) */}
        {pontoFoco.ativo && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 z-20 flex items-center justify-center transition-all duration-200"
            style={{ left: pontoFoco.x, top: pontoFoco.y }}
          >
            {/* Onda expansiva */}
            <div className="w-20 h-20 border-2 border-primary/50 rounded-2xl animate-ping absolute" />
            {/* Caixa de mira com cantos */}
            <div className="w-16 h-16 border-2 border-white rounded-xl relative shadow-xl flex items-center justify-center bg-primary/20 backdrop-blur-2xs">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <div className="absolute -top-0.5 -left-0.5 w-3 h-3 border-t-2 border-l-2 border-primary" />
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 border-t-2 border-r-2 border-primary" />
              <div className="absolute -bottom-0.5 -left-0.5 w-3 h-3 border-b-2 border-l-2 border-primary" />
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 border-b-2 border-r-2 border-primary" />
            </div>
            <span className="absolute -bottom-5 text-[10px] font-extrabold text-white bg-black/70 px-2 py-0.5 rounded-full shadow-md whitespace-nowrap">
              Focando...
            </span>
          </div>
        )}

        {/* Mensagem de Erro de Câmera com Botão de Permissão */}
        {erroCamera && (
          <div className="absolute inset-0 bg-background/95 p-6 flex flex-col items-center justify-center text-center gap-2.5 z-10">
            <CameraOff className="w-9 h-9 text-budget-red" />
            <p className="text-xs font-semibold text-budget-red-text max-w-xs">
              {erroCamera}
            </p>
            <button
              type="button"
              onClick={async () => {
                setErroCamera(null);
                try {
                  const stream = await navigator.mediaDevices?.getUserMedia({ video: true });
                  stream?.getTracks().forEach((t) => t.stop());
                } catch {}
                setCameraTraseira((prev) => prev);
              }}
              className="mt-1 h-9 px-4 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-hover transition-all cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Tentar abrir câmera novamente</span>
            </button>
            <p className="text-[11px] text-text-muted max-w-xs">
              Se o navegador bloqueou, toque no ícone de opções/cadeado na barra de endereços e autorize a Câmera.
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

          {/* Botão de Refocar */}
          <button
            type="button"
            onClick={focarCentro}
            className="h-9 px-3 rounded-full bg-card border border-border text-xs font-bold text-text-muted hover:text-text-main flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            title="Refocar a câmera"
          >
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Focar</span>
          </button>

          {/* Alternar Câmera */}
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
          💡 <strong>Dica:</strong> Toque no quadrado do QR Code na tela para a lente ajustar o foco, ou use o <strong>2x Zoom</strong> mantendo o celular a 20cm.
        </p>
      </div>

      {/* Elemento oculto auxiliar para leitura de arquivos de foto */}
      <div id={helperElementId} className="hidden" />
    </div>
  );
}
