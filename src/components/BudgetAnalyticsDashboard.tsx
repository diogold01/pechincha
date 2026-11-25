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
  evolucao6Meses: EvolucaoMesItem[];
  setoresResumo: SetorResumoItem[];
  topProdutos: TopProdutoItem[];
  mercadosResumo: MercadoResumoItem[];
  pagamentosResumo: PagamentoResumoItem[];
  maisSubiram: VariacaoPrecoItem[];
  maisCairam: VariacaoPrecoItem[];
  configIA: ConfigIA;
}

const PERGUNTAS_RAPIDAS = [
  "Onde posso economizar?",
  "O que mais pesou no mês?",
  "Resumo dos mercados",
];

export default function BudgetAnalyticsDashboard({
  mesLabel,
  ehMesAtual,
  gastoTotalMes,
  orcamentoTotalMes,
  projecaoMes,
  evolucao6Meses,
  setoresResumo,
  topProdutos,
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

  // Limpa respostas da IA ao trocar de mês
  useEffect(() => {
    setResumoIA(null);
    setRespostaIA(null);
    setErroIA(null);
  }, [mesLabel]);

  function montarContextoIA() {
    return {
      mes: mesLabel,
      gastoTotal: Number(gastoTotalMes.toFixed(2)),
      orcamentoTotal: Number(orcamentoTotalMes.toFixed(2)),
      projecaoFechamento: projecaoMes ? Number(projecaoMes.toFixed(2)) : null,
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

  const maxEvolucao = Math.max(
    orcamentoTotalMes > 0 ? orcamentoTotalMes : 0,
    ...evolucao6Meses.map((e) => e.gasto),
    1
  );

  const alturaLinhaTeto =
    orcamentoTotalMes > 0
      ? Math.min(100, Math.round((orcamentoTotalMes / maxEvolucao) * 100))
      : null;

  const temDadosMes = gastoTotalMes > 0;

  return (
    <div className="flex flex-col gap-4 mt-1">
      {/* Título da seção Analytics */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-extrabold text-text-main">
            Análises e Dashboards
          </h2>
        </div>
        {ehMesAtual && projecaoMes !== null && projecaoMes > 0 && (
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-primary-light text-primary-hover">
            Previsão: {formatarMoeda(projecaoMes)}
          </span>
        )}
      </div>

      {/* 1. ASSISTENTE DE IA (SOB DEMANDA) */}
      <section className="bg-card border border-border rounded-[20px] p-4 shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-text-main leading-tight">
                Assistente de Gastos IA
              </h3>
              <p className="text-[11px] text-text-muted truncate">
                {iaPronta
                  ? "Análise inteligente dos seus números sob demanda"
                  : "Ative sua chave gratuita em Mais para receber dicas"}
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
            <div className="flex flex-wrap gap-1.5">
              {PERGUNTAS_RAPIDAS.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  disabled={perguntando}
                  onClick={() => handlePerguntarIA(sug)}
                  className="h-7 px-2.5 rounded-full bg-background border border-border hover:border-primary text-[11px] font-semibold text-text-muted hover:text-primary transition-colors cursor-pointer"
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

      {/* GRADE DE DASHBOARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 2. EVOLUÇÃO DOS ÚLTIMOS 6 MESES */}
        <section className="bg-card border border-border rounded-[20px] p-4 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-text-main">
                Evolução (6 meses)
              </h3>
              <p className="text-[11px] text-text-muted">
                Gasto mensal comparado ao teto atual
              </p>
            </div>
            {orcamentoTotalMes > 0 && (
              <span className="text-[10px] font-bold text-text-muted border border-dashed border-primary/50 px-2 py-0.5 rounded-full">
                Teto: {formatarMoeda(orcamentoTotalMes)}
              </span>
            )}
          </div>

          <div className="relative h-36 pt-5 flex items-end justify-between gap-2">
            {/* Linha tracejada do teto mensal */}
            {alturaLinhaTeto !== null && (
              <div
                className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-primary/50 z-10"
                style={{ bottom: `${Math.max(16, Math.round(alturaLinhaTeto * 0.82) + 18)}px` }}
              />
            )}

            {evolucao6Meses.map((item) => {
              const pct = Math.round((item.gasto / maxEvolucao) * 100);
              const estourou =
                orcamentoTotalMes > 0 && item.gasto > orcamentoTotalMes;
              return (
                <div
                  key={item.anoMes}
                  className="flex-1 flex flex-col items-center justify-end gap-1 h-full min-w-0"
                >
                  <span className="text-[10px] font-bold text-text-muted truncate max-w-full">
                    {item.gasto > 0
                      ? item.gasto >= 1000
                        ? `${(item.gasto / 1000).toFixed(1).replace(".", ",")}k`
                        : `${Math.round(item.gasto)}`
                      : "—"}
                  </span>
                  <div className="w-full flex-1 flex items-end justify-center">
                    <div
                      className={`w-full max-w-[34px] rounded-t-lg transition-all duration-300 ${
                        estourou
                          ? "bg-budget-red"
                          : item.atual
                            ? "bg-primary"
                            : "bg-primary/35"
                      }`}
                      style={{
                        height: `${item.gasto > 0 ? Math.max(8, pct) : 3}%`,
                      }}
                      title={`${item.labelCurto}: ${formatarMoeda(item.gasto)}`}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-bold ${
                      item.atual ? "text-primary" : "text-text-muted"
                    }`}
                  >
                    {item.labelCurto}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* 3. TOP 5 PRODUTOS DO MÊS (VILÕES DO ORÇAMENTO) */}
        <section className="bg-card border border-border rounded-[20px] p-4 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-text-main flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4 text-primary" />
                <span>Onde foi mais dinheiro</span>
              </h3>
              <p className="text-[11px] text-text-muted">
                Top produtos comprados em {mesLabel.toLowerCase()}
              </p>
            </div>
          </div>

          {topProdutos.length === 0 ? (
            <p className="text-xs text-text-muted py-6 text-center">
              Nenhuma compra finalizada neste mês ainda.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {topProdutos.slice(0, 5).map((prod, idx) => {
                const maxProd = topProdutos[0]?.gastoTotal || 1;
                const pct = Math.max(6, Math.round((prod.gastoTotal / maxProd) * 100));
                return (
                  <div key={`${prod.nome}-${idx}`} className="flex flex-col gap-1">
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
            </div>
          )}
        </section>

        {/* 4. GASTOS POR MERCADO */}
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

        {/* 5. FORMAS DE PAGAMENTO (VA, CRÉDITO, PIX...) */}
        <section className="bg-card border border-border rounded-[20px] p-4 shadow-sm flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-text-main flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-primary" />
              <span>Formas de pagamento</span>
            </h3>
            <p className="text-[11px] text-text-muted">
              Quanto foi no VA, Crédito, Pix ou Débito
            </p>
          </div>

          {pagamentosResumo.length === 0 ? (
            <p className="text-xs text-text-muted py-5 text-center">
              Nenhum pagamento registrado nas compras deste mês.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {pagamentosResumo.map((pg) => (
                <div key={pg.forma} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-text-main">{pg.forma}</span>
                    <span className="font-extrabold text-text-main">
                      {formatarMoeda(pg.valor)}{" "}
                      <span className="text-[11px] font-semibold text-text-muted">
                        ({pg.percentual}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${Math.max(4, pg.percentual)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 6. INFLAÇÃO DA CASA (O QUE SUBIU E O QUE CAIU) */}
      {(maisSubiram.length > 0 || maisCairam.length > 0) && (
        <section className="bg-card border border-border rounded-[20px] p-4 shadow-sm flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-text-main">
              Inflação da Casa
            </h3>
            <p className="text-[11px] text-text-muted">
              Último preço pago comparado à média anterior do produto
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {maisSubiram.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="text-[11px] font-extrabold text-budget-red-text flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Mais subiram</span>
                </div>
                {maisSubiram.map((item) => (
                  <div
                    key={`up-${item.nome}`}
                    className="bg-budget-red-bg/50 border border-budget-red/20 rounded-xl px-2.5 py-2 flex items-center justify-between gap-2"
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
                    className="bg-budget-green-bg/60 border border-budget-green/20 rounded-xl px-2.5 py-2 flex items-center justify-between gap-2"
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
  );
}
