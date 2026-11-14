"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckSquare,
  GitMerge,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Square,
  Tag,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  inferirEmojiPorNome,
  normalizarTexto,
  removerMarcaDoTexto,
  resolverSetorSugerido,
} from "@/lib/cupom-matcher";
import {
  MODELOS_IA_DISPONIVEIS,
  type ConfigIA,
  type ModeloIA,
} from "@/lib/ia-config";
import type { ProdutoCatalogoFormatadoIA } from "@/app/api/cupom/ia/route";
import type { Product, Sector } from "@/lib/types";

const TAMANHO_LOTE = 40;

interface LinhaRevisaoCatalogo {
  product: Product;
  nomeSugerido: string;
  marcaRemovida: string;
  setorSugeridoId: string;
  emojiSugerido: string;
  selecionado: boolean;
  teveMudanca: boolean;
}

interface CatalogAIFormatterModalProps {
  groupId: string;
  produtos: Product[];
  setores: Sector[];
  marcasConhecidas: string[];
  configIAInicial: ConfigIA;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

/**
 * Remove espaços repetidos e evita "📦" quando houver sugestão ou ícone mais específico
 */
function limparEmojiSugestao(
  emojiIA: string | undefined,
  emojiAtual: string | null,
  nomeReferencia: string,
  setor?: Sector | null
): string {
  const candidato = (emojiIA || "").trim();
  if (candidato && candidato !== "📦") {
    return candidato;
  }
  const atual = (emojiAtual || "").trim();
  if (atual && atual !== "📦") {
    return atual;
  }
  return inferirEmojiPorNome(nomeReferencia, setor) || "";
}

/**
 * Modal de padronização do catálogo de produtos usando IA em lotes pequenos,
 * com revisão Antes -> Depois e unificação segura para evitar duplicações.
 */
export default function CatalogAIFormatterModal({
  groupId,
  produtos,
  setores,
  marcasConhecidas,
  configIAInicial,
  onClose,
  onSaved,
}: CatalogAIFormatterModalProps) {
  const [etapa, setEtapa] = useState<"preparar" | "analisando" | "revisar">(
    "preparar"
  );
  const [modeloEscolhido, setModeloEscolhido] = useState<ModeloIA>(
    "gemini-3.5-flash-lite"
  );
  const [loteAtual, setLoteAtual] = useState(0);
  const [totalLotes, setTotalLotes] = useState(0);
  const [linhas, setLinhas] = useState<LinhaRevisaoCatalogo[]>([]);
  const [filtroApenasAlterados, setFiltroApenasAlterados] = useState(true);
  const [buscaRevisao, setBuscaRevisao] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoParcial, setAvisoParcial] = useState<string | null>(null);

  const temChave = configIAInicial.apiKey.trim().length >= 15;
  const lotesEstimados = Math.max(1, Math.ceil(produtos.length / TAMANHO_LOTE));

  const mapaSetores = useMemo(
    () => new Map(setores.map((s) => [s.id, s])),
    [setores]
  );

