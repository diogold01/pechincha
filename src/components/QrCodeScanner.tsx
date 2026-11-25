"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  RefreshCw,
  Image as ImageIcon,
  AlertCircle,
  Sparkles,
  Maximize2,
  Minimize2,
  Crosshair,
  Info,
  Flashlight,
  FlashlightOff,
} from "lucide-react";

interface QrCodeScannerProps {
  onScan: (decodedText: string) => void;
  ativo: boolean;
}

interface CameraItem {
  id: string;
  label: string;
}

interface ZoomCapabilities {
  min: number;
  max: number;
  step: number;
}

export default function QrCodeScanner({ onScan, ativo }: QrCodeScannerProps) {
  const [iniciado, setIniciado] = useState(false);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [listaCameras, setListaCameras] = useState<CameraItem[]>([]);
  const [cameraIdSelecionada, setCameraIdSelecionada] = useState<string>("");
  const [zoomAtual, setZoomAtual] = useState<number>(1);
  const [zoomCaps, setZoomCaps] = useState<ZoomCapabilities | null>(null);
  const [suportaTorch, setSuportaTorch] = useState(false);
  const [torchAtivo, setTorchAtivo] = useState(false);
  const [temAutofoco, setTemAutofoco] = useState<boolean | null>(null);
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

  function ehCameraFrontal(label: string): boolean {
    const l = (label || "").toLowerCase();
    return l.includes("front") || l.includes("user") || l.includes("selfie");
  }

  // Nome legível amigável para as lentes traseiras do aparelho
  function formatarNomeCamera(label: string, indexTraseira: number): string {
    const l = (label || "").toLowerCase();
    if (ehCameraFrontal(l)) return "Frontal";

    if (l.includes("ultra") || l.includes("0.6") || l.includes("0.5")) {
      return "Ultra-Wide (0.6x)";
    }
    if (l.includes("tele") || l.includes("3x") || l.includes("5x")) {
      return "Telefoto";
    }
    if (l.includes("macro")) {
      return "Macro";
    }
    if (
      l.includes("camera2 0") ||
      l.includes("camera 0") ||
      l.includes("back 0") ||
      (l.includes("wide") && !l.includes("ultra")) ||
      l.includes("main") ||
      l.includes("primary")
    ) {
      return "Principal (1.0x)";
    }

    if (indexTraseira === 0) return "Principal (1.0x)";
    return `Lente ${indexTraseira + 1}`;
  }

  function escolherMelhorTraseira(devices: CameraItem[]): string {
    const traseiras = devices.filter((d) => !ehCameraFrontal(d.label));
    if (traseiras.length === 0) return devices[0]?.id || "";
    if (traseiras.length === 1) return traseiras[0].id;

    // No padrão Android Camera2 (incluindo Samsung Galaxy), "camera2 0, facing back"
    // é a lente principal 1.0x com autofoco; "camera2 2" costuma ser a ultra-wide sem foco.
    const principal = traseiras.find((d) => {
      const l = d.label.toLowerCase();
      return (
        l.includes("camera2 0") ||
        l.includes("camera 0") ||
        l.includes("back 0") ||
        l.includes("main") ||
        l.includes("primary") ||
        (l.includes("wide") && !l.includes("ultra"))
      );
    });

    if (principal) return principal.id;

    // Evita selecionar ultra-wide ou macro como padrão
    const naoUltra = traseiras.find((d) => {
      const l = d.label.toLowerCase();
      return !l.includes("ultra") && !l.includes("0.6") && !l.includes("macro");
    });

    return (naoUltra || traseiras[0]).id;
  }

  function obterTrackAtivo(): MediaStreamTrack | null {
    const video = document.querySelector(
      `#${elementId} video`
    ) as HTMLVideoElement | null;
    const stream = video?.srcObject as MediaStream | null;
    return stream?.getVideoTracks()?.[0] || null;
  }

  useEffect(() => {
    let cancelado = false;

    async function initScanner() {
      if (!ativo) return;

      try {
        setErroCamera(null);
        setTorchAtivo(false);
        setZoomCaps(null);
        setTemAutofoco(null);

        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import(
          "html5-qrcode"
        );

        if (cancelado) return;

        // Se já houver uma instância rodando, para antes de recriar
        if (scannerRef.current) {
          try {
            await scannerRef.current.stop();
          } catch {
            // Silencioso
          }
        }

        // Lista câmeras antes (quando permissão já existe)
        let devices: CameraItem[] = [];
        try {
          devices = await Html5Qrcode.getCameras();
        } catch {
          devices = [];
        }

        if (cancelado) return;

        if (devices.length > 0) {
          setListaCameras(devices);
        }

        let camIdToUse = cameraIdSelecionada;
        if (!camIdToUse && devices.length > 0) {
          camIdToUse = escolherMelhorTraseira(devices);
          setCameraIdSelecionada(camIdToUse);
        }

        const html5QrCode = new Html5Qrcode(elementId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          useBarCodeDetectorIfSupported: true,
          verbose: false,
        });
        scannerRef.current = html5QrCode;

        // Solicita resolução Full HD para leitura nítida de QR Codes pequenos em cupom térmico
        const videoConstraints: MediaTrackConstraints = {
          ...(camIdToUse
            ? { deviceId: { exact: camIdToUse } }
            : { facingMode: { ideal: "environment" } }),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        };

        const config = {
          fps: 15,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minDim = Math.min(viewfinderWidth, viewfinderHeight);
            return {
              width: Math.min(Math.round(minDim * 0.72), 280),
              height: Math.min(Math.round(minDim * 0.72), 280),
            };
          },
          videoConstraints,
        };

        const cameraParam = camIdToUse
          ? camIdToUse
          : { facingMode: "environment" };

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

        if (cancelado) return;

        setIniciado(true);

        // Atualiza a lista de câmeras após conceder permissão (revela todas as lentes físicas)
        try {
          const devicesApos = await Html5Qrcode.getCameras();
          if (!cancelado && devicesApos.length > 0) {
            setListaCameras(devicesApos);
            if (!camIdToUse) {
              const track = obterTrackAtivo();
              const activeId = track?.getSettings?.()?.deviceId;
              if (activeId) setCameraIdSelecionada(activeId);
            }
          }
        } catch {}

        // Lê capacidades reais do sensor físico (zoom real, autofoco contínuo e lanterna)
        setTimeout(async () => {
          if (cancelado) return;
          try {
            const track = obterTrackAtivo();
            if (!track) return;

            const caps = (track.getCapabilities?.() || {}) as any;
            const settings = (track.getSettings?.() || {}) as any;

            if (caps.zoom && typeof caps.zoom.min === "number" && typeof caps.zoom.max === "number") {
              setZoomCaps({
                min: caps.zoom.min,
                max: caps.zoom.max,
                step: caps.zoom.step || 0.1,
              });
              const zoomInicial =
                typeof settings.zoom === "number"
                  ? settings.zoom
                  : Math.max(caps.zoom.min, Math.min(1, caps.zoom.max));
              setZoomAtual(Number(zoomInicial.toFixed(1)));
            } else {
              setZoomCaps(null);
            }

            setSuportaTorch(Boolean(caps.torch));

            const modosFoco: string[] = Array.isArray(caps.focusMode)
              ? caps.focusMode
              : [];
            const suportaAF = modosFoco.includes("continuous");
            setTemAutofoco(modosFoco.length > 0 ? suportaAF : null);

            const advancedConstraints: any = {};

            // Garante zoom 1.0x caso a câmera tenha aberto em ultra-wide (< 1.0)
            if (caps.zoom && caps.zoom.min < 1.0 && caps.zoom.max >= 1.0) {
              advancedConstraints.zoom = 1.0;
              setZoomAtual(1.0);
            }

            // Ativa autofoco contínuo mecânico
            if (suportaAF) {
              advancedConstraints.focusMode = "continuous";
            }

            if (Object.keys(advancedConstraints).length > 0) {
              await track.applyConstraints({
                advanced: [advancedConstraints],
              });
            }
          } catch {}
        }, 350);
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

  // Troca para uma lente física específica do aparelho
  function selecionarCamera(id: string) {
    if (id === cameraIdSelecionada) return;
    setCameraIdSelecionada(id);
    setIniciado(false);
  }

  // Aplica zoom real respeitando os limites do sensor físico
  async function alternarZoom(nivel: number) {
    const track = obterTrackAtivo();
    if (!track) return;

    const caps = (track.getCapabilities?.() || {}) as any;
    if (!caps.zoom) return;

    const valorSeguro = Math.max(caps.zoom.min, Math.min(nivel, caps.zoom.max));
    setZoomAtual(Number(valorSeguro.toFixed(1)));

    try {
      await track.applyConstraints({
        advanced: [{ zoom: valorSeguro } as any],
      });
    } catch {
      try {
        await track.applyConstraints({ zoom: valorSeguro } as any);
      } catch {}
    }
  }

  // Liga/desliga a lanterna (ajuda muito no foco em supermercados ou ambientes escuros)
  async function alternarTorch() {
    const track = obterTrackAtivo();
    if (!track) return;
    const proximo = !torchAtivo;
    try {
      await track.applyConstraints({
        advanced: [{ torch: proximo } as any],
      });
      setTorchAtivo(proximo);
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
      const track = obterTrackAtivo();
      if (track) {
        const caps = (track.getCapabilities?.() || {}) as any;
        const settings = track.getSettings?.() || {};
        const modosFoco: string[] = Array.isArray(caps.focusMode)
          ? caps.focusMode
          : [];

        const sensorX = Math.round((x / rect.width) * (settings.width || 1920));
        const sensorY = Math.round((y / rect.height) * (settings.height || 1080));

        if ("pointsOfInterest" in caps) {
          try {
            await track.applyConstraints({
              advanced: [{ pointsOfInterest: { x: sensorX, y: sensorY } } as any],
            });
          } catch {}
        }

        if (modosFoco.includes("single-shot")) {
          try {
            await track.applyConstraints({
              advanced: [{ focusMode: "single-shot" } as any],
            });
          } catch {}

          if (modosFoco.includes("continuous")) {
            setTimeout(async () => {
              try {
                await track.applyConstraints({
                  advanced: [{ focusMode: "continuous" } as any],
                });
              } catch {}
            }, 700);
          }
        } else if (modosFoco.includes("continuous")) {
          try {
            await track.applyConstraints({
              advanced: [{ focusMode: "continuous" } as any],
            });
          } catch {}
        }
      }
    } catch {} finally {
      setTimeout(() => {
        setPontoFoco((prev) => ({ ...prev, ativo: false }));
      }, 1000);
    }
  }

  // Focar no centro via botão
  async function focarCentro() {
    const el = document.getElementById(elementId);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPontoFoco({ x: rect.width / 2, y: rect.height / 2, ativo: true });

    const track = obterTrackAtivo();
    if (track) {
      const caps = (track.getCapabilities?.() || {}) as any;
      const modosFoco: string[] = Array.isArray(caps.focusMode) ? caps.focusMode : [];

      try {
        if (modosFoco.includes("single-shot")) {
          await track.applyConstraints({
            advanced: [{ focusMode: "single-shot" } as any],
          });
          if (modosFoco.includes("continuous")) {
            setTimeout(() => {
              track
                .applyConstraints({ advanced: [{ focusMode: "continuous" } as any] })
                .catch(() => {});
            }, 700);
          }
        } else if (modosFoco.includes("continuous")) {
          await track.applyConstraints({
            advanced: [{ focusMode: "continuous" } as any],
          });
        }
      } catch {}
    }

    setTimeout(() => {
      setPontoFoco((prev) => ({ ...prev, ativo: false }));
    }, 900);
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

  // Monta apenas os níveis de zoom realmente suportados pela lente ativa
  const opcoesZoom: { valor: number; label: string }[] = [];
  if (zoomCaps && zoomCaps.max > zoomCaps.min) {
    if (zoomCaps.min <= 0.7) {
      const v = Number(Math.max(zoomCaps.min, 0.6).toFixed(1));
      opcoesZoom.push({ valor: v, label: `${v}x` });
    }
    if (zoomCaps.min <= 1.05 && zoomCaps.max >= 1.0) {
      opcoesZoom.push({ valor: 1.0, label: "1.0x" });
    }
    if (zoomCaps.max >= 1.5) {
      opcoesZoom.push({ valor: 1.5, label: "1.5x" });
    }
    if (zoomCaps.max >= 2.0) {
      opcoesZoom.push({ valor: 2.0, label: "2.0x" });
    }
    if (zoomCaps.max >= 3.0) {
      opcoesZoom.push({ valor: 3.0, label: "3.0x" });
    }
  }

  const camerasTraseiras = listaCameras.filter((d) => !ehCameraFrontal(d.label));

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {/* Seletor de Lentes Traseiras Reais (aparece quando o celular expõe mais de 1 lente) */}
      {camerasTraseiras.length > 1 && (
        <div className="w-full max-w-md flex flex-col gap-1.5 bg-background p-2.5 rounded-2xl border border-border">
          <div className="text-[11px] font-bold text-text-muted flex items-center justify-between gap-2">
            <span>Lente da câmera</span>
            {temAutofoco === false ? (
              <span className="text-[10px] text-budget-red-text font-bold">
                Sem autofoco nesta lente — troque ao lado
              </span>
            ) : (
              <span className="text-[10px] text-primary font-bold">
                Principal (1.0x) tem melhor foco
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {camerasTraseiras.map((cam, idx) => (
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
                <span>{formatarNomeCamera(cam.label, idx)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dica de toque para focar */}
      {iniciado && !erroCamera && (
        <div className="w-full max-w-md flex items-center justify-between gap-2 px-1">
          <p className="text-[11px] font-bold text-primary flex items-center gap-1.5 min-w-0 truncate">
            <Crosshair className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Toque na tela para focar</span>
          </p>
          <button
            type="button"
            onClick={() => setTelaCheia((prev) => !prev)}
            className="text-[11px] font-bold text-text-muted hover:text-text-main flex items-center gap-1 transition-colors cursor-pointer shrink-0"
          >
            {telaCheia ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Normal</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Expandir</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Visor Amplo da Câmera */}
      <div
        onClick={handleToqueFocar}
        className={`relative w-full max-w-md bg-black rounded-3xl overflow-hidden border-2 border-border shadow-md flex items-center justify-center cursor-pointer select-none transition-all duration-300 ${
          telaCheia ? "h-[480px] sm:h-[560px]" : "h-[330px] sm:h-[400px]"
        }`}
        title="Toque na tela para focar a câmera"
      >
        <div id={elementId} className="w-full h-full object-cover" />

        {/* Guia de mira visual única quando a câmera estiver ativa */}
        {iniciado && !erroCamera && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-56 h-56 border-2 border-primary/70 rounded-3xl relative shadow-inner">
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
              className="mt-1 h-10 px-4 rounded-full bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-hover transition-all cursor-pointer flex items-center gap-1.5"
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

      {/* Controles Reais de Zoom, Foco e Lanterna */}
      {iniciado && !erroCamera && (
        <div className="flex flex-wrap items-center justify-center gap-2 w-full max-w-md">
          {opcoesZoom.length > 1 && (
            <div className="flex items-center bg-card border border-border rounded-full p-1 shadow-2xs">
              {opcoesZoom.map((op) => {
                const ativoZoom = Math.abs(zoomAtual - op.valor) < 0.15;
                return (
                  <button
                    key={op.valor}
                    type="button"
                    onClick={() => alternarZoom(op.valor)}
                    className={`h-8 px-3 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      ativoZoom
                        ? "bg-primary text-white shadow-2xs"
                        : "text-text-muted hover:text-text-main"
                    }`}
                  >
                    {op.label}
                  </button>
                );
              })}
            </div>
          )}

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

          {/* Lanterna (quando o aparelho suporta) */}
          {suportaTorch && (
            <button
              type="button"
              onClick={alternarTorch}
              className={`h-9 px-3.5 rounded-full border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs ${
                torchAtivo
                  ? "bg-primary text-white border-primary"
                  : "bg-card border-border text-text-muted hover:text-text-main"
              }`}
              title={torchAtivo ? "Desligar lanterna" : "Ligar lanterna"}
            >
              {torchAtivo ? (
                <FlashlightOff className="w-3.5 h-3.5" />
              ) : (
                <Flashlight className="w-3.5 h-3.5 text-primary" />
              )}
              <span>{torchAtivo ? "Apagar luz" : "Luz"}</span>
            </button>
          )}
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
          className="w-full h-11 px-4 bg-primary-light hover:bg-primary-soft text-primary-hover rounded-full font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
        >
          <Camera className="w-4 h-4 shrink-0" />
          <span>Tirar foto pelo app da câmera</span>
        </button>

        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          className="text-xs font-semibold text-text-muted hover:text-text-main flex items-center justify-center gap-1.5 transition-colors cursor-pointer py-1"
        >
          <ImageIcon className="w-3.5 h-3.5 shrink-0" />
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
        <p className="text-[11px] text-text-muted flex items-start justify-center gap-1.5 text-center px-2">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
          <span>
            Dica: mantenha o celular a ~20 cm do cupom e use <strong>1.5x</strong> ou <strong>2.0x</strong> para focar melhor QR Codes pequenos.
          </span>
        </p>
      </div>

      {/* Elemento oculto auxiliar para leitura de arquivos de foto */}
      <div id={helperElementId} className="hidden" />
    </div>
  );
}
