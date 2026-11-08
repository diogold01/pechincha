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
  Maximize2,
  Minimize2,
} from "lucide-react";

interface QrCodeScannerProps {
  onScan: (decodedText: string) => void;
  ativo: boolean;
}

interface CameraItem {
  id: string;
  label: string;
}

export default function QrCodeScanner({ onScan, ativo }: QrCodeScannerProps) {
  const [iniciado, setIniciado] = useState(false);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [listaCameras, setListaCameras] = useState<CameraItem[]>([]);
  const [cameraIdSelecionada, setCameraIdSelecionada] = useState<string>("");
  const [zoomAtual, setZoomAtual] = useState<number>(1);
  const [telaCheia, setTelaCheia] = useState(false);
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

  // Nome legível amigável para as lentes do aparelho (identifica Samsung Galaxy S23 e outros Androids)
  function formatarNomeCamera(label: string, index: number, totalTraseiras: number): string {
    const l = (label || "").toLowerCase();
    if (l.includes("front") || l.includes("user")) return "Frontal";

    // Padrão Samsung Galaxy Camera2:
    // camera2 0 = Ultra-Wide 0.6x (sem foco mecânico)
    // camera2 2 = Wide Principal 1.0x (com Dual Pixel AF)
    // camera2 3 = Telefoto 3.0x
    if (l.includes("camera2 0") || l.includes("camera 0") || l.includes("ultra") || l.includes("0.6") || l.includes("0.5")) {
      return "0.6x Ultra-Wide";
    }
    if (l.includes("camera2 2") || l.includes("camera 2") || (l.includes("wide") && !l.includes("ultra")) || l.includes("main") || l.includes("primary")) {
      return "1.0x Principal (Foco Nítido)";
    }
    if (l.includes("camera2 3") || l.includes("camera 3") || l.includes("tele") || l.includes("3x")) {
      return "3.0x Telefoto";
    }

    // Se tiver mais de uma traseira e vier apenas como "Lente Traseira" ou número
    if (totalTraseiras > 1) {
      if (index === 0) return "0.6x Ultra-Wide";
      if (index === 1) return "1.0x Principal (Foco Nítido)";
      if (index === 2) return "3.0x Telefoto";
    }

    return "Traseira 1.0x";
  }

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

        // Obtém a lista de todas as câmeras físicas do aparelho
        let devices: CameraItem[] = [];
        try {
          devices = await Html5Qrcode.getCameras();
        } catch {
          devices = [];
        }

        if (cancelado) return;

        setListaCameras(devices);

        // Seleção inteligente da melhor câmera traseira (GARANTINDO a lente principal 1.0x com foco)
        let camIdToUse = cameraIdSelecionada;
        if (!camIdToUse && devices.length > 0) {
          const traseiras = devices.filter(
            (d) => !d.label.toLowerCase().includes("front") && !d.label.toLowerCase().includes("user")
          );

          if (traseiras.length === 1) {
            camIdToUse = traseiras[0].id;
          } else if (traseiras.length > 1) {
            // No Samsung Galaxy (S20/S21/S22/S23/S24), a primeira traseira é quase sempre a 0.6x (sem foco mecânico).
            // A lente principal 1.0x com foco automático é a "camera2 2" ou a segunda câmera traseira da lista!
            let preferida = traseiras.find((d) => {
              const l = d.label.toLowerCase();
              return (
                (l.includes("wide") && !l.includes("ultra")) ||
                l.includes("camera2 2") ||
                l.includes("camera 2") ||
                l.includes("back 2") ||
                l.includes("main") ||
                l.includes("primary")
              );
            });

            // Se não achou por nome específico, e a primeira traseira é 0.6x / camera2 0, seleciona a segunda!
            if (!preferida) {
              const primeiraLabel = traseiras[0].label.toLowerCase();
              if (
                primeiraLabel.includes("camera2 0") ||
                primeiraLabel.includes("camera 0") ||
                primeiraLabel.includes("ultra") ||
                primeiraLabel.includes("0.6") ||
                primeiraLabel.includes("0.5")
              ) {
                preferida = traseiras[1];
              } else {
                preferida = traseiras[1] || traseiras[0];
              }
            }

            camIdToUse = preferida ? preferida.id : traseiras[0].id;
          } else {
            camIdToUse = devices[0].id;
          }

          setCameraIdSelecionada(camIdToUse);
        }

        const html5QrCode = new Html5Qrcode(elementId);
        scannerRef.current = html5QrCode;

        const config = {
          fps: 15,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minDim = Math.min(viewfinderWidth, viewfinderHeight);
            return {
              width: Math.min(Math.round(minDim * 0.72), 280),
              height: Math.min(Math.round(minDim * 0.72), 280),
            };
          },
        };

        // Inicia com o dispositivo específico selecionado ou fallback de ambiente
        const cameraParam = camIdToUse ? camIdToUse : { facingMode: "environment" };

        await html5QrCode.start(
          cameraParam,
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
          // Força zoom 1.0x e foco contínuo mecânico no sensor físico da câmera
          setTimeout(async () => {
            try {
              const video = document.querySelector(
                `#${elementId} video`
              ) as HTMLVideoElement | null;
              const stream = video?.srcObject as MediaStream | null;
              const track = stream?.getVideoTracks()[0];

              if (track) {
                const caps = (track.getCapabilities?.() || {}) as any;
                const advancedConstraints: any = {};

                // Se o zoom mínimo for menor que 1.0 (ex: 0.6x no Samsung S23), força zoom: 1.0 imediatamente!
                if (caps.zoom && caps.zoom.min < 1.0 && caps.zoom.max >= 1.0) {
                  advancedConstraints.zoom = 1.0;
                  setZoomAtual(1.0);
                }

                // Aplica autofoco contínuo mecânico
                if (
                  caps.focusMode &&
                  Array.isArray(caps.focusMode) &&
                  caps.focusMode.includes("continuous")
                ) {
                  advancedConstraints.focusMode = "continuous";
                }

                if (Object.keys(advancedConstraints).length > 0) {
                  await track.applyConstraints({
                    advanced: [advancedConstraints],
                  });
                }
              } else {
                await html5QrCode.applyVideoConstraints({
                  advanced: [{ zoom: 1.0, focusMode: "continuous" } as any],
                } as any);
              }
            } catch {}
          }, 450);
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
        } catch {}
      }
    };
  }, [ativo, cameraIdSelecionada, onScan]);

  // Troca para uma lente específica selecionada pelo usuário
  function selecionarCamera(id: string) {
    if (id === cameraIdSelecionada) return;
    setCameraIdSelecionada(id);
    setIniciado(false);
  }

  async function alternarZoom(nivel: number) {
    setZoomAtual(nivel);
    try {
      const video = document.querySelector(
        `#${elementId} video`
      ) as HTMLVideoElement | null;
      const stream = video?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()[0];
      if (track) {
        await track.applyConstraints({
          advanced: [{ zoom: nivel } as any],
        });
      } else if (scannerRef.current) {
        await scannerRef.current.applyVideoConstraints({
          advanced: [{ zoom: nivel } as any],
        });
      }
    } catch {}
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

        if ("pointsOfInterest" in caps) {
          try {
            await track.applyConstraints({
              advanced: [{ pointsOfInterest: { x: sensorX, y: sensorY } } as any],
            });
          } catch {}
        }

        try {
          await track.applyConstraints({
            advanced: [{ focusMode: "single-shot" } as any],
          });
        } catch {}

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
    } catch {} finally {
      setTimeout(() => {
        setPontoFoco((prev) => ({ ...prev, ativo: false }));
      }, 1200);
    }
  }

  // Focar no centro via botão
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
          "Não conseguimos ler o QR Code nesta foto. Tente aproximar ou melhorar a luz."
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
      {/* Seletor de Lentes Físicas do Aparelho (Permite trocar da 0.6x ultra-wide para a 1x com foco) */}
      {listaCameras.length > 1 && (
        <div className="w-full max-w-md flex flex-col gap-1.5 bg-background p-2.5 rounded-2xl border border-border">
          <span className="text-[11px] font-bold text-text-muted flex items-center justify-between">
            <span>📷 Lente da Câmera:</span>
            <span className="text-[10px] text-primary font-bold">
              ✓ 1.0x recomendada para foco
            </span>
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {listaCameras.map((cam, idx) => {
              const traseiras = listaCameras.filter(
                (d) =>
                  !d.label.toLowerCase().includes("front") &&
                  !d.label.toLowerCase().includes("user")
              );
              return (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => selecionarCamera(cam.id)}
                  className={`h-8 px-3 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
                    cameraIdSelecionada === cam.id
                      ? "bg-primary text-white shadow-xs"
                      : "bg-card border border-border text-text-muted hover:text-text-main"
                  }`}
                >
                  <span>{formatarNomeCamera(cam.label, idx, traseiras.length)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Dica de toque para focar */}
      {iniciado && !erroCamera && (
        <div className="w-full max-w-md flex items-center justify-between px-1">
          <p className="text-[11px] font-bold text-primary flex items-center gap-1.5 animate-pulse">
            <span>👆 Toque na tela para focar o papel</span>
          </p>
          <button
            type="button"
            onClick={() => setTelaCheia((prev) => !prev)}
            className="text-[11px] font-bold text-text-muted hover:text-text-main flex items-center gap-1 transition-colors cursor-pointer"
          >
            {telaCheia ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Normal</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Expandir tela</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Visor Amplo da Câmera (Com proporção vertical que cabe o cupom inteiro) */}
      <div
        onClick={handleToqueFocar}
        className={`relative w-full max-w-md bg-black rounded-3xl overflow-hidden border-2 border-border shadow-md flex items-center justify-center cursor-pointer select-none transition-all duration-300 ${
          telaCheia ? "h-[540px] sm:h-[600px]" : "h-[400px] sm:h-[450px]"
        }`}
        title="Toque na tela para focar a câmera"
      >
        <div id={elementId} className="w-full h-full object-cover" />

        {/* Guia de mira visual quando a câmera estiver ativa */}
        {iniciado && !erroCamera && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-64 h-64 border-2 border-primary/70 rounded-3xl relative animate-pulse shadow-inner">
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-xl" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-xl" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-xl" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-xl" />
            </div>
          </div>
        )}

        {/* Retículo de Foco ao Tocar na Tela (Tap-to-Focus) */}
        {pontoFoco.ativo && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 z-20 flex items-center justify-center transition-all duration-200"
            style={{ left: pontoFoco.x, top: pontoFoco.y }}
          >
            <div className="w-20 h-20 border-2 border-primary/50 rounded-2xl animate-ping absolute" />
            <div className="w-16 h-16 border-2 border-white rounded-xl relative shadow-xl flex items-center justify-center bg-primary/20 backdrop-blur-2xs">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <div className="absolute -top-0.5 -left-0.5 w-3 h-3 border-t-2 border-l-2 border-primary" />
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 border-t-2 border-r-2 border-primary" />
              <div className="absolute -bottom-0.5 -left-0.5 w-3 h-3 border-b-2 border-l-2 border-primary" />
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 border-b-2 border-r-2 border-primary" />
            </div>
            <span className="absolute -bottom-5 text-[10px] font-extrabold text-white bg-black/75 px-2 py-0.5 rounded-full shadow-md whitespace-nowrap">
              Focando...
            </span>
          </div>
        )}

        {/* Mensagem de Erro de Câmera com Botão de Permissão */}
        {erroCamera && (
          <div className="absolute inset-0 bg-background/95 p-6 flex flex-col items-center justify-center text-center gap-2.5 z-10">
            <CameraOff className="w-10 h-10 text-budget-red" />
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
                setCameraIdSelecionada((prev) => prev);
              }}
              className="mt-1 h-10 px-4 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-hover transition-all cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Tentar abrir câmera novamente</span>
            </button>
            <p className="text-[11px] text-text-muted max-w-xs">
              Se o navegador bloqueou, toque no ícone de cadeado no topo da tela e autorize a Câmera.
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

      {/* Controles de Foco e Zoom */}
      {iniciado && !erroCamera && (
        <div className="flex flex-wrap items-center justify-center gap-2 w-full max-w-md">
          {/* Seletor de Zoom (Garante 1.0x como Padrão) */}
          <div className="flex items-center bg-card border border-border rounded-full p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => alternarZoom(0.6)}
              className={`h-8 px-2.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                zoomAtual === 0.6
                  ? "bg-primary text-white shadow-2xs"
                  : "text-text-muted hover:text-text-main"
              }`}
              title="Lente ultra-aberta 0.6x (sem foco macro)"
            >
              0.6x
            </button>
            <button
              type="button"
              onClick={() => alternarZoom(1)}
              className={`h-8 px-3 rounded-full text-xs font-bold transition-all cursor-pointer ${
                zoomAtual === 1
                  ? "bg-primary text-white shadow-2xs"
                  : "text-text-muted hover:text-text-main"
              }`}
              title="Lente principal 1.0x com foco automático nítido"
            >
              1.0x (Nítida)
            </button>
            <button
              type="button"
              onClick={() => alternarZoom(2)}
              className={`h-8 px-3 rounded-full text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                zoomAtual === 2
                  ? "bg-primary text-white shadow-2xs"
                  : "text-text-muted hover:text-text-main"
              }`}
              title="Aumenta o zoom para focar o papel a 25cm"
            >
              <ZoomIn className="w-3 h-3" />
              <span>2.0x</span>
            </button>
          </div>

          {/* Botão de Refocar */}
          <button
            type="button"
            onClick={focarCentro}
            className="h-9 px-3.5 rounded-full bg-card border border-border text-xs font-bold text-text-muted hover:text-text-main flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            title="Refocar a câmera"
          >
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Focar Agora</span>
          </button>
        </div>
      )}

      {/* Alerta de erro da foto */}
      {erroFoto && (
        <div className="bg-budget-red-bg text-budget-red-text px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 max-w-md w-full">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{erroFoto}</span>
        </div>
      )}

      {/* Botões de Ação para Fotos Nítidas */}
      <div className="w-full max-w-md flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-12 bg-primary/10 border border-primary/30 hover:bg-primary/20 text-primary rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
        >
          <Camera className="w-4 h-4" />
          <span>Tirar foto com o app da câmera (Foco Nítido Garantido)</span>
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
          💡 Se a imagem estiver embaçada, selecione a <strong>Lente Principal 1x</strong> no topo, ou use o botão de tirar foto pelo app da câmera.
        </p>
      </div>

      {/* Elemento oculto auxiliar para leitura de arquivos de foto */}
      <div id={helperElementId} className="hidden" />
    </div>
  );
}
