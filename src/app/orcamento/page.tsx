"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Check, Trash2, AlertCircle } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import SupabaseSetupGuide from "@/components/SupabaseSetupGuide";
import BottomNav from "@/components/BottomNav";
import {
  formatarMoeda,
  parseDecimalBR,
  pertenceAoMesAtualNoFuso,
  LIMITE_ORCAMENTO_ALERTA,
  LIMITE_ORCAMENTO_ESTOURO,
} from "@/lib/format";
import type { Cart, CartItem, Group, Product, Sector } from "@/lib/types";

const SUGESTOES_ORCAMENTO = [100, 150, 300, 500, 800];

export default function OrcamentoPage() {
  const router = useRouter();
  const configurado = isSupabaseConfigured();

  const [carregando, setCarregando] = useState(true);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<Group | null>(null);
  const [setores, setSetores] = useState<Sector[]>([]);
  const [gastoPorSetor, setGastoPorSetor] = useState<Map<string, number>>(
    new Map()
  );
  const [qtdProdutosPorSetor, setQtdProdutosPorSetor] = useState<
    Map<string, number>
  >(new Map());

  // Estados do Bottom Sheet de criar/editar setor
  const [modalAberto, setModalAberto] = useState(false);
  const [setorEditando, setSetorEditando] = useState<Sector | null>(null);
  const [nomeSetor, setNomeSetor] = useState("");
  const [emojiSetor, setEmojiSetor] = useState("");
  const [orcamentoTexto, setOrcamentoTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    if (!configurado) {
      setCarregando(false);
      return;
    }

    setCarregando(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: memberRows } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id)
        .limit(1);

      if (!memberRows || memberRows.length === 0) {
        router.replace("/");
        return;
      }

      const gId = memberRows[0].group_id;
      setGroupId(gId);

      const [
        { data: gData },
        { data: secData },
        { data: prodData },
        { data: cartsData },
        { data: itemsData },
      ] = await Promise.all([
        supabase.from("groups").select("*").eq("id", gId).single(),
        supabase
          .from("sectors")
          .select("*")
          .eq("group_id", gId)
          .order("ordem", { ascending: true })
          .order("nome", { ascending: true }),
        supabase.from("products").select("*").eq("group_id", gId),
        supabase
          .from("carts")
          .select("*")
          .eq("group_id", gId)
          .eq("status", "finalizado"),
        supabase.from("cart_items").select("*").eq("group_id", gId),
      ]);

      const grp = (gData as Group) || null;
      const secs = (secData as Sector[]) || [];
      const prods = (prodData as Product[]) || [];
      const carrinhosFinalizados = (cartsData as Cart[]) || [];
      const todosItens = (itemsData as CartItem[]) || [];

      setGrupo(grp);
      setSetores(secs);

      // Mapeia produto -> setor e conta produtos por setor
      const mapaProdSetor = new Map<string, string | null>();
      const mapaContagemProd = new Map<string, number>();
      for (const p of prods) {
        if (p.codigo_barras === "__config_ia_grupo__") continue;
        mapaProdSetor.set(p.id, p.sector_id);
        if (p.sector_id && p.codigo_barras !== "__avulso__") {
          mapaContagemProd.set(
            p.sector_id,
            (mapaContagemProd.get(p.sector_id) || 0) + 1
          );
        }
      }
      setQtdProdutosPorSetor(mapaContagemProd);

      // Filtra carrinhos finalizados no mês vigente conforme o fuso horário do grupo
      const fuso = grp?.fuso_horario || "America/Cuiaba";
      const idsFinalizadosNoMes = new Set(
        carrinhosFinalizados
          .filter((c) =>
            pertenceAoMesAtualNoFuso(c.finalizado_em || c.criado_em, fuso)
          )
          .map((c) => c.id)
      );

      // Soma (preço real × quantidade) dos itens de carrinhos finalizados no mês (incluindo itens sem setor / avulsos)
      const mapaGasto = new Map<string, number>();
      for (const item of todosItens) {
        if (!idsFinalizadosNoMes.has(item.cart_id)) continue;
        // Considera itens marcados (ou todos caso algum carrinho antigo não tenha desmarcado)
        if (item.marcado === false) continue;

        const secId =
          item.sector_id_avulso ||
          (item.product_id ? mapaProdSetor.get(item.product_id) : null) ||
          "sem_setor";

        const precoUnit =
          item.preco_real !== null && item.preco_real !== undefined
            ? Number(item.preco_real)
            : Number(item.preco_estimado || 0);
        const subtotal = precoUnit * Number(item.quantidade || 0);

        mapaGasto.set(secId, (mapaGasto.get(secId) || 0) + subtotal);
      }

      setGastoPorSetor(mapaGasto);
    } catch {
      // Falha silenciosa de rede
    } finally {
      setCarregando(false);
    }
  }, [configurado, router]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Totais gerais do mês
  const { gastoTotalMes, orcamentoTotalMes, percentualTotal, gastoSemSetor } =
    useMemo(() => {
      let somaGasto = 0;
      let somaOrcamento = 0;

      for (const s of setores) {
        somaGasto += gastoPorSetor.get(s.id) || 0;
        if (s.orcamento_mensal !== null && Number(s.orcamento_mensal) > 0) {
          somaOrcamento += Number(s.orcamento_mensal);
        }
      }

      const semSetor = gastoPorSetor.get("sem_setor") || 0;
      somaGasto += semSetor;

      const perc =
        somaOrcamento > 0 ? Math.round((somaGasto / somaOrcamento) * 100) : 0;

      return {
        gastoTotalMes: somaGasto,
        orcamentoTotalMes: somaOrcamento,
        percentualTotal: perc,
        gastoSemSetor: semSetor,
      };
    }, [setores, gastoPorSetor]);

  // Define as cores reservadas exclusivamente ao orçamento (Seção 6 e 4-orcamento.html)
  function obterCoresOrcamento(razao: number): {
    corBarra: string;
    corTexto: string;
  } {
    if (razao > LIMITE_ORCAMENTO_ESTOURO) {
      return { corBarra: "#D64545", corTexto: "#B3261E" }; // Vermelho (> 100%)
    }
    if (razao >= LIMITE_ORCAMENTO_ALERTA) {
      return { corBarra: "#E8A200", corTexto: "#7A5000" }; // Amarelo (80% a 100%)
    }
    return { corBarra: "#1F9D57", corTexto: "#14783F" }; // Verde (até 80%)
  }

  function abrirModalNovoSetor() {
    setSetorEditando(null);
    setNomeSetor("");
    setEmojiSetor("");
    setOrcamentoTexto("");
    setConfirmarExclusao(false);
    setErroForm(null);
    setModalAberto(true);
  }

  function abrirModalEditarSetor(setor: Sector) {
    setSetorEditando(setor);
    setNomeSetor(setor.nome);
    setEmojiSetor(setor.emoji || "🛒");
    setOrcamentoTexto(
      setor.orcamento_mensal !== null && Number(setor.orcamento_mensal) > 0
        ? Number(setor.orcamento_mensal).toFixed(2).replace(".", ",")
        : ""
    );
    setConfirmarExclusao(false);
    setErroForm(null);
    setModalAberto(true);
  }

  async function handleSalvarSetor(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId) return;

    const nomeLimpo = nomeSetor.trim();
    if (!nomeLimpo) {
      setErroForm("Digite o nome do setor.");
      return;
    }

    let valorOrcamento: number | null = null;
    if (orcamentoTexto.trim() !== "") {
      const parsed = parseDecimalBR(orcamentoTexto);
      if (parsed < 0) {
        setErroForm("O orçamento mensal não pode ser negativo.");
        return;
      }
      valorOrcamento = parsed > 0 ? parsed : null;
    }

    const emojiFinal = emojiSetor.trim() || "🛒";

    setSalvando(true);
    setErroForm(null);

    try {
      const supabase = createClient();

      if (setorEditando) {
        // Atualização otimista na lista local
        setSetores((antigos) =>
          antigos.map((s) =>
            s.id === setorEditando.id
              ? {
                  ...s,
                  nome: nomeLimpo,
                  emoji: emojiFinal,
                  orcamento_mensal: valorOrcamento,
                }
              : s
          )
        );

        const { error } = await supabase
          .from("sectors")
          .update({
            nome: nomeLimpo,
            emoji: emojiFinal,
            orcamento_mensal: valorOrcamento,
          })
          .eq("id", setorEditando.id);

        if (error) {
          setErroForm("Não foi possível salvar as alterações do setor.");
          await carregarDados();
          return;
        }
      } else {
        const proximaOrdem =
          setores.length > 0
            ? Math.max(...setores.map((s) => s.ordem || 0)) + 1
            : 1;

        const { data: novo, error } = await supabase
          .from("sectors")
          .insert({
            group_id: groupId,
            nome: nomeLimpo,
            emoji: emojiFinal,
            orcamento_mensal: valorOrcamento,
            ordem: proximaOrdem,
          })
          .select("*")
          .single();

        if (error) {
          setErroForm("Não foi possível criar o setor.");
          return;
        }

        if (novo) {
          setSetores((antigos) => [...antigos, novo as Sector]);
        }
      }

      setModalAberto(false);
    } catch {
      setErroForm("Erro de conexão ao salvar o setor.");
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluirSetor() {
    if (!setorEditando) return;
    setExcluindo(true);
    setErroForm(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("sectors")
        .delete()
        .eq("id", setorEditando.id);

      if (error) {
        setErroForm("Não foi possível excluir este setor.");
        return;
      }

      setSetores((antigos) =>
        antigos.filter((s) => s.id !== setorEditando.id)
      );
      setModalAberto(false);
    } catch {
      setErroForm("Erro ao excluir setor.");
    } finally {
      setExcluindo(false);
    }
  }

  if (!configurado) {
    return <SupabaseSetupGuide />;
  }

  if (carregando) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-text-main pb-24">
        <main className="flex-1 w-full max-w-md mx-auto px-5 pt-5 flex flex-col gap-3">
          <div className="h-12 w-48 bg-border/70 rounded-xl animate-pulse" />
          <div className="h-32 w-full bg-border/70 rounded-[20px] animate-pulse" />
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="h-16 w-full bg-border/70 rounded-[14px] animate-pulse"
            />
          ))}
        </main>
        <BottomNav />
      </div>
    );
  }

  // Formata o mês atual usando o fuso horário do grupo (ex: Outubro de 2026)
  let mesAnoFormatado = "Mês atual";
  try {
    const fmt = new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: grupo?.fuso_horario || "America/Cuiaba",
    });
    const txt = fmt.format(new Date());
    mesAnoFormatado = txt.charAt(0).toUpperCase() + txt.slice(1);
  } catch {
    mesAnoFormatado = "Mês atual";
  }

  const razaoTotal =
    orcamentoTotalMes > 0 ? gastoTotalMes / orcamentoTotalMes : 0;
  const coresTotais = obterCoresOrcamento(razaoTotal);
  const larguraBarraTotal =
    orcamentoTotalMes > 0
      ? Math.min(100, Math.round((gastoTotalMes / orcamentoTotalMes) * 100))
      : 0;

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-main pb-28 md:pb-8 md:pl-64">
      <main className="flex-1 w-full max-w-md md:max-w-4xl lg:max-w-6xl mx-auto px-5 md:px-8 pt-5 md:pt-8 flex flex-col gap-3">
        {/* Cabeçalho fiel à referência 4-orcamento.html */}
        <div className="flex items-center justify-between h-12">
          <div>
            <div className="text-[13px] text-text-muted font-medium">
              {mesAnoFormatado}
            </div>
            <h1 className="m-0 text-[28px] font-extrabold leading-[1.2]">
              Orçamento
            </h1>
          </div>

          <button
            type="button"
            onClick={abrirModalNovoSetor}
            className="flex items-center gap-1 h-11 px-3.5 rounded-full bg-primary-light text-primary-hover text-[13px] font-bold hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.4]" />
            <span>Setor</span>
          </button>
        </div>

        {/* Card Principal: Gasto total do mês (4-orcamento.html) */}
        <div className="bg-card border border-border rounded-[20px] px-[18px] py-4">
          <div className="text-[13px] text-text-muted font-semibold">
            Gasto total do mês
          </div>
          <div className="flex items-baseline gap-2 mt-1 flex-wrap">
            <span className="text-[30px] font-extrabold leading-none">
              {formatarMoeda(gastoTotalMes)}
            </span>
            <span className="text-[14px] text-text-muted">
              {orcamentoTotalMes > 0
                ? `de ${formatarMoeda(orcamentoTotalMes)}`
                : "sem teto mensal definido"}
            </span>
          </div>

          <div className="h-[10px] rounded-[5px] bg-border mt-2.5 overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${larguraBarraTotal}%`,
                backgroundColor: coresTotais.corBarra,
              }}
            />
          </div>

          <div className="text-[12px] text-text-muted mt-2">
            {orcamentoTotalMes <= 0 ? (
              <span>
                Toque em qualquer setor abaixo para definir o valor mensal
              </span>
            ) : gastoTotalMes <= orcamentoTotalMes ? (
              <span>
                {percentualTotal}% usado · faltam{" "}
                {formatarMoeda(orcamentoTotalMes - gastoTotalMes)}
              </span>
            ) : (
              <span
                className="font-bold"
                style={{ color: coresTotais.corTexto }}
              >
                {percentualTotal}% usado · acima em{" "}
                {formatarMoeda(gastoTotalMes - orcamentoTotalMes)}
              </span>
            )}
          </div>
        </div>

        {/* Lista de Setores com barras coloridas em grid responsivo (4-orcamento.html) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {setores.map((setor) => {
            const gasto = gastoPorSetor.get(setor.id) || 0;
            const orcamento =
              setor.orcamento_mensal !== null
                ? Number(setor.orcamento_mensal)
                : 0;
            const temOrcamento = orcamento > 0;
            const razao = temOrcamento ? gasto / orcamento : 0;
            const percentual = temOrcamento ? Math.round(razao * 100) : 0;
            const larguraBarra = temOrcamento
              ? Math.min(100, Math.max(gasto > 0 ? 2 : 0, percentual))
              : 0;
            const cores = obterCoresOrcamento(razao);

            return (
              <button
                key={setor.id}
                type="button"
                onClick={() => abrirModalEditarSetor(setor)}
                className="w-full text-left bg-card border border-border rounded-[14px] px-[14px] py-[9px] flex flex-col gap-[6px] hover:border-primary/50 transition-colors cursor-pointer"
              >
                <div className="flex justify-between items-center gap-2">
                  <span className="text-[14px] font-bold truncate">
                    {setor.emoji} {setor.nome}
                  </span>
                  {temOrcamento ? (
                    <span className="text-[12px] text-text-muted shrink-0">
                      {formatarMoeda(gasto)} / {formatarMoeda(orcamento)}
                    </span>
                  ) : (
                    <span className="text-[12px] font-semibold text-primary shrink-0">
                      {gasto > 0 ? `${formatarMoeda(gasto)} · ` : ""}defina um
                      valor
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-[10px]">
                  <div className="flex-1 h-[8px] rounded-[4px] bg-border overflow-hidden">
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${larguraBarra}%`,
                        backgroundColor: temOrcamento
                          ? cores.corBarra
                          : "transparent",
                      }}
                    />
                  </div>
                  <span
                    className="w-[40px] text-right text-[12px] font-bold shrink-0"
                    style={{
                      color: temOrcamento ? cores.corTexto : "#5B6270",
                    }}
                  >
                    {temOrcamento ? `${percentual}%` : "—"}
                  </span>
                </div>
              </button>
            );
          })}

          {gastoSemSetor > 0 && (
            <div className="w-full text-left bg-card border border-dashed border-border rounded-[14px] px-[14px] py-[11px] flex flex-col gap-1">
              <div className="flex justify-between items-center gap-2">
                <span className="text-[14px] font-bold truncate">
                  🧾 Avulsos / Sem setor
                </span>
                <span className="text-[12px] font-extrabold text-text-main shrink-0">
                  {formatarMoeda(gastoSemSetor)}
                </span>
              </div>
              <p className="text-[11px] text-text-muted leading-snug">
                Compras avulsas ou produtos sem setor definido (já somados no gasto total do mês). Você pode atribuir um setor pelo Histórico.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Modal / Bottom Sheet para Criar ou Editar Setor */}
      {modalAberto && (
        <div
          className="fixed inset-0 z-50 bg-black/45 flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setModalAberto(false)}
        >
          <div
            className="w-full max-w-md md:max-w-lg bg-card rounded-t-[26px] md:rounded-2xl p-5 pb-7 shadow-2xl animate-in fade-in duration-200 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-border mx-auto mb-3" />

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold">
                {setorEditando ? "Editar setor" : "Novo setor"}
              </h2>
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                className="w-9 h-9 rounded-full bg-background flex items-center justify-center text-text-muted hover:text-text-main cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {erroForm && (
              <div className="mb-3 p-3 rounded-xl bg-budget-red-bg text-budget-red-text text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{erroForm}</span>
              </div>
            )}

            <form onSubmit={handleSalvarSetor} className="flex flex-col gap-3.5">
              <div className="flex gap-2.5">
                <div className="w-20">
                  <label className="block text-xs font-bold text-text-muted mb-1">
                    Emoji
                  </label>
                  <input
                    type="text"
                    value={emojiSetor}
                    onFocus={() => {
                      if (emojiSetor === "🛒" && !setorEditando) {
                        setEmojiSetor("");
                      }
                    }}
                    onChange={(e) => setEmojiSetor(e.target.value)}
                    placeholder="🛒"
                    maxLength={4}
                    className="w-full h-12 rounded-xl border border-border bg-background text-center text-xl focus:outline-none focus:border-primary focus:placeholder-transparent"
                  />
                </div>

                <div className="flex-1">
                  <label className="block text-xs font-bold text-text-muted mb-1">
                    Nome do setor
                  </label>
                  <input
                    type="text"
                    value={nomeSetor}
                    onChange={(e) => setNomeSetor(e.target.value)}
                    placeholder="Ex: Hortifruti, Padaria..."
                    required
                    className="w-full h-12 px-3.5 rounded-xl border border-border bg-background text-sm font-semibold focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-text-muted">
                    Orçamento mensal (R$)
                  </label>
                  {orcamentoTexto && (
                    <button
                      type="button"
                      onClick={() => setOrcamentoTexto("")}
                      className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                    >
                      Deixar sem limite
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  inputMode="decimal"
                  value={orcamentoTexto}
                  onChange={(e) => setOrcamentoTexto(e.target.value)}
                  placeholder="Ex: 450,00 (ou deixe em branco)"
                  className="w-full h-12 px-3.5 rounded-xl border border-border bg-background text-base font-extrabold focus:outline-none focus:border-primary"
                />

                {/* Atalhos rápidos de orçamento */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {SUGESTOES_ORCAMENTO.map((val) => {
                    const txt = val.toFixed(2).replace(".", ",");
                    const ativo = orcamentoTexto === txt;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setOrcamentoTexto(txt)}
                        className={`h-9 px-3 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                          ativo
                            ? "bg-primary-light border-primary text-primary-hover"
                            : "bg-background border-border text-text-muted hover:text-text-main"
                        }`}
                      >
                        R$ {val}
                      </button>
                    );
                  })}
                </div>
              </div>

              {setorEditando && (
                <div className="bg-background border border-border rounded-xl p-3 flex items-center justify-between text-xs">
                  <span className="text-text-muted font-medium">
                    Gasto acumulado neste mês:
                  </span>
                  <span className="font-extrabold text-text-main">
                    {formatarMoeda(gastoPorSetor.get(setorEditando.id) || 0)}
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={salvando}
                className="w-full h-12 mt-1 rounded-btn bg-primary hover:bg-primary-hover text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                <span>
                  {salvando ? "Salvando..." : "Salvar orçamento do setor"}
                </span>
              </button>

              {setorEditando && (
                <div className="pt-2 border-t border-border mt-1">
                  {!confirmarExclusao ? (
                    <button
                      type="button"
                      onClick={() => setConfirmarExclusao(true)}
                      className="w-full h-11 rounded-xl text-xs font-bold text-text-muted hover:text-budget-red flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Excluir este setor</span>
                    </button>
                  ) : (
                    <div className="bg-budget-red-bg border border-budget-red/30 rounded-xl p-3 flex flex-col gap-2">
                      <p className="text-xs text-budget-red-text font-semibold">
                        Tem certeza que deseja excluir{" "}
                        <strong>
                          {setorEditando.emoji} {setorEditando.nome}
                        </strong>
                        ?
                        {(qtdProdutosPorSetor.get(setorEditando.id) || 0) >
                          0 && (
                          <span className="block mt-0.5 font-normal">
                            Os{" "}
                            {qtdProdutosPorSetor.get(setorEditando.id)}{" "}
                            produtos deste setor ficarão sem setor atribuído.
                          </span>
                        )}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmarExclusao(false)}
                          className="flex-1 h-10 rounded-xl bg-card border border-border text-xs font-bold text-text-main cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={excluindo}
                          onClick={handleExcluirSetor}
                          className="flex-1 h-10 rounded-xl bg-budget-red text-white text-xs font-bold cursor-pointer disabled:opacity-60"
                        >
                          {excluindo ? "Excluindo..." : "Sim, excluir"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
