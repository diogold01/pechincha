"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Store,
  CreditCard,
  Send,
  AlertTriangle,
  PiggyBank,
  Lightbulb,
  ShoppingBag,
  RefreshCw,
  PieChart,
  Receipt,
  CalendarDays,
  ShoppingCart,
} from "lucide-react";
import { formatarMoeda } from "@/lib/format";
import { temIAConfigurada, type ConfigIA } from "@/lib/ia-config";

export interface EvolucaoMesItem {
  anoMes: string;
  labelCurto: string;
  gasto: number;
  atual: boolean;
}

export interface SetorResumoItem {
  id: string;
  nome: string;
  emoji: string;
  gasto: number;
  orcamento: number;
  percentualDoTotal: number;
}

export interface TopProdutoItem {
  nome: string;
  emoji: string;
  quantidadeTotal: number;
  unidade: string;
  gastoTotal: number;
  ocorrencias: number;
}

export interface AvulsoItemResumo {
  nome: string;
  emoji: string;
  gastoTotal: number;
  ocorrencias: number;
}

export interface MercadoResumoItem {
  nome: string;
  gastoTotal: number;
  compras: number;
  ticketMedio: number;
}

export interface PagamentoResumoItem {
  forma: string;
  valor: number;
  percentual: number;
}

export interface VariacaoPrecoItem {
  nome: string;
  emoji: string;
  ultimoValor: number;
  mediaAnterior: number;
  variacaoPct: number;
}

interface DestaqueIA {
  tipo: "alerta" | "economia" | "dica";
  titulo: string;
  texto: string;
}

interface BudgetAnalyticsDashboardProps {
  mesLabel: string;
  ehMesAtual: boolean;
  gastoTotalMes: number;
  orcamentoTotalMes: number;
  projecaoMes: number | null;
  qtdComprasMes: number;
  ticketMedioMes: number;
  gastoPorDia: number;
  evolucao6Meses: EvolucaoMesItem[];
  setoresResumo: SetorResumoItem[];
  topProdutos: TopProdutoItem[];
  avulsosItens: AvulsoItemResumo[];
  totalAvulsosMes: number;
  mercadosResumo: MercadoResumoItem[];
  pagamentosResumo: PagamentoResumoItem[];
  maisSubiram: VariacaoPrecoItem[];
  maisCairam: VariacaoPrecoItem[];
  configIA: ConfigIA;
}

const PERGUNTAS_RAPIDAS = [
  "Onde posso economizar?",
  "O que mais pesou?",
  "Resumo dos mercados",
  "Quanto foi no VA?",
];

const CORES_DONUT = [
  "#3B4CCA", // Azul Pechincha
  "#10B981", // Esmeralda
  "#F59E0B", // Âmbar
  "#EC4899", // Rosa
  "#8B5CF6", // Violeta
  "#94A3B8", // Cinza (Outros)
];

function corFormaPagamento(forma: string): string {
  const f = forma.toLowerCase();
  if (f.includes("pix")) return "#10B981";
  if (f.includes("crédito") || f.includes("credito")) return "#3B4CCA";
  if (f.includes("vale")) return "#F59E0B";
  if (f.includes("débito") || f.includes("debito")) return "#0EA5E9";
  if (f.includes("dinheiro")) return "#8B5CF6";
  return "#94A3B8";
}

function formatarCompacto(valor: number): string {
  if (valor >= 1000) {
    return `${(valor / 1000).toFixed(1).replace(".", ",")}k`;
  }
  return String(Math.round(valor));
}

