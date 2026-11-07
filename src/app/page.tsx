"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  UserPlus,
  Copy,
  Check,
  LogOut,
  Trash2,
  Plus,
  ArrowRight,
} from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import SupabaseSetupGuide from "@/components/SupabaseSetupGuide";
import GroupOnboarding from "@/components/GroupOnboarding";
import BottomNav from "@/components/BottomNav";
import { repetirCarrinhoNoBanco } from "@/lib/cart-actions";
import {
  formatarDataCurtaBR,
  formatarMoeda,
  pertenceAoMesAtualNoFuso,
  LIMITE_ORCAMENTO_ALERTA,
  LIMITE_ORCAMENTO_ESTOURO,
} from "@/lib/format";
import type {
  Cart,
  CartItem,
  Group,
  GroupInvite,
  GroupMember,
  Market,
  Product,
  Sector,
} from "@/lib/types";

interface ResumoCarrinhoFinalizado {
  cart: Cart;
  dataCurta: string;
  qtdItens: number;
  total: number;
}

export default function HomePage() {
  const router = useRouter();
  const configurado = isSupabaseConfigured();

  const [carregando, setCarregando] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [grupo, setGrupo] = useState<Group | null>(null);
  const [membros, setMembros] = useState<GroupMember[]>([]);
  const [convites, setConvites] = useState<GroupInvite[]>([]);
  const [setores, setSetores] = useState<Sector[]>([]);
  const [mercados, setMercados] = useState<Market[]>([]);
  const [gastoPorSetor, setGastoPorSetor] = useState<Map<string, number>>(
    new Map()
  );
  const [carrinhoAtivo, setCarrinhoAtivo] = useState<Cart | null>(null);
  const [qtdItensAtivo, setQtdItensAtivo] = useState<number>(0);
  const [qtdMarcadosAtivo, setQtdMarcadosAtivo] = useState<number>(0);
  const [ultimosCarrinhos, setUltimosCarrinhos] = useState<
    ResumoCarrinhoFinalizado[]
  >([]);
  const [copiandoCartId, setCopiandoCartId] = useState<string | null>(null);

  const [gerandoConvite, setGerandoConvite] = useState(false);
  const [copiadoTexto, setCopiadoTexto] = useState<string | null>(null);
  const [erroConvite, setErroConvite] = useState<string | null>(null);

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

      setUserId(user.id);
      setUserEmail(user.email || "");
      setUserName(
        (user.user_metadata?.nome as string) ||
          user.email?.split("@")[0] ||
          "Usuário"
      );

      // Busca o vínculo de grupo do usuário
      const { data: memberRows } = await supabase
        .from("group_members")
        .select("*")
        .eq("user_id", user.id)
        .limit(1);

      if (!memberRows || memberRows.length === 0) {
        setGrupo(null);
        setCarregando(false);
        return;
      }

      const groupId = memberRows[0].group_id;

      // Carrega dados do grupo, membros, convites pendentes, setores e compras em paralelo
      const [
        { data: groupData },
        { data: allMembers },
        { data: invitesData },
        { data: sectorsData },
        { data: marketsData },
        { data: activeCartsData },
        { data: finishedCartsData },
        { data: prodsData },
        { data: allCartItemsData },
      ] = await Promise.all([
        supabase.from("groups").select("*").eq("id", groupId).single(),
        supabase
          .from("group_members")
          .select("*")
          .eq("group_id", groupId)
          .order("criado_em", { ascending: true }),
        supabase
          .from("group_invites")
          .select("*")
          .eq("group_id", groupId)
          .is("usado_em", null)
          .order("criado_em", { ascending: false }),
        supabase
          .from("sectors")
          .select("*")
          .eq("group_id", groupId)
          .order("ordem", { ascending: true }),
        supabase.from("markets").select("*").eq("group_id", groupId),
        supabase
          .from("carts")
          .select("*")
          .eq("group_id", groupId)
          .in("status", ["planejado", "em_compra"])
          .order("criado_em", { ascending: false })
          .limit(1),
        supabase
          .from("carts")
          .select("*")
          .eq("group_id", groupId)
          .eq("status", "finalizado")
          .order("finalizado_em", { ascending: false })
          .order("criado_em", { ascending: false }),
        supabase.from("products").select("id, sector_id").eq("group_id", groupId),
        supabase.from("cart_items").select("*").eq("group_id", groupId),
      ]);

      const grp = (groupData as Group) || null;
      setGrupo(grp);
      setMembros((allMembers as GroupMember[]) || []);
      setConvites((invitesData as GroupInvite[]) || []);
      setSetores((sectorsData as Sector[]) || []);
      setMercados((marketsData as Market[]) || []);

      const todosItens = (allCartItemsData as CartItem[]) || [];
      const ativo = (activeCartsData as Cart[])?.[0] || null;
      setCarrinhoAtivo(ativo);
      if (ativo) {
        const itensAtivo = todosItens.filter((i) => i.cart_id === ativo.id);
        setQtdItensAtivo(itensAtivo.length);
        setQtdMarcadosAtivo(itensAtivo.filter((i) => i.marcado).length);
      } else {
        setQtdItensAtivo(0);
        setQtdMarcadosAtivo(0);
      }

      const listaFinalizados = (finishedCartsData as Cart[]) || [];

      // Monta os últimos carrinhos finalizados para o atalho "Repetir" na tela inicial
      const resumosRecentes: ResumoCarrinhoFinalizado[] = listaFinalizados
        .slice(0, 4)
        .map((c) => {
          const itensDoC = todosItens.filter(
            (i) => i.cart_id === c.id && i.marcado !== false
          );
          let soma = 0;
          for (const item of itensDoC) {
            const unit =
              item.preco_real !== null && item.preco_real !== undefined
                ? Number(item.preco_real)
                : Number(item.preco_estimado || 0);
            soma += unit * Number(item.quantidade || 0);
          }
          return {
            cart: c,
            dataCurta: formatarDataCurtaBR(
              c.finalizado_em || c.data_planejada || c.criado_em
            ),
            qtdItens: itensDoC.length,
            total: soma,
          };
        });
      setUltimosCarrinhos(resumosRecentes);

      // Calcula gastos do mês atual por setor para o card de Orçamento da tela inicial
      const fuso = grp?.fuso_horario || "America/Cuiaba";
      const idsFinalizadosMes = new Set(
        listaFinalizados
          .filter((c) =>
            pertenceAoMesAtualNoFuso(c.finalizado_em || c.criado_em, fuso)
          )
          .map((c) => c.id)
      );

      const mapaProdSetor = new Map<string, string | null>();
      for (const p of (prodsData as Pick<Product, "id" | "sector_id">[]) || []) {
        mapaProdSetor.set(p.id, p.sector_id);
      }

      const mapaGasto = new Map<string, number>();
      for (const item of todosItens) {
        if (!idsFinalizadosMes.has(item.cart_id)) continue;
        if (item.marcado === false) continue;
        const secId = mapaProdSetor.get(item.product_id);
        if (!secId) continue;
        const unit =
          item.preco_real !== null && item.preco_real !== undefined
            ? Number(item.preco_real)
            : Number(item.preco_estimado || 0);
        mapaGasto.set(
          secId,
          (mapaGasto.get(secId) || 0) + unit * Number(item.quantidade || 0)
        );
      }
      setGastoPorSetor(mapaGasto);
    } catch {
      // Silencioso em caso de falha de rede
    } finally {
      setCarregando(false);
    }
  }, [configurado, router]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Sincronização ao vivo (Supabase Realtime) para atualizar a tela inicial quando o parceiro mexer no carrinho
  useEffect(() => {
    if (!configurado || !grupo?.id) return;
    const supabase = createClient();
    const canal = supabase
      .channel(`home-realtime-${grupo.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "carts",
          filter: `group_id=eq.${grupo.id}`,
        },
        () => {
          carregarDados();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cart_items",
          filter: `group_id=eq.${grupo.id}`,
        },
        () => {
          carregarDados();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [configurado, grupo?.id, carregarDados]);

  async function handleRepetirCarrinho(cartId: string) {
    if (!grupo || copiandoCartId) return;
    setCopiandoCartId(cartId);
    try {
      const { novoCartId } = await repetirCarrinhoNoBanco({
        groupId: grupo.id,
        userId,
        cartOrigemId: cartId,
      });
      router.push(`/compra?id=${novoCartId}`);
    } catch {
      setCopiandoCartId(null);
    }
  }

  if (!configurado) {
    return <SupabaseSetupGuide />;
  }

  if (carregando) {
    return (
      <main className="flex-1 flex flex-col items-center p-5 bg-background">
        <div className="w-full max-w-md flex flex-col gap-4">
          <div className="h-12 w-48 bg-border/70 rounded-xl animate-pulse" />
          <div className="h-44 w-full bg-border/70 rounded-card animate-pulse" />
          <div className="h-56 w-full bg-border/70 rounded-card animate-pulse" />
        </div>
      </main>
    );
  }

  if (!grupo) {
    return (
      <GroupOnboarding
        userEmail={userEmail}
        userName={userName}
        onGroupReady={carregarDados}
      />
    );
  }

  async function handleGerarConvite() {
    if (!grupo) return;
    setErroConvite(null);
    setGerandoConvite(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("generate_group_invite", {
        p_group_id: grupo.id,
        p_email: null,
      });

      if (error) {
        setErroConvite(error.message);
        return;
      }

      await carregarDados();
    } catch {
      setErroConvite("Não foi possível gerar o convite.");
    } finally {
      setGerandoConvite(false);
    }
  }

  async function handleExcluirConvite(id: string) {
    const supabase = createClient();
    await supabase.from("group_invites").delete().eq("id", id);
    await carregarDados();
  }

  async function copiarParaAreaDeTransferencia(texto: string, tipo: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoTexto(tipo);
      setTimeout(() => setCopiadoTexto(null), 2500);
    } catch {
      // Fallback simples
    }
  }

  async function handleSair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // Formata o mês atual usando o fuso horário configurado no grupo
  let mesAnoFormatado = "";
  let nomeMesMinusculo = "mês";
  try {
    const fuso = grupo.fuso_horario || "America/Cuiaba";
    const formatador = new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: fuso,
    });
    const texto = formatador.format(new Date());
    mesAnoFormatado = texto.charAt(0).toUpperCase() + texto.slice(1);
    nomeMesMinusculo = new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      timeZone: fuso,
    })
      .format(new Date())
      .toLowerCase();
  } catch {
    mesAnoFormatado = "Mês atual";
  }

  // Totais e alertas de orçamento do mês para o Card do Mês (1-inicio.html)
  let gastoTotalMes = 0;
  let orcamentoTotalMes = 0;
  const setoresEmAlerta: {
    id: string;
    nomeCurto: string;
    percentual: number;
    estourou: boolean;
  }[] = [];

  for (const s of setores) {
    const gasto = gastoPorSetor.get(s.id) || 0;
    gastoTotalMes += gasto;
    const orc = s.orcamento_mensal !== null ? Number(s.orcamento_mensal) : 0;
    if (orc > 0) {
      orcamentoTotalMes += orc;
      const razao = gasto / orc;
      if (razao >= LIMITE_ORCAMENTO_ALERTA) {
        setoresEmAlerta.push({
          id: s.id,
          nomeCurto: s.nome.split(" ")[0],
          percentual: Math.round(razao * 100),
          estourou: razao > LIMITE_ORCAMENTO_ESTOURO,
        });
      }
    }
  }

  setoresEmAlerta.sort((a, b) => b.percentual - a.percentual);

  const razaoTotalMes =
    orcamentoTotalMes > 0 ? gastoTotalMes / orcamentoTotalMes : 0;
  const percentualTotalMes =
    orcamentoTotalMes > 0 ? Math.round(razaoTotalMes * 100) : 0;
  const larguraBarraMes =
    orcamentoTotalMes > 0
      ? Math.min(100, Math.max(gastoTotalMes > 0 ? 2 : 0, percentualTotalMes))
      : 0;
  const corBarraMes =
    razaoTotalMes > LIMITE_ORCAMENTO_ESTOURO
      ? "#D64545"
      : razaoTotalMes >= LIMITE_ORCAMENTO_ALERTA
        ? "#E8A200"
        : "#1F9D57";

  const conviteAtivo = convites[0] || null;
  const linkConvite =
    typeof window !== "undefined" && conviteAtivo
      ? `${window.location.origin}/convite/${conviteAtivo.codigo}`
      : "";

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-main pb-24 md:pb-8 md:pl-64">
      <main className="flex-1 w-full max-w-md md:max-w-5xl lg:max-w-6xl mx-auto px-5 md:px-8 pt-5 md:pt-8 flex flex-col gap-5">
        {/* Topo conforme referência 1-inicio.html */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[13px] text-text-muted font-medium">
              {mesAnoFormatado} · {grupo.nome}
            </div>
            <h1 className="text-[28px] md:text-[32px] font-extrabold leading-tight">
              Início
            </h1>
          </div>
          <button
            type="button"
            onClick={handleSair}
            title="Sair da conta"
            className="h-11 px-3.5 rounded-full bg-card border border-border flex items-center gap-1.5 text-xs font-bold text-text-muted hover:text-text-main cursor-pointer shadow-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair</span>
          </button>
        </div>

        {/* Grade Responsiva: 1 coluna no celular, 2 colunas amplas no desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* COLUNA ESQUERDA (Desktop: 7 colunas) — Visão Financeira e Ação Rápida */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* Card do Mês (Gasto × Orçamento + Chips de Setores em Alerta) conforme 1-inicio.html */}
            <Link
              href="/orcamento"
              className="block bg-card border border-border rounded-[20px] px-5 py-4 hover:border-primary/50 transition-colors shadow-sm"
            >
              <div className="text-[13px] text-text-muted font-semibold">
                Gasto em {nomeMesMinusculo}
              </div>
              <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                <span className="text-[32px] font-extrabold leading-none">
                  {formatarMoeda(gastoTotalMes)}
                </span>
                <span className="text-[14px] text-text-muted font-medium">
                  {orcamentoTotalMes > 0
                    ? `de ${formatarMoeda(orcamentoTotalMes)}`
                    : "toque para definir o orçamento"}
                </span>
              </div>

              <div className="h-[10px] rounded-[5px] bg-border mt-2.5 overflow-hidden">
                <div
                  className="h-full rounded-[5px] transition-all duration-300"
                  style={{
                    width: `${larguraBarraMes}%`,
                    backgroundColor: corBarraMes,
                  }}
                />
              </div>

              <div className="text-[12px] text-text-muted mt-2">
                {orcamentoTotalMes <= 0 ? (
                  <span>Toque aqui para configurar os limites por setor</span>
                ) : gastoTotalMes <= orcamentoTotalMes ? (
                  <span>
                    {percentualTotalMes}% do orçamento · faltam{" "}
                    {formatarMoeda(orcamentoTotalMes - gastoTotalMes)}
                  </span>
                ) : (
                  <span className="font-bold text-budget-red-text">
                    {percentualTotalMes}% do orçamento · acima em{" "}
                    {formatarMoeda(gastoTotalMes - orcamentoTotalMes)}
                  </span>
                )}
              </div>

              {setoresEmAlerta.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {setoresEmAlerta.map((alerta) => (
                    <span
                      key={alerta.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12px] font-bold"
                      style={{
                        backgroundColor: alerta.estourou
                          ? "#FCEBEA"
                          : "#FFF3D6",
                        color: alerta.estourou ? "#B3261E" : "#7A5000",
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: alerta.estourou
                            ? "#D64545"
                            : "#E8A200",
                        }}
                      />
                      <span>
                        {alerta.nomeCurto} {alerta.percentual}%
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </Link>

            {/* Card Continuar Compra (quando houver uma planejada ou em andamento) */}
            {carrinhoAtivo && (
              <Link
                href={`/compra?id=${carrinhoAtivo.id}`}
                className="block bg-primary text-white rounded-[20px] px-5 py-4 shadow-sm hover:bg-primary-hover transition-colors"
              >
                <div className="text-xs font-semibold text-primary-soft">
                  {carrinhoAtivo.status === "em_compra"
                    ? "Compra em andamento"
                    : "Carrinho em planejamento"}
                </div>
                <div className="text-[20px] font-extrabold mt-1">
                  {carrinhoAtivo.nome}
                </div>
                <div className="text-[13px] text-primary-soft mt-0.5">
                  {carrinhoAtivo.market_id
                    ? `${
                        mercados.find((m) => m.id === carrinhoAtivo.market_id)
                          ?.nome || "Mercado"
                      } · `
                    : ""}
                  {carrinhoAtivo.status === "em_compra"
                    ? `${qtdMarcadosAtivo} de ${qtdItensAtivo} ${
                        qtdItensAtivo === 1 ? "item" : "itens"
                      }`
                    : `${qtdItensAtivo} ${
                        qtdItensAtivo === 1 ? "item" : "itens"
                      } na lista`}
                </div>
                {qtdItensAtivo > 0 && (
                  <div className="h-[6px] rounded-[3px] bg-white/25 mt-2.5 overflow-hidden">
                    <div
                      className="h-full bg-white transition-all duration-300"
                      style={{
                        width: `${
                          carrinhoAtivo.status === "em_compra"
                            ? Math.round((qtdMarcadosAtivo / qtdItensAtivo) * 100)
                            : 100
                        }%`,
                      }}
                    />
                  </div>
                )}
                <div className="mt-3.5 h-12 rounded-btn bg-white text-primary font-extrabold text-[15px] flex items-center justify-center gap-2">
                  <span>Continuar compra</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </Link>
            )}

            {/* Botão Nova Compra conforme 1-inicio.html */}
            <Link
              href="/compra?nova=1"
              className="h-12 rounded-btn border-2 border-primary text-primary font-bold text-[15px] bg-card hover:bg-primary-light/40 flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Nova compra</span>
            </Link>
          </div>

          {/* COLUNA DIREITA (Desktop: 5 colunas) — Últimos Carrinhos e Gestão do Grupo */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Últimos carrinhos com botão "Repetir" (fiel a 1-inicio.html) */}
            <div className="bg-card border border-border rounded-card p-4 sm:p-5 flex flex-col gap-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-extrabold">Últimos carrinhos</h2>
                <Link
                  href="/historico"
                  className="text-xs font-bold text-primary hover:underline"
                >
                  Ver histórico
                </Link>
              </div>

              {ultimosCarrinhos.length === 0 ? (
                <div className="bg-background border border-border rounded-[16px] px-3.5 py-3 text-xs text-text-muted">
                  Suas compras finalizadas aparecerão aqui para você repetir a lista
                  com 1 toque.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {ultimosCarrinhos.map((resumo) => {
                    const copiando = copiandoCartId === resumo.cart.id;
                    return (
                      <div
                        key={resumo.cart.id}
                        className="flex items-center gap-3 bg-background border border-border/80 rounded-[16px] px-3.5 py-2.5"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-bold truncate">
                            {resumo.cart.nome}
                          </div>
                          <div className="text-[12px] text-text-muted">
                            {resumo.dataCurta} · {resumo.qtdItens}{" "}
                            {resumo.qtdItens === 1 ? "item" : "itens"} ·{" "}
                            {formatarMoeda(resumo.total)}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={copiando}
                          onClick={() => handleRepetirCarrinho(resumo.cart.id)}
                          aria-label={`Repetir ${resumo.cart.nome}`}
                          className="h-10 px-3.5 rounded-full bg-primary-light text-primary-hover text-[12px] font-bold flex items-center justify-center shrink-0 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60"
                        >
                          {copiando ? "Copiando..." : "Repetir"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Card de Grupo e Convite para a segunda pessoa (Etapa 2) */}
            <section className="bg-card border border-border rounded-card p-4 sm:p-5 flex flex-col gap-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold leading-snug">
                      {grupo.nome}
                    </h2>
                    <p className="text-xs text-text-muted">
                      {membros.length}{" "}
                      {membros.length === 1
                        ? "pessoa no grupo"
                        : "pessoas compartilhando"}
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-primary-light text-primary-hover text-[11px] font-bold">
                  {grupo.fuso_horario}
                </span>
              </div>

              {/* Lista de membros atuais */}
              <div className="flex flex-wrap gap-2 pt-1">
                {membros.map((m, idx) => (
                  <div
                    key={m.user_id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background border border-border text-xs font-bold"
                  >
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    <span>
                      {m.nome_exibicao || `Membro ${idx + 1}`}{" "}
                      {m.papel === "admin" ? "(Criador)" : ""}
                    </span>
                  </div>
                ))}
              </div>

              {erroConvite && (
                <div className="text-xs font-semibold text-budget-red-text bg-budget-red-bg px-3 py-2 rounded-xl">
                  {erroConvite}
                </div>
              )}

              {/* Convite ativo ou botão de gerar convite */}
              {conviteAtivo ? (
                <div className="bg-background border border-border rounded-2xl p-3.5 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text-muted">
                      Convite ativo para a 2ª pessoa:
                    </span>
                    <button
                      type="button"
                      onClick={() => handleExcluirConvite(conviteAtivo.id)}
                      className="text-xs text-text-muted hover:text-budget-red flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Cancelar</span>
                    </button>
                  </div>

                  <div className="text-xl font-extrabold tracking-widest text-primary">
                    {conviteAtivo.codigo}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        copiarParaAreaDeTransferencia(
                          conviteAtivo.codigo,
                          "codigo"
                        )
                      }
                      className="h-11 rounded-xl bg-card border border-border font-bold text-xs text-text-main flex items-center justify-center gap-1.5 hover:border-primary cursor-pointer"
                    >
                      {copiadoTexto === "codigo" ? (
                        <>
                          <Check className="w-4 h-4 text-primary" />
                          <span>Código copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 text-text-muted" />
                          <span>Copiar código</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        copiarParaAreaDeTransferencia(linkConvite, "link")
                      }
                      className="h-11 rounded-xl bg-primary text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-primary-hover cursor-pointer"
                    >
                      {copiadoTexto === "link" ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Link copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copiar link</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-text-muted leading-snug">
                    Envie o link ou o código no WhatsApp. O convite é de uso único.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGerarConvite}
                  disabled={gerandoConvite}
                  className="h-12 rounded-btn border-2 border-primary text-primary font-bold text-sm bg-card hover:bg-primary-light/50 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>
                    {gerandoConvite
                      ? "Gerando código..."
                      : "Convidar segunda pessoa para o grupo"}
                  </span>
                </button>
              )}
            </section>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