  // Calcula unificações automáticas caso dois produtos fiquem com o mesmo nome após tirar a marca
  const mapaUnificacoes = useMemo(() => {
    const mapaLinhas = new Map(linhas.map((r) => [r.product.id, r]));
    const donosPorNorm = new Map<string, Product>();

    // Passagem 1: produtos que mantêm o mesmo nome normalizado (não modificados ou apenas capitalização/acento)
    for (const p of produtos) {
      const row = mapaLinhas.get(p.id);
      const nomeEfetivo =
        row && row.selecionado ? row.nomeSugerido.trim() || p.nome : p.nome;
      const normOriginal = normalizarTexto(p.nome);
      const normEfetivo = normalizarTexto(nomeEfetivo);
      if (normEfetivo && normEfetivo === normOriginal && !donosPorNorm.has(normEfetivo)) {
        donosPorNorm.set(normEfetivo, p);
      }
    }

    // Passagem 2: novos nomes vindos da revisão que ainda não possuem dono oficial
    for (const row of linhas) {
      if (!row.selecionado) continue;
      const nomeEfetivo = row.nomeSugerido.trim() || row.product.nome;
      const norm = normalizarTexto(nomeEfetivo);
      if (norm && !donosPorNorm.has(norm)) {
        donosPorNorm.set(norm, row.product);
      }
    }

    // Mapeia productId -> produto destino (quando for diferente dele mesmo)
    const destinoPorOrigem = new Map<string, Product>();
    for (const row of linhas) {
      if (!row.selecionado) continue;
      const nomeAlvo = row.nomeSugerido.trim() || row.product.nome;
      const normAlvo = normalizarTexto(nomeAlvo);
      const dono = normAlvo ? donosPorNorm.get(normAlvo) : undefined;
      if (dono && dono.id !== row.product.id) {
        destinoPorOrigem.set(row.product.id, dono);
      }
    }

    return destinoPorOrigem;
  }, [produtos, linhas]);

  const linhasVisiveis = useMemo(() => {
    const termo = normalizarTexto(buscaRevisao);
    return linhas.filter((row) => {
      if (filtroApenasAlterados && !row.teveMudanca) {
        return false;
      }
      if (!termo) return true;
      return (
        normalizarTexto(row.product.nome).includes(termo) ||
        normalizarTexto(row.nomeSugerido).includes(termo) ||
        normalizarTexto(row.marcaRemovida).includes(termo)
      );
    });
  }, [linhas, filtroApenasAlterados, buscaRevisao]);

  const totalSelecionados = useMemo(
    () => linhas.filter((l) => l.selecionado).length,
    [linhas]
  );

  const totalComMudanca = useMemo(
    () => linhas.filter((l) => l.teveMudanca).length,
    [linhas]
  );