export default function BudgetAnalyticsDashboard({
  mesLabel,
  ehMesAtual,
  gastoTotalMes,
  orcamentoTotalMes,
  projecaoMes,
  qtdComprasMes,
  ticketMedioMes,
  gastoPorDia,
  evolucao6Meses,
  setoresResumo,
  topProdutos,
  avulsosItens,
  totalAvulsosMes,
  mercadosResumo,
  pagamentosResumo,
  maisSubiram,
  maisCairam,
  configIA,
}: BudgetAnalyticsDashboardProps) {
  const iaPronta = temIAConfigurada(configIA);

  const [analisandoIA, setAnalisandoIA] = useState(false);
  const [resumoIA, setResumoIA] = useState<{
    resumoCurto: string;
    destaques: DestaqueIA[];
  } | null>(null);
  const [erroIA, setErroIA] = useState<string | null>(null);

  const [pergunta, setPergunta] = useState("");
  const [perguntando, setPerguntando] = useState(false);
  const [respostaIA, setRespostaIA] = useState<string | null>(null);

  const [abaRanking, setAbaRanking] = useState<"produtos" | "avulsos">("produtos");

  useEffect(() => {
    setResumoIA(null);
    setRespostaIA(null);
    setErroIA(null);
    setAbaRanking("produtos");
  }, [mesLabel]);

  function montarContextoIA() {
    return {
      mes: mesLabel,
      gastoTotal: Number(gastoTotalMes.toFixed(2)),
      orcamentoTotal: Number(orcamentoTotalMes.toFixed(2)),
      projecaoFechamento: projecaoMes ? Number(projecaoMes.toFixed(2)) : null,
      comprasNoMes: qtdComprasMes,
      ticketMedio: Number(ticketMedioMes.toFixed(2)),
      gastoPorDia: Number(gastoPorDia.toFixed(2)),
      evolucaoUltimos6Meses: evolucao6Meses.map((e) => ({
        mes: e.labelCurto,
        gasto: Number(e.gasto.toFixed(2)),
      })),
      setores: setoresResumo.slice(0, 12).map((s) => ({
        nome: s.nome,
        gasto: Number(s.gasto.toFixed(2)),
        orcamento: Number(s.orcamento.toFixed(2)),
        fatiaPct: s.percentualDoTotal,
      })),
      topProdutos: topProdutos.slice(0, 8).map((p) => ({
        nome: p.nome,
        gasto: Number(p.gastoTotal.toFixed(2)),
        qtd: Number(p.quantidadeTotal.toFixed(2)),
        unidade: p.unidade,
      })),
      gastosAvulsosTotal: Number(totalAvulsosMes.toFixed(2)),
      mercados: mercadosResumo.slice(0, 6).map((m) => ({
        nome: m.nome,
        gasto: Number(m.gastoTotal.toFixed(2)),
        compras: m.compras,
        ticketMedio: Number(m.ticketMedio.toFixed(2)),
      })),
      pagamentos: pagamentosResumo.map((pg) => ({
        forma: pg.forma,
        valor: Number(pg.valor.toFixed(2)),
        pct: pg.percentual,
      })),
      subiram: maisSubiram.map((v) => ({
        produto: v.nome,
        ultimo: v.ultimoValor,
        media: v.mediaAnterior,
        variacaoPct: v.variacaoPct,
      })),
      cairam: maisCairam.map((v) => ({
        produto: v.nome,
        ultimo: v.ultimoValor,
        media: v.mediaAnterior,
        variacaoPct: v.variacaoPct,
      })),
    };
  }

  async function handleAnalisarComIA() {
    if (!iaPronta) return;
    setAnalisandoIA(true);
    setErroIA(null);
    try {
      const res = await fetch("/api/orcamento/ia", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gemini-api-key": configIA.apiKey,
        },
        body: JSON.stringify({
          acao: "resumo",
          modelo: configIA.modelo,
          contexto: montarContextoIA(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErroIA(json?.erro || "Não foi possível analisar com a IA agora.");
        return;
      }
      setResumoIA({
        resumoCurto: json.resumoCurto || "",
        destaques: Array.isArray(json.destaques) ? json.destaques : [],
      });
    } catch {
      setErroIA("Falha de conexão ao consultar a IA.");
    } finally {
      setAnalisandoIA(false);
    }
  }

  async function handlePerguntarIA(textoPergunta?: string) {
    const q = (textoPergunta ?? pergunta).trim();
    if (!q || !iaPronta) return;
    setPergunta(q);
    setPerguntando(true);
    setErroIA(null);
    try {
      const res = await fetch("/api/orcamento/ia", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gemini-api-key": configIA.apiKey,
        },
        body: JSON.stringify({
          acao: "perguntar",
          modelo: configIA.modelo,
          pergunta: q,
          contexto: montarContextoIA(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErroIA(json?.erro || "Não foi possível responder agora.");
        return;
      }
      setRespostaIA(json.resposta || "");
    } catch {
      setErroIA("Falha de conexão ao consultar a IA.");
    } finally {
      setPerguntando(false);
    }
  }

  const temDadosMes = gastoTotalMes > 0;

  // Dados preparados para o Gráfico de Rosca (Donut) de Setores
  const setoresComGasto = setoresResumo.filter((s) => s.gasto > 0);
  const fatiasDonut: {
    label: string;
    emoji: string;
    valor: number;
    pct: number;
    cor: string;
  }[] = [];

  if (setoresComGasto.length > 0 && gastoTotalMes > 0) {
    const top5 = setoresComGasto.slice(0, 5);
    let somaTop = 0;
    top5.forEach((s, i) => {
      somaTop += s.gasto;
      fatiasDonut.push({
        label: s.nome,
        emoji: s.emoji,
        valor: s.gasto,
        pct: Math.round((s.gasto / gastoTotalMes) * 100),
        cor: CORES_DONUT[i % 5],
      });
    });
    const restante = Math.max(0, gastoTotalMes - somaTop);
    if (restante > 0.5) {
      fatiasDonut.push({
        label: "Outros",
        emoji: "•",
        valor: restante,
        pct: Math.max(1, Math.round((restante / gastoTotalMes) * 100)),
        cor: CORES_DONUT[5],
      });
    }
  }

  const raioDonut = 48;
  const circDonut = 2 * Math.PI * raioDonut;

  // Geometria SVG para o gráfico Evolução (6 meses) sem colisões de texto
  const maxValorGrafico =
    Math.max(
      orcamentoTotalMes > 0 ? orcamentoTotalMes : 0,
      ...evolucao6Meses.map((e) => e.gasto),
      1
    ) * 1.18;

  const svgW = 320;
  const svgH = 152;
  const plotTop = 24;
  const plotBottom = 126;
  const plotH = plotBottom - plotTop;

  const yTeto =
    orcamentoTotalMes > 0
      ? plotBottom - (orcamentoTotalMes / maxValorGrafico) * plotH
      : null;

  return (
    <div className="flex flex-col gap-3.5 mt-1">
      {/* Cabeçalho da seção Analytics */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <BarChart3 className="w-4 h-4 text-primary shrink-0" />
          <h2 className="text-sm font-extrabold text-text-main truncate">
            Dashboard do Mês
          </h2>
        </div>
        {ehMesAtual && projecaoMes !== null && projecaoMes > 0 && (
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-primary-light text-primary-hover whitespace-nowrap shrink-0">
            Previsão: {formatarMoeda(projecaoMes)}
          </span>
        )}
      </div>

      {/* 1. FAIXA DE KPIs RÁPIDOS (3 MINI-CARDS) */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-card border border-border rounded-2xl px-3 py-2.5 shadow-2xs flex flex-col gap-0.5">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-text-muted">
            <ShoppingCart className="w-3 h-3 text-primary shrink-0" />
            <span className="truncate">Compras</span>
          </div>
          <div className="text-base sm:text-lg font-extrabold text-text-main leading-tight">
            {qtdComprasMes}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl px-3 py-2.5 shadow-2xs flex flex-col gap-0.5">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-text-muted">
            <Receipt className="w-3 h-3 text-primary shrink-0" />
            <span className="truncate">Ticket médio</span>
          </div>
          <div className="text-base sm:text-lg font-extrabold text-text-main leading-tight truncate">
            {qtdComprasMes > 0 ? formatarMoeda(ticketMedioMes) : "—"}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl px-3 py-2.5 shadow-2xs flex flex-col gap-0.5">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-text-muted">
            <CalendarDays className="w-3 h-3 text-primary shrink-0" />
            <span className="truncate">Média / dia</span>
          </div>
          <div className="text-base sm:text-lg font-extrabold text-text-main leading-tight truncate">
            {gastoPorDia > 0 ? formatarMoeda(gastoPorDia) : "—"}
          </div>
        </div>
      </div>

      {/* 2. ASSISTENTE DE IA COMPACTO */}
      <section className="bg-card border border-border rounded-[20px] p-3.5 sm:p-4 shadow-sm flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-text-main leading-tight">
                Assistente IA
              </h3>
              <p className="text-[11px] text-text-muted truncate">
                {iaPronta
                  ? "Insights sob demanda dos seus gastos"
                  : "Ative sua chave gratuita em Mais"}
              </p>
            </div>
          </div>

          {iaPronta ? (
            <button
              type="button"
              onClick={handleAnalisarComIA}
              disabled={analisandoIA || !temDadosMes}
              className="h-8 px-3 rounded-full bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50 transition-colors shadow-2xs"
            >
              {analisandoIA ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{resumoIA ? "Atualizar" : "Analisar"}</span>
            </button>
          ) : (
            <Link
              href="/mais"
              className="h-8 px-3 rounded-full bg-primary-light text-primary-hover text-xs font-bold flex items-center shrink-0 hover:opacity-90"
            >
              Ativar IA
            </Link>
          )}
        </div>

        {erroIA && (
          <div className="text-xs font-semibold text-budget-red-text bg-budget-red-bg px-3 py-2 rounded-xl">
            {erroIA}
          </div>
        )}

        {resumoIA && (
          <div className="flex flex-col gap-2">
            {resumoIA.resumoCurto && (
              <p className="text-xs font-semibold text-text-main bg-background border border-border rounded-xl px-3 py-2 leading-relaxed">
                {resumoIA.resumoCurto}
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {resumoIA.destaques.map((d, i) => {
                const estilo =
                  d.tipo === "alerta"
                    ? {
                        bg: "bg-budget-red-bg/70 border-budget-red/20",
                        cor: "text-budget-red-text",
                        Icon: AlertTriangle,
                      }
                    : d.tipo === "economia"
                      ? {
                          bg: "bg-budget-green-bg/80 border-budget-green/20",
                          cor: "text-budget-green-text",
                          Icon: PiggyBank,
                        }
                      : {
                          bg: "bg-primary-light/60 border-primary/20",
                          cor: "text-primary-hover",
                          Icon: Lightbulb,
                        };
                const Icon = estilo.Icon;
                return (
                  <div
                    key={i}
                    className={`rounded-xl border p-2.5 flex items-start gap-2 ${estilo.bg}`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${estilo.cor}`} />
                    <div className="min-w-0">
                      <div className={`text-xs font-extrabold ${estilo.cor}`}>
                        {d.titulo}
                      </div>
                      <p className="text-[11px] text-text-main leading-snug mt-0.5">
                        {d.texto}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {iaPronta && temDadosMes && (
          <div className="flex flex-col gap-2 pt-1 border-t border-border/70">
            {/* Perguntas rápidas em 1 linha rolável horizontalmente */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {PERGUNTAS_RAPIDAS.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  disabled={perguntando}
                  onClick={() => handlePerguntarIA(sug)}
                  className="h-7 px-2.5 rounded-full bg-background border border-border hover:border-primary text-[11px] font-semibold text-text-muted hover:text-primary transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {sug}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handlePerguntarIA();
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                value={pergunta}
                onChange={(e) => setPergunta(e.target.value)}
                placeholder="Pergunte algo sobre seus gastos..."
                className="flex-1 h-9 px-3 rounded-full bg-background border border-border text-xs text-text-main focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={perguntando || !pergunta.trim()}
                className="w-9 h-9 rounded-full bg-primary hover:bg-primary-hover text-white flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50 transition-colors"
                aria-label="Enviar pergunta"
              >
                {perguntando ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </form>

            {respostaIA && (
              <div className="text-xs text-text-main bg-primary-light/50 border border-primary/20 rounded-xl px-3 py-2.5 leading-relaxed whitespace-pre-line">
                {respostaIA}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. GRÁFICOS PRINCIPAIS: DONUT POR SETOR + EVOLUÇÃO 6 MESES SVG */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* DONUT DE SETORES */}
        <section className="bg-card border border-border rounded-[20px] p-4 shadow-sm flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-text-main flex items-center gap-1.5">
              <PieChart className="w-4 h-4 text-primary" />
              <span>Distribuição por setor</span>
            </h3>
            <p className="text-[11px] text-text-muted">
              Fatia dos gastos em {mesLabel.toLowerCase()}
            </p>
          </div>

          {fatiasDonut.length === 0 ? (
            <p className="text-xs text-text-muted py-6 text-center">
              Sem gastos categorizados neste mês.
            </p>
          ) : (
            <div className="flex items-center gap-4">
              {/* SVG Donut */}
              <div className="relative w-[124px] h-[124px] shrink-0">
                <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r={raioDonut}
                    fill="none"
                    stroke="#E4E6EE"
                    strokeWidth="16"
                  />
                  {(() => {
                    let offset = 0;
                    return fatiasDonut.map((f, idx) => {
                      const frac = gastoTotalMes > 0 ? f.valor / gastoTotalMes : 0;
                      const seg = Math.max(0, frac * circDonut);
                      const dashOffset = -offset;
                      offset += seg;
                      return (
                        <circle
                          key={`${f.label}-${idx}`}
                          cx="64"
                          cy="64"
                          r={raioDonut}
                          fill="none"
                          stroke={f.cor}
                          strokeWidth="16"
                          strokeDasharray={`${Math.max(0, seg - 1.5)} ${circDonut}`}
                          strokeDashoffset={dashOffset}
                        />
                      );
                    });
                  })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                  <span className="text-[10px] font-semibold text-text-muted leading-none">
                    Total
                  </span>
                  <span className="text-xs font-extrabold text-text-main mt-0.5 leading-tight">
                    R$ {formatarCompacto(gastoTotalMes)}
                  </span>
                </div>
              </div>

              {/* Legenda colorida */}
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                {fatiasDonut.map((f) => (
                  <div
                    key={f.label}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: f.cor }}
                      />
                      <span className="font-bold text-text-main truncate">
                        {f.label}
                      </span>
                    </div>
                    <span className="text-[11px] font-extrabold text-text-muted shrink-0">
                      {f.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* EVOLUÇÃO 6 MESES (SVG LIMPO SEM SOBREPOSIÇÃO) */}
        <section className="bg-card border border-border rounded-[20px] p-4 shadow-sm flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-text-main">
                Evolução (6 meses)
              </h3>
              <p className="text-[11px] text-text-muted truncate">
                Gasto mensal × teto atual
              </p>
            </div>
            {orcamentoTotalMes > 0 && (
              <span className="text-[10px] font-bold text-primary-hover bg-primary-light px-2.5 py-1 rounded-full whitespace-nowrap shrink-0">
                Teto {formatarMoeda(orcamentoTotalMes)}
              </span>
            )}
          </div>

          <div className="w-full">
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="w-full h-36 overflow-visible"
              role="img"
              aria-label="Gráfico de evolução dos gastos nos últimos 6 meses"
            >
              {/* Linhas sutis de grade horizontal */}
              {[0.25, 0.5, 0.75, 1].map((f) => {
                const y = plotBottom - f * plotH;
                return (
                  <line
                    key={f}
                    x1="6"
                    x2={svgW - 6}
                    y1={y}
                    y2={y}
                    stroke="#ECEEF5"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Linha tracejada do Teto mensal */}
              {yTeto !== null && (
                <line
                  x1="6"
                  x2={svgW - 6}
                  y1={yTeto}
                  y2={yTeto}
                  stroke="#3B4CCA"
                  strokeOpacity="0.45"
                  strokeWidth="1.2"
                  strokeDasharray="4 4"
                />
              )}

              {/* Barras e rótulos */}
              {evolucao6Meses.map((item, idx) => {
                const colW = (svgW - 12) / evolucao6Meses.length;
                const cx = 6 + colW * idx + colW / 2;
                const barW = 28;
                const barH =
                  item.gasto > 0
                    ? Math.max(8, (item.gasto / maxValorGrafico) * plotH)
                    : 4;
                const barY = plotBottom - barH;
                const estourou =
                  orcamentoTotalMes > 0 && item.gasto > orcamentoTotalMes;
                const fill =
                  item.gasto <= 0
                    ? "#E4E6EE"
                    : estourou
                      ? "#D64545"
                      : item.atual
                        ? "#3B4CCA"
                        : "#A5B0EC";

                return (
                  <g key={item.anoMes}>
                    <rect
                      x={cx - barW / 2}
                      y={barY}
                      width={barW}
                      height={barH}
                      rx="6"
                      fill={fill}
                    />
                    {item.gasto > 0 && (
                      <text
                        x={cx}
                        y={barY - 6}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="700"
                        fill={item.atual ? "#14171F" : "#5B6270"}
                        style={{
                          paintOrder: "stroke",
                          stroke: "#FFFFFF",
                          strokeWidth: "3px",
                        }}
                      >
                        {formatarCompacto(item.gasto)}
                      </text>
                    )}
                    <text
                      x={cx}
                      y={svgH - 6}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight={item.atual ? "800" : "600"}
                      fill={item.atual ? "#3B4CCA" : "#5B6270"}
                    >
                      {item.labelCurto}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </section>
      </div>

      {/* 4. FORMAS DE PAGAMENTO (BARRA EMPILHADA COLORIDA) + TOP PRODUTOS (COM SEPARAÇÃO DE AVULSOS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* FORMAS DE PAGAMENTO */}
        <section className="bg-card border border-border rounded-[20px] p-4 shadow-sm flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-text-main flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-primary" />
              <span>Formas de pagamento</span>
            </h3>
            <p className="text-[11px] text-text-muted">
              Divisão entre Pix, Crédito, VA e Débito
            </p>
          </div>

          {pagamentosResumo.length === 0 ? (
            <p className="text-xs text-text-muted py-5 text-center">
              Nenhum pagamento registrado neste mês.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Barra única empilhada colorida */}
              <div className="h-3.5 w-full rounded-full bg-border overflow-hidden flex gap-0.5 p-0.5">
                {pagamentosResumo.map((pg) => (
                  <div
                    key={pg.forma}
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.max(4, pg.percentual)}%`,
                      backgroundColor: corFormaPagamento(pg.forma),
                    }}
                    title={`${pg.forma}: ${formatarMoeda(pg.valor)} (${pg.percentual}%)`}
                  />
                ))}
              </div>

              {/* Legenda detalhada em cards limpos */}
              <div className="grid grid-cols-2 gap-2">
                {pagamentosResumo.map((pg) => (
                  <div
                    key={pg.forma}
                    className="bg-background border border-border/80 rounded-xl px-2.5 py-2 flex items-center justify-between gap-1.5"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: corFormaPagamento(pg.forma) }}
                      />
                      <span className="text-xs font-bold text-text-main truncate">
                        {pg.forma}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-extrabold text-text-main leading-tight">
                        {formatarMoeda(pg.valor)}
                      </div>
                      <div className="text-[10px] font-bold text-text-muted">
                        {pg.percentual}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ONDE FOI MAIS DINHEIRO (PRODUTOS REAIS | AVULSOS) */}
        <section className="bg-card border border-border rounded-[20px] p-4 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-text-main flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4 text-primary shrink-0" />
                <span className="truncate">Onde foi mais dinheiro</span>
              </h3>
              <p className="text-[11px] text-text-muted truncate">
                {abaRanking === "produtos"
                  ? `Top produtos em ${mesLabel.toLowerCase()}`
                  : `Gastos avulsos em ${mesLabel.toLowerCase()}`}
              </p>
            </div>

            {avulsosItens.length > 0 && (
              <div className="flex items-center bg-background border border-border rounded-full p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setAbaRanking("produtos")}
                  className={`h-7 px-2.5 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                    abaRanking === "produtos"
                      ? "bg-primary text-white"
                      : "text-text-muted hover:text-text-main"
                  }`}
                >
                  Produtos
                </button>
                <button
                  type="button"
                  onClick={() => setAbaRanking("avulsos")}
                  className={`h-7 px-2.5 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                    abaRanking === "avulsos"
                      ? "bg-primary text-white"
                      : "text-text-muted hover:text-text-main"
                  }`}
                >
                  Avulsos
                </button>
              </div>
            )}
          </div>

          {abaRanking === "produtos" ? (
            topProdutos.length === 0 ? (
              <p className="text-xs text-text-muted py-5 text-center">
                Nenhum produto do catálogo comprado neste mês.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {topProdutos.slice(0, 5).map((prod, idx) => {
                  const maxProd = topProdutos[0]?.gastoTotal || 1;
                  const pct = Math.max(
                    6,
                    Math.round((prod.gastoTotal / maxProd) * 100)
                  );
                  return (
                    <div
                      key={`${prod.nome}-${idx}`}
                      className="flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-text-main truncate">
                          {prod.emoji} {prod.nome}
                        </span>
                        <span className="font-extrabold text-text-main shrink-0">
                          {formatarMoeda(prod.gastoTotal)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-semibold text-text-muted shrink-0">
                          {Number(prod.quantidadeTotal.toFixed(2))
                            .toString()
                            .replace(".", ",")}{" "}
                          {prod.unidade}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {totalAvulsosMes > 0 && (
                  <button
                    type="button"
                    onClick={() => setAbaRanking("avulsos")}
                    className="mt-1 pt-2 border-t border-border/70 flex items-center justify-between text-[11px] font-semibold text-text-muted hover:text-primary transition-colors cursor-pointer"
                  >
                    <span>
                      + {formatarMoeda(totalAvulsosMes)} em {avulsosItens.length}{" "}
                      {avulsosItens.length === 1
                        ? "gasto avulso"
                        : "gastos avulsos"}
                    </span>
                    <span className="font-bold text-primary">Ver →</span>
                  </button>
                )}
              </div>
            )
          ) : (
            <div className="flex flex-col gap-2">
              {avulsosItens.map((av, idx) => {
                const maxAv = avulsosItens[0]?.gastoTotal || 1;
                const pct = Math.max(
                  6,
                  Math.round((av.gastoTotal / maxAv) * 100)
                );
                return (
                  <div key={`${av.nome}-${idx}`} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-text-main truncate">
                        {av.emoji} {av.nome}
                      </span>
                      <span className="font-extrabold text-text-main shrink-0">
                        {formatarMoeda(av.gastoTotal)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-semibold text-text-muted shrink-0">
                        {av.ocorrencias}x avulso
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* 5. GASTOS POR MERCADO + INFLAÇÃO DA CASA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <section className="bg-card border border-border rounded-[20px] p-4 shadow-sm flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-text-main flex items-center gap-1.5">
              <Store className="w-4 h-4 text-primary" />
              <span>Gastos por mercado</span>
            </h3>
            <p className="text-[11px] text-text-muted">
              Total e ticket médio em {mesLabel.toLowerCase()}
            </p>
          </div>

          {mercadosResumo.length === 0 ? (
            <p className="text-xs text-text-muted py-5 text-center">
              Sem compras registradas neste mês.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {mercadosResumo.slice(0, 5).map((mkt) => {
                const pct =
                  gastoTotalMes > 0
                    ? Math.round((mkt.gastoTotal / gastoTotalMes) * 100)
                    : 0;
                return (
                  <div
                    key={mkt.nome}
                    className="bg-background border border-border/80 rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-text-main truncate">
                        {mkt.nome}
                      </div>
                      <div className="text-[11px] text-text-muted">
                        {mkt.compras} {mkt.compras === 1 ? "compra" : "compras"} ·
                        média {formatarMoeda(mkt.ticketMedio)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-extrabold text-text-main">
                        {formatarMoeda(mkt.gastoTotal)}
                      </div>
                      <div className="text-[10px] font-bold text-primary">
                        {pct}% do mês
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {(maisSubiram.length > 0 || maisCairam.length > 0) && (
          <section className="bg-card border border-border rounded-[20px] p-4 shadow-sm flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-text-main">
                Inflação da Casa
              </h3>
              <p className="text-[11px] text-text-muted">
                Último preço pago × média anterior
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              {maisSubiram.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <div className="text-[11px] font-extrabold text-budget-red-text flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Mais subiram</span>
                  </div>
                  {maisSubiram.map((item) => (
                    <div
                      key={`up-${item.nome}`}
                      className="bg-budget-red-bg/50 border border-budget-red/20 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-text-main truncate">
                          {item.emoji} {item.nome}
                        </div>
                        <div className="text-[10px] text-text-muted">
                          {formatarMoeda(item.mediaAnterior)} →{" "}
                          <strong className="text-text-main">
                            {formatarMoeda(item.ultimoValor)}
                          </strong>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-budget-red text-white text-[10px] font-extrabold shrink-0">
                        +{item.variacaoPct}%
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {maisCairam.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <div className="text-[11px] font-extrabold text-budget-green-text flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5" />
                    <span>Ficaram mais baratos</span>
                  </div>
                  {maisCairam.map((item) => (
                    <div
                      key={`down-${item.nome}`}
                      className="bg-budget-green-bg/60 border border-budget-green/20 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-text-main truncate">
                          {item.emoji} {item.nome}
                        </div>
                        <div className="text-[10px] text-text-muted">
                          {formatarMoeda(item.mediaAnterior)} →{" "}
                          <strong className="text-text-main">
                            {formatarMoeda(item.ultimoValor)}
                          </strong>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-budget-green text-white text-[10px] font-extrabold shrink-0">
                        {item.variacaoPct}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