  async function iniciarAnaliseIA() {
    if (!temChave || produtos.length === 0) return;

    setErro(null);
    setAvisoParcial(null);
    setEtapa("analisando");

    const chunks: Product[][] = [];
    for (let i = 0; i < produtos.length; i += TAMANHO_LOTE) {
      chunks.push(produtos.slice(i, i + TAMANHO_LOTE));
    }

    setTotalLotes(chunks.length);
    setLoteAtual(0);

    const resultadoTotal: LinhaRevisaoCatalogo[] = [];

    for (let b = 0; b < chunks.length; b++) {
      setLoteAtual(b + 1);
      const lote = chunks[b];

      try {
        const res = await fetch("/api/cupom/ia", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-gemini-api-key": configIAInicial.apiKey,
          },
          body: JSON.stringify({
            acao: "formatar_catalogo",
            modelo: modeloEscolhido,
            setores: setores.map((s) => s.nome),
            marcas_conhecidas: marcasConhecidas,
            produtos: lote.map((p, idx) => ({
              indice: idx,
              nome: p.nome,
              setor_atual: p.sector_id
                ? mapaSetores.get(p.sector_id)?.nome || ""
                : "",
              emoji_atual: p.emoji || "",
            })),
          }),
        });

        const data = await res.json();
        if (!res.ok || !data?.ok) {
          throw new Error(
            data?.erro || "Não foi possível analisar este bloco com a IA."
          );
        }

        const itensIA = (data.itens || []) as ProdutoCatalogoFormatadoIA[];
        const porIndice = new Map<number, ProdutoCatalogoFormatadoIA>();
        for (const reg of itensIA) {
          if (typeof reg?.indice === "number") {
            porIndice.set(reg.indice, reg);
          }
        }

        lote.forEach((prod, idx) => {
          const sug = porIndice.get(idx);
          const marcaRemovida = (sug?.marca_removida || "").trim();
          let nomeSugerido = (sug?.nome_sugerido || prod.nome)
            .replace(/\s+/g, " ")
            .trim();
          if (marcaRemovida) {
            nomeSugerido = removerMarcaDoTexto(nomeSugerido, marcaRemovida);
          }
          if (!nomeSugerido) nomeSugerido = prod.nome;

          const setorResolvido = resolverSetorSugerido(
            sug?.setor_sugerido,
            [nomeSugerido, prod.nome],
            setores
          );
          const setorSugeridoId = prod.sector_id
            ? sug?.setor_sugerido
              ? setorResolvido?.id || prod.sector_id
              : prod.sector_id
            : setorResolvido?.id || "";

          const emojiSugerido = limparEmojiSugestao(
            sug?.emoji_sugerido,
            prod.emoji,
            nomeSugerido,
            setorSugeridoId ? mapaSetores.get(setorSugeridoId) : null
          );

          const teveMudanca =
            nomeSugerido !== prod.nome ||
            emojiSugerido !== (prod.emoji || "") ||
            setorSugeridoId !== (prod.sector_id || "");

          resultadoTotal.push({
            product: prod,
            nomeSugerido,
            marcaRemovida,
            setorSugeridoId,
            emojiSugerido,
            selecionado: teveMudanca,
            teveMudanca,
          });
        });
      } catch (err: any) {
        if (resultadoTotal.length > 0) {
          setAvisoParcial(
            `A análise parou no lote ${b + 1} de ${chunks.length}: ${
              err?.message || "limite temporário"
            }. Você já pode revisar e salvar os ${resultadoTotal.length} produtos analisados até aqui.`
          );
          break;
        }
        setErro(
          err?.message || "Não foi possível analisar o catálogo com a IA."
        );
        setEtapa("preparar");
        return;
      }
    }

    setLinhas(resultadoTotal);
    const houveAlgumaMelhoria = resultadoTotal.some((r) => r.teveMudanca);
    setFiltroApenasAlterados(houveAlgumaMelhoria);
    setEtapa("revisar");
  }

  function atualizarLinha(
    productId: string,
    parcial: Partial<LinhaRevisaoCatalogo>
  ) {
    setLinhas((prev) =>
      prev.map((row) =>
        row.product.id === productId ? { ...row, ...parcial } : row
      )
    );
  }

  function alternarSelecaoVisiveis(marcar: boolean) {
    const idsVisiveis = new Set(linhasVisiveis.map((l) => l.product.id));
    setLinhas((prev) =>
      prev.map((row) =>
        idsVisiveis.has(row.product.id)
          ? { ...row, selecionado: marcar }
          : row
      )
    );
  }

  async function handleAplicarAlteracoes() {
    const selecionadas = linhas.filter((l) => l.selecionado);
    if (selecionadas.length === 0) {
      onClose();
      return;
    }

    setAplicando(true);
    setErro(null);

    try {
      const supabase = createClient();

      // Aplica primeiro atualizações sem unificação, depois unificações para manter referências consistentes
      const normais = selecionadas.filter(
        (row) => !mapaUnificacoes.has(row.product.id)
      );
      const unificacoes = selecionadas.filter((row) =>
        mapaUnificacoes.has(row.product.id)
      );

      for (const row of normais) {
        const nomeLimpo = row.nomeSugerido.trim() || row.product.nome;
        const emojiLimpo = row.emojiSugerido.trim() || null;
        const setorLimpo = row.setorSugeridoId || null;

        const { error: errUp } = await supabase
          .from("products")
          .update({
            nome: nomeLimpo,
            emoji: emojiLimpo,
            sector_id: setorLimpo,
          })
          .eq("id", row.product.id)
          .eq("group_id", groupId);

        if (errUp) throw errUp;
      }

      for (const row of unificacoes) {
        const destino = mapaUnificacoes.get(row.product.id);
        if (!destino) continue;

        // Reaponta histórico de preços e carrinhos para o produto oficial único
        const { error: errPrecos } = await supabase
          .from("prices")
          .update({ product_id: destino.id })
          .eq("product_id", row.product.id)
          .eq("group_id", groupId);
        if (errPrecos) throw errPrecos;

        const { error: errCartItems } = await supabase
          .from("cart_items")
          .update({ product_id: destino.id })
          .eq("product_id", row.product.id)
          .eq("group_id", groupId);
        if (errCartItems) throw errCartItems;

        if (!destino.emoji && row.emojiSugerido.trim()) {
          await supabase
            .from("products")
            .update({ emoji: row.emojiSugerido.trim() })
            .eq("id", destino.id)
            .eq("group_id", groupId);
        }

        const { error: errDel } = await supabase
          .from("products")
          .delete()
          .eq("id", row.product.id)
          .eq("group_id", groupId);

        if (errDel) {
          await supabase
            .from("products")
            .update({ ativo: false })
            .eq("id", row.product.id)
            .eq("group_id", groupId);
        }
      }

      await onSaved();
      onClose();
    } catch (err: any) {
      setErro(
        err?.message || "Erro ao aplicar as alterações selecionadas no catálogo."
      );
      setAplicando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/55 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="w-full max-w-md md:max-w-3xl max-h-[94dvh] bg-card rounded-t-[24px] md:rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold text-text-main truncate">
                Organizar produtos com IA
              </h2>
              <p className="text-xs text-text-muted truncate">
                Padroniza nomes, tira marcas e preenche ícones sem duplicar seu
                catálogo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !aplicando && onClose()}
            className="w-9 h-9 rounded-full bg-background border border-border flex items-center justify-center text-text-muted hover:text-text-main shrink-0 cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {erro && (
            <div className="p-3 rounded-xl bg-danger-light text-danger text-xs font-semibold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          )}

          {avisoParcial && (
            <div className="p-3 rounded-xl bg-warning-light text-warning text-xs font-semibold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{avisoParcial}</span>
            </div>
          )}

          {etapa === "preparar" && (
            <div className="flex flex-col gap-4">
              {!temChave ? (
                <div className="p-4 rounded-2xl bg-background border border-border flex flex-col gap-3">
                  <div className="text-sm font-extrabold text-text-main">
                    Chave do Google AI Studio não configurada
                  </div>
                  <p className="text-xs text-text-muted leading-relaxed">
                    Para usar a organização automática com IA, cadastre uma vez a
                    chave do Google AI Studio na aba <strong>Mais</strong>. Ela
                    fica salva na conta da sua família.
                  </p>
                  <Link
                    href="/mais"
                    className="h-11 px-4 rounded-btn bg-primary text-white text-xs font-bold inline-flex items-center justify-center gap-2 self-start"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Ir para Mais e configurar chave</span>
                  </Link>
                </div>
              ) : (
                <>
                  <div className="p-4 rounded-2xl bg-background border border-border flex flex-col gap-1.5">
                    <div className="text-sm font-extrabold text-text-main">
                      Pronto para revisar {produtos.length}{" "}
                      {produtos.length === 1 ? "produto" : "produtos"}
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed">
                      Os produtos serão enviados em blocos de até {TAMANHO_LOTE}{" "}
                      itens ({lotesEstimados}{" "}
                      {lotesEstimados === 1 ? "requisição" : "requisições"}).
                      Nada será salvo no banco antes da sua aprovação na prévia{" "}
                      <strong>Antes → Depois</strong>.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-bold text-text-muted">
                      Modelo para esta organização
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {MODELOS_IA_DISPONIVEIS.map((mod) => {
                        const ativo = modeloEscolhido === mod.id;
                        return (
                          <button
                            key={mod.id}
                            type="button"
                            onClick={() => setModeloEscolhido(mod.id)}
                            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                              ativo
                                ? "bg-primary-light border-primary"
                                : "bg-background border-border hover:border-primary/40"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-extrabold text-text-main">
                                {mod.id === "gemini-3.5-flash-lite"
                                  ? "Gemini 3.5 Flash Lite (Mais cota)"
                                  : "Gemini 3.8 Flash"}
                              </span>
                              {ativo && (
                                <Check className="w-4 h-4 text-primary shrink-0" />
                              )}
                            </div>
                            <p className="text-[11px] text-text-muted mt-1 leading-snug">
                              {mod.descricao}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {etapa === "analisando" && (
            <div className="py-10 flex flex-col items-center justify-center gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary-light text-primary flex items-center justify-center">
                <RefreshCw className="w-7 h-7 animate-spin" />
              </div>
              <div>
                <div className="text-base font-extrabold text-text-main">
                  Organizando catálogo com IA...
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Analisando bloco {loteAtual} de {totalLotes} (até{" "}
                  {TAMANHO_LOTE} produtos por chamada)
                </p>
              </div>
              <div className="w-full max-w-sm h-2.5 rounded-full bg-background border border-border overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{
                    width: `${
                      totalLotes > 0
                        ? Math.round((loteAtual / totalLotes) * 100)
                        : 15
                    }%`,
                  }}
                />
              </div>
            </div>
          )}

          {etapa === "revisar" && (
            <div className="flex flex-col gap-3.5">
              {/* Filtros e ações rápidas */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-background border border-border rounded-2xl p-3">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFiltroApenasAlterados(true)}
                    className={`h-8 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                      filtroApenasAlterados
                        ? "bg-primary text-white"
                        : "bg-card text-text-muted border border-border"
                    }`}
                  >
                    Com sugestões ({totalComMudanca})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroApenasAlterados(false)}
                    className={`h-8 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                      !filtroApenasAlterados
                        ? "bg-primary text-white"
                        : "bg-card text-text-muted border border-border"
                    }`}
                  >
                    Todos ({linhas.length})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => alternarSelecaoVisiveis(true)}
                    className="h-8 px-2.5 rounded-xl bg-card border border-border text-[11px] font-bold text-primary hover:bg-primary-light inline-flex items-center gap-1 cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Marcar visíveis</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => alternarSelecaoVisiveis(false)}
                    className="h-8 px-2.5 rounded-xl bg-card border border-border text-[11px] font-bold text-text-muted hover:text-text-main inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Desmarcar</span>
                  </button>
                </div>
              </div>

              {/* Busca na prévia */}
              <div className="relative">
                <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={buscaRevisao}
                  onChange={(e) => setBuscaRevisao(e.target.value)}
                  placeholder="Filtrar prévia por nome ou marca..."
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-background border border-border text-xs font-medium focus:outline-none focus:border-primary"
                />
              </div>

              {linhasVisiveis.length === 0 ? (
                <div className="p-6 rounded-2xl bg-background border border-border text-center text-xs text-text-muted">
                  {totalComMudanca === 0
                    ? "Seu catálogo já está bem formatado! Nenhuma mudança automática foi necessária."
                    : "Nenhum produto encontrado para este filtro."}
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {linhasVisiveis.map((row) => {
                    const setorAtualNome =
                      (row.product.sector_id &&
                        mapaSetores.get(row.product.sector_id)?.nome) ||
                      "Sem setor";
                    const destinoDuplicado = mapaUnificacoes.get(
                      row.product.id
                    );

                    return (
                      <div
                        key={row.product.id}
                        className={`rounded-2xl border p-3.5 flex flex-col gap-2.5 transition-colors ${
                          row.selecionado
                            ? "bg-background border-primary/50"
                            : "bg-background/50 border-border opacity-75"
                        }`}
                      >
                        {/* Linha superior: Checkbox + Antes */}
                        <div className="flex items-start justify-between gap-2">
                          <label className="flex items-start gap-2.5 cursor-pointer min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={row.selecionado}
                              onChange={(e) =>
                                atualizarLinha(row.product.id, {
                                  selecionado: e.target.checked,
                                })
                              }
                              className="w-4 h-4 mt-0.5 accent-primary shrink-0 cursor-pointer"
                            />
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold text-text-muted uppercase tracking-wide">
                                Atual no catálogo
                              </div>
                              <div className="text-xs font-semibold text-text-main flex items-center gap-1.5 flex-wrap">
                                <span>{row.product.emoji || "📦"}</span>
                                <span className="break-words">
                                  {row.product.nome}
                                </span>
                                <span className="text-text-muted font-normal">
                                  ({setorAtualNome})
                                </span>
                              </div>
                            </div>
                          </label>

                          {row.marcaRemovida && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-light text-primary text-[10px] font-bold shrink-0">
                              <Tag className="w-2.5 h-2.5" />
                              <span>Marca: {row.marcaRemovida}</span>
                            </span>
                          )}
                        </div>

                        {/* Linha inferior: Depois (editável) */}
                        <div className="grid grid-cols-1 sm:grid-cols-[56px_1fr_170px] gap-2 items-center">
                          <div>
                            <label className="text-[10px] font-semibold text-text-muted block mb-0.5">
                              Ícone
                            </label>
                            <input
                              type="text"
                              maxLength={8}
                              value={row.emojiSugerido}
                              onChange={(e) =>
                                atualizarLinha(row.product.id, {
                                  emojiSugerido: e.target.value,
                                  selecionado: true,
                                })
                              }
                              placeholder="📦"
                              className="w-full h-10 px-2 rounded-xl bg-card border border-border text-center text-lg focus:outline-none focus:border-primary"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold text-text-muted block mb-0.5">
                              Nome padronizado
                            </label>
                            <input
                              type="text"
                              value={row.nomeSugerido}
                              onChange={(e) =>
                                atualizarLinha(row.product.id, {
                                  nomeSugerido: e.target.value,
                                  selecionado: true,
                                })
                              }
                              className="w-full h-10 px-3 rounded-xl bg-card border border-border text-xs font-bold text-text-main focus:outline-none focus:border-primary"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold text-text-muted block mb-0.5">
                              Setor
                            </label>
                            <select
                              value={row.setorSugeridoId}
                              onChange={(e) =>
                                atualizarLinha(row.product.id, {
                                  setorSugeridoId: e.target.value,
                                  selecionado: true,
                                })
                              }
                              className="w-full h-10 px-2.5 rounded-xl bg-card border border-border text-xs font-semibold text-text-main focus:outline-none focus:border-primary"
                            >
                              <option value="">Sem setor</option>
                              {setores.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.emoji} {s.nome}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {destinoDuplicado && (
                          <div className="px-2.5 py-1.5 rounded-xl bg-warning-light text-warning text-[11px] font-semibold flex items-center gap-1.5">
                            <GitMerge className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Já existe &ldquo;{destinoDuplicado.nome}&rdquo; no
                              catálogo — histórico de preços e compras será
                              unificado sem duplicar.
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-5 py-4 border-t border-border bg-card flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => !aplicando && onClose()}
            disabled={aplicando}
            className="h-11 px-4 rounded-xl border border-border text-xs font-bold text-text-muted hover:text-text-main cursor-pointer"
          >
            {etapa === "revisar" ? "Cancelar" : "Fechar"}
          </button>

          {etapa === "preparar" && temChave && (
            <button
              type="button"
              onClick={iniciarAnaliseIA}
              disabled={produtos.length === 0}
              className="h-11 px-5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-extrabold flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>Analisar catálogo</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {etapa === "revisar" && (
            <button
              type="button"
              onClick={handleAplicarAlteracoes}
              disabled={aplicando || totalSelecionados === 0}
              className="h-11 px-5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-extrabold flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {aplicando ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Aplicando...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>
                    Aplicar {totalSelecionados}{" "}
                    {totalSelecionados === 1 ? "alteração" : "alterações"}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
