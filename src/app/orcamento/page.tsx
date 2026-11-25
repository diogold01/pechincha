"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Check,
  Trash2,
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import SupabaseSetupGuide from "@/components/SupabaseSetupGuide";
import BottomNav from "@/components/BottomNav";
import BudgetAnalyticsDashboard, {
  type AvulsoItemResumo,
  type EvolucaoMesItem,
  type MercadoResumoItem,
  type PagamentoResumoItem,
  type SetorResumoItem,
  type TopProdutoItem,
  type VariacaoPrecoItem,
} from "@/components/BudgetAnalyticsDashboard";
import {
  carregarConfigIADoGrupo,
  ehProdutoInternoSistema,
  lerConfigIA,
  type ConfigIA,
} from "@/lib/ia-config";
import {
  formatarMoeda,
  parseDecimalBR,
  LIMITE_ORCAMENTO_ALERTA,
  LIMITE_ORCAMENTO_ESTOURO,
} from "@/lib/format";
import type {
  Cart,
  CartItem,
  CartPayment,
  Group,
  Market,
  Price,
  Product,
  Sector,
} from "@/lib/types";

const SUGESTOES_ORCAMENTO = [100, 150, 300, 500, 800];

const MESES_CURTOS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const MESES_COMPLETOS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function extrairAnoMesNoFuso(dataIso: string | Date, fuso: string): string {
  try {
    const dt = typeof dataIso === "string" ? new Date(dataIso) : dataIso;
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: fuso,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(dt);
    const ano = partes.find((p) => p.type === "year")?.value;
    const mes = partes.find((p) => p.type === "month")?.value;
    if (ano && mes) return `${ano}-${mes}`;
  } catch {}
  const d = typeof dataIso === "string" ? new Date(dataIso) : dataIso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function deslocarAnoMes(anoMes: string, deltaMeses: number): string {
  const [anoStr, mesStr] = anoMes.split("-");
  const d = new Date(Number(anoStr), Number(mesStr) - 1 + deltaMeses, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatarAnoMesCompleto(anoMes: string): string {
  const [anoStr, mesStr] = anoMes.split("-");
  const idx = Number(mesStr) - 1;
  return `${MESES_COMPLETOS[idx] || "Mês"} de ${anoStr}`;
}

export default function OrcamentoPage() {
  const router = useRouter();
  const configurado = isSupabaseConfigured();

  const [carregando, setCarregando] = useState(true);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<Group | null>(null);
  const [setores, setSetores] = useState<Sector[]>([]);
  const [produtos, setProdutos] = useState<Product[]>([]);
  const [mercados, setMercados] = useState<Market[]>([]);
  const [carrinhosFinalizados, setCarrinhosFinalizados] = useState<Cart[]>([]);
  const [todosItens, setTodosItens] = useState<CartItem[]>([]);
  const [todosPagamentos, setTodosPagamentos] = useState<CartPayment[]>([]);
  const [todosPrecos, setTodosPrecos] = useState<Price[]>([]);
  const [configIA, setConfigIA] = useState<ConfigIA>(() => lerConfigIA());

  // Controle do mês selecionado e do acordeão de metas por setor (recolhido por padrão)
  const [anoMesSelecionado, setAnoMesSelecionado] = useState<string>(() =>
    extrairAnoMesNoFuso(new Date(), "America/Cuiaba")
  );
  const [setoresExpandidos, setSetoresExpandidos] = useState(false);

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
        { data: mktData },
        { data: cartsData },
        { data: itemsData },
        { data: payData },
        { data: prcData },
      ] = await Promise.all([
        supabase.from("groups").select("*").eq("id", gId).single(),
        supabase
          .from("sectors")
          .select("*")
          .eq("group_id", gId)
          .order("ordem", { ascending: true })
          .order("nome", { ascending: true }),
        supabase.from("products").select("*").eq("group_id", gId),
        supabase.from("markets").select("*").eq("group_id", gId),
        supabase
          .from("carts")
          .select("*")
          .eq("group_id", gId)
          .eq("status", "finalizado"),
        supabase.from("cart_items").select("*").eq("group_id", gId),
        supabase.from("cart_payments").select("*").eq("group_id", gId),
        supabase
          .from("prices")
          .select("*")
          .eq("group_id", gId)
          .order("data", { ascending: false })
          .order("criado_em", { ascending: false })
          .limit(600),
      ]);

      const grp = (gData as Group) || null;
      setGrupo(grp);
      setSetores((secData as Sector[]) || []);
      setProdutos((prodData as Product[]) || []);
      setMercados((mktData as Market[]) || []);
      setCarrinhosFinalizados((cartsData as Cart[]) || []);
      setTodosItens((itemsData as CartItem[]) || []);
      setTodosPagamentos((payData as CartPayment[]) || []);
      setTodosPrecos((prcData as Price[]) || []);

      const cfgIA = await carregarConfigIADoGrupo(supabase, gId);
      setConfigIA(cfgIA);
    } catch {
      // Falha silenciosa de rede
    } finally {
      setCarregando(false);
    }
  }, [configurado, router]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const fuso = grupo?.fuso_horario || "America/Cuiaba";
  const anoMesAtual = useMemo(
    () => extrairAnoMesNoFuso(new Date(), fuso),
    [fuso]
  );
  const ehMesAtual = anoMesSelecionado === anoMesAtual;

  // Mapas auxiliares de produtos, setores e mercados
  const { mapaProdutos, qtdProdutosPorSetor, mapaMercados, mapaSetores } =
    useMemo(() => {
      const mProd = new Map<string, Product>();
      const mCont = new Map<string, number>();
      for (const p of produtos) {
        if (p.codigo_barras === "__config_ia_grupo__") continue;
        mProd.set(p.id, p);
        if (p.sector_id && !ehProdutoInternoSistema(p.codigo_barras)) {
          mCont.set(p.sector_id, (mCont.get(p.sector_id) || 0) + 1);
        }
      }
      const mMkt = new Map<string, Market>();
      for (const m of mercados) mMkt.set(m.id, m);

      const mSec = new Map<string, Sector>();
      for (const s of setores) mSec.set(s.id, s);

      return {
        mapaProdutos: mProd,
        qtdProdutosPorSetor: mCont,
        mapaMercados: mMkt,
        mapaSetores: mSec,
      };
    }, [produtos, mercados, setores]);

  // Cálculos completos do mês selecionado + histórico 6 meses + dashboards
  const analise = useMemo(() => {
    // 1. Mapeia cada carrinho finalizado para seu YYYY-MM no fuso do grupo
    const cartAnoMes = new Map<string, string>();
    const cartMap = new Map<string, Cart>();
    for (const c of carrinhosFinalizados) {
      cartAnoMes.set(c.id, extrairAnoMesNoFuso(c.finalizado_em || c.criado_em, fuso));
      cartMap.set(c.id, c);
    }

    // 2. Soma gasto por mês (para os últimos 6 meses a partir do mês selecionado)
    const gastoPorAnoMes = new Map<string, number>();
    const gastoPorSetorMes = new Map<string, number>();
    const gastoPorCarrinhoMes = new Map<string, number>();
    const mapaTopProdutos = new Map<string, TopProdutoItem>();
    const mapaAvulsos = new Map<string, AvulsoItemResumo>();
    let totalAvulsosMes = 0;

    for (const item of todosItens) {
      const am = cartAnoMes.get(item.cart_id);
      if (!am) continue;
      if (item.marcado === false) continue;

      const precoUnit =
        item.preco_real !== null && item.preco_real !== undefined
          ? Number(item.preco_real)
          : Number(item.preco_estimado || 0);
      const qtd = Number(item.quantidade || 0);
      const subtotal = precoUnit * qtd;
      if (subtotal <= 0) continue;

      gastoPorAnoMes.set(am, (gastoPorAnoMes.get(am) || 0) + subtotal);

      if (am !== anoMesSelecionado) continue;

      gastoPorCarrinhoMes.set(
        item.cart_id,
        (gastoPorCarrinhoMes.get(item.cart_id) || 0) + subtotal
      );

      const prod = item.product_id ? mapaProdutos.get(item.product_id) : undefined;
      const secId = item.sector_id_avulso || prod?.sector_id || "sem_setor";
      gastoPorSetorMes.set(secId, (gastoPorSetorMes.get(secId) || 0) + subtotal);

      const ehItemAvulso =
        !prod || ehProdutoInternoSistema(prod.codigo_barras);
      const setorProd = secId !== "sem_setor" ? mapaSetores.get(secId) : undefined;

      if (ehItemAvulso) {
        totalAvulsosMes += subtotal;
        const nomeAvulso =
          item.descricao_avulsa?.trim() || prod?.nome || "Gasto avulso";
        const chaveAv = nomeAvulso.toLowerCase();
        const atualAv = mapaAvulsos.get(chaveAv);
        if (atualAv) {
          atualAv.gastoTotal += subtotal;
          atualAv.ocorrencias += 1;
        } else {
          mapaAvulsos.set(chaveAv, {
            nome: nomeAvulso,
            emoji: setorProd?.emoji || "🧾",
            gastoTotal: subtotal,
            ocorrencias: 1,
          });
        }
      } else {
        const chaveProd = prod.id;
        const emojiProd = prod.emoji || setorProd?.emoji || "📦";
        const unidadeProd = prod.unidade || "un";

        const atualProd = mapaTopProdutos.get(chaveProd);
        if (atualProd) {
          atualProd.quantidadeTotal += qtd;
          atualProd.gastoTotal += subtotal;
          atualProd.ocorrencias += 1;
        } else {
          mapaTopProdutos.set(chaveProd, {
            nome: prod.nome,
            emoji: emojiProd,
            quantidadeTotal: qtd,
            unidade: unidadeProd,
            gastoTotal: subtotal,
            ocorrencias: 1,
          });
        }
      }
    }

    // 3. Totais e setores estourados
    let gastoTotalMes = 0;
    let orcamentoTotalMes = 0;
    let qtdSetoresEstourados = 0;

    for (const s of setores) {
      const gasto = gastoPorSetorMes.get(s.id) || 0;
      gastoTotalMes += gasto;
      if (s.orcamento_mensal !== null && Number(s.orcamento_mensal) > 0) {
        const orc = Number(s.orcamento_mensal);
        orcamentoTotalMes += orc;
        if (gasto / orc > LIMITE_ORCAMENTO_ESTOURO) {
          qtdSetoresEstourados += 1;
        }
      }
    }
    const gastoSemSetor = gastoPorSetorMes.get("sem_setor") || 0;
    gastoTotalMes += gastoSemSetor;

    const percentualTotal =
      orcamentoTotalMes > 0
        ? Math.round((gastoTotalMes / orcamentoTotalMes) * 100)
        : 0;

    // 4. Projeção do mês atual + KPIs (compras, ticket médio e média diária)
    let projecaoMes: number | null = null;
    const [anoSel, mesSel] = anoMesSelecionado.split("-").map(Number);
    const diasNoMesSel = new Date(anoSel, mesSel, 0).getDate();
    const diasBaseMedia = ehMesAtual
      ? Math.max(1, new Date().getDate())
      : diasNoMesSel;
    const gastoPorDia = gastoTotalMes > 0 ? gastoTotalMes / diasBaseMedia : 0;

    if (ehMesAtual && gastoTotalMes > 0) {
      const hoje = new Date();
      const diaAtual = Math.max(1, hoje.getDate());
      if (diaAtual >= 3 && diaAtual < diasNoMesSel) {
        projecaoMes = (gastoTotalMes / diaAtual) * diasNoMesSel;
      }
    }

    const qtdComprasMes = gastoPorCarrinhoMes.size;
    const ticketMedioMes =
      qtdComprasMes > 0 ? gastoTotalMes / qtdComprasMes : 0;

    // 5. Evolução dos últimos 6 meses até o mês selecionado
    const evolucao6Meses: EvolucaoMesItem[] = [];
    for (let i = -5; i <= 0; i++) {
      const am = deslocarAnoMes(anoMesSelecionado, i);
      const mesIdx = Number(am.split("-")[1]) - 1;
      evolucao6Meses.push({
        anoMes: am,
        labelCurto: MESES_CURTOS[mesIdx] || am,
        gasto: gastoPorAnoMes.get(am) || 0,
        atual: i === 0,
      });
    }

    // 6. Resumo de setores para a IA
    const setoresResumo: SetorResumoItem[] = setores
      .map((s) => {
        const gasto = gastoPorSetorMes.get(s.id) || 0;
        return {
          id: s.id,
          nome: s.nome,
          emoji: s.emoji,
          gasto,
          orcamento: s.orcamento_mensal ? Number(s.orcamento_mensal) : 0,
          percentualDoTotal:
            gastoTotalMes > 0 ? Math.round((gasto / gastoTotalMes) * 100) : 0,
        };
      })
      .filter((s) => s.gasto > 0 || s.orcamento > 0)
      .sort((a, b) => b.gasto - a.gasto);

    // 7. Top Produtos reais do mês + Avulsos separados
    const topProdutos = Array.from(mapaTopProdutos.values()).sort(
      (a, b) => b.gastoTotal - a.gastoTotal
    );
    const avulsosItens = Array.from(mapaAvulsos.values()).sort(
      (a, b) => b.gastoTotal - a.gastoTotal
    );

    // 8. Resumo por Mercado no mês
    const mapaMktGasto = new Map<string, { total: number; compras: number }>();
    for (const [cartId, totalCart] of gastoPorCarrinhoMes.entries()) {
      const c = cartMap.get(cartId);
      const nomeMkt =
        (c?.market_id ? mapaMercados.get(c.market_id)?.nome : null) ||
        "Sem mercado";
      const cur = mapaMktGasto.get(nomeMkt) || { total: 0, compras: 0 };
      cur.total += totalCart;
      cur.compras += 1;
      mapaMktGasto.set(nomeMkt, cur);
    }
    const mercadosResumo: MercadoResumoItem[] = Array.from(
      mapaMktGasto.entries()
    )
      .map(([nome, info]) => ({
        nome,
        gastoTotal: info.total,
        compras: info.compras,
        ticketMedio: info.compras > 0 ? info.total / info.compras : 0,
      }))
      .sort((a, b) => b.gastoTotal - a.gastoTotal);

    // 9. Resumo por Forma de Pagamento no mês
    const mapaPg = new Map<string, number>();
    let totalPagamentosMes = 0;
    for (const pg of todosPagamentos) {
      if (cartAnoMes.get(pg.cart_id) !== anoMesSelecionado) continue;
      const val = Number(pg.valor || 0);
      if (val <= 0) continue;
      mapaPg.set(pg.forma_pagamento, (mapaPg.get(pg.forma_pagamento) || 0) + val);
      totalPagamentosMes += val;
    }
    const pagamentosResumo: PagamentoResumoItem[] = Array.from(mapaPg.entries())
      .map(([forma, valor]) => ({
        forma,
        valor,
        percentual:
          totalPagamentosMes > 0
            ? Math.round((valor / totalPagamentosMes) * 100)
            : 0,
      }))
      .sort((a, b) => b.valor - a.valor);

    // 10. Inflação da Casa (último preço vs. média anterior do mesmo produto)
    const precosPorProd = new Map<string, Price[]>();
    for (const pr of todosPrecos) {
      if (pr.tipo === "atacado") continue;
      const arr = precosPorProd.get(pr.product_id) || [];
      arr.push(pr);
      precosPorProd.set(pr.product_id, arr);
    }

    const variacoes: VariacaoPrecoItem[] = [];
    for (const [prodId, lista] of precosPorProd.entries()) {
      if (lista.length < 2) continue;
      const prod = mapaProdutos.get(prodId);
      if (!prod || ehProdutoInternoSistema(prod.codigo_barras)) continue;

      const ultimo = Number(lista[0].valor);
      const anteriores = lista.slice(1, 6).map((x) => Number(x.valor));
      const mediaAnterior =
        anteriores.reduce((acc, v) => acc + v, 0) / anteriores.length;
      if (mediaAnterior <= 0) continue;

      const variacaoPct = Math.round(
        ((ultimo - mediaAnterior) / mediaAnterior) * 100
      );
      if (Math.abs(variacaoPct) < 5) continue;

      const sec = prod.sector_id ? mapaSetores.get(prod.sector_id) : undefined;
      variacoes.push({
        nome: prod.nome,
        emoji: prod.emoji || sec?.emoji || "📦",
        ultimoValor: ultimo,
        mediaAnterior,
        variacaoPct,
      });
    }

    const maisSubiram = variacoes
      .filter((v) => v.variacaoPct > 0)
      .sort((a, b) => b.variacaoPct - a.variacaoPct)
      .slice(0, 3);

    const maisCairam = variacoes
      .filter((v) => v.variacaoPct < 0)
      .sort((a, b) => a.variacaoPct - b.variacaoPct)
      .slice(0, 3);

    return {
      gastoPorSetorMes,
      gastoTotalMes,
      orcamentoTotalMes,
      percentualTotal,
      gastoSemSetor,
      qtdSetoresEstourados,
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
    };
  }, [
    carrinhosFinalizados,
    todosItens,
    todosPagamentos,
    todosPrecos,
    setores,
    mapaProdutos,
    mapaMercados,
    mapaSetores,
    anoMesSelecionado,
    ehMesAtual,
    fuso,
  ]);

  function obterCoresOrcamento(razao: number): {
    corBarra: string;
    corTexto: string;
  } {
    if (razao > LIMITE_ORCAMENTO_ESTOURO) {
      return { corBarra: "#D64545", corTexto: "#B3261E" };
    }
    if (razao >= LIMITE_ORCAMENTO_ALERTA) {
      return { corBarra: "#E8A200", corTexto: "#7A5000" };
    }
    return { corBarra: "#1F9D57", corTexto: "#14783F" };
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
          .select()
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
      setErroForm("Erro ao salvar. Tente novamente.");
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
      setSetores((antigos) => antigos.filter((s) => s.id !== setorEditando.id));
      setModalAberto(false);
    } catch {
      setErroForm("Erro ao excluir o setor.");
    } finally {
      setExcluindo(false);
    }
  }

  if (!configurado) {
    return <SupabaseSetupGuide />;
  }

  if (carregando) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-text-main pb-24 md:pl-64">
        <main className="flex-1 w-full max-w-md md:max-w-4xl lg:max-w-6xl mx-auto px-5 pt-5 flex flex-col gap-3">
          <div className="h-12 w-48 bg-border/70 rounded-xl animate-pulse" />
          <div className="h-36 w-full bg-border/70 rounded-[20px] animate-pulse" />
          <div className="h-44 w-full bg-border/70 rounded-[20px] animate-pulse" />
          <div className="h-44 w-full bg-border/70 rounded-[20px] animate-pulse" />
        </main>
        <BottomNav />
      </div>
    );
  }

  const mesAnoFormatado = formatarAnoMesCompleto(anoMesSelecionado);
  const razaoTotal =
    analise.orcamentoTotalMes > 0
      ? analise.gastoTotalMes / analise.orcamentoTotalMes
      : 0;
  const coresTotais = obterCoresOrcamento(razaoTotal);
  const larguraBarraTotal =
    analise.orcamentoTotalMes > 0
      ? Math.min(
          100,
          Math.round((analise.gastoTotalMes / analise.orcamentoTotalMes) * 100)
        )
      : 0;

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-main pb-24 md:pb-8 md:pl-64">
      <main className="flex-1 w-full max-w-md md:max-w-4xl lg:max-w-6xl mx-auto px-4 sm:px-5 md:px-8 pt-5 md:pt-8 flex flex-col gap-3.5">
        {/* Cabeçalho com seletor de mês + botão Novo Setor */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-xs text-text-muted font-semibold">
              <button
                type="button"
                onClick={() =>
                  setAnoMesSelecionado((prev) => deslocarAnoMes(prev, -1))
                }
                aria-label="Mês anterior"
                className="w-6 h-6 rounded-full hover:bg-card hover:text-text-main flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="truncate">{mesAnoFormatado}</span>
              <button
                type="button"
                disabled={ehMesAtual}
                onClick={() =>
                  setAnoMesSelecionado((prev) => deslocarAnoMes(prev, 1))
                }
                aria-label="Próximo mês"
                className="w-6 h-6 rounded-full hover:bg-card hover:text-text-main flex items-center justify-center transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <h1 className="m-0 text-[26px] font-extrabold leading-[1.15]">
              Orçamento
            </h1>
          </div>

          <button
            type="button"
            onClick={abrirModalNovoSetor}
            className="flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-sm transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.4]" />
            <span>Setor</span>
          </button>
        </div>

        {/* Card Principal: Gasto total do mês + Setinha para abrir/recolher Metas por Setor */}
        <div className="bg-card border border-border rounded-[20px] shadow-sm overflow-hidden">
          <div className="px-[18px] pt-4 pb-3.5">
            <div className="text-[13px] text-text-muted font-semibold">
              Gasto total do mês
            </div>
            <div className="flex items-baseline gap-2 mt-1 flex-wrap">
              <span className="text-[28px] sm:text-[30px] font-extrabold leading-none">
                {formatarMoeda(analise.gastoTotalMes)}
              </span>
              <span className="text-[13px] text-text-muted font-medium">
                {analise.orcamentoTotalMes > 0
                  ? `de ${formatarMoeda(analise.orcamentoTotalMes)}`
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
              {analise.orcamentoTotalMes <= 0 ? (
                <span>
                  Abra as metas por setor abaixo para definir seus limites
                </span>
              ) : analise.gastoTotalMes <= analise.orcamentoTotalMes ? (
                <span>
                  {analise.percentualTotal}% do orçamento · faltam{" "}
                  {formatarMoeda(
                    analise.orcamentoTotalMes - analise.gastoTotalMes
                  )}
                </span>
              ) : (
                <span
                  className="font-bold"
                  style={{ color: coresTotais.corTexto }}
                >
                  {analise.percentualTotal}% do orçamento · acima em{" "}
                  {formatarMoeda(
                    analise.gastoTotalMes - analise.orcamentoTotalMes
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Barra clicável com setinha para expandir/recolher as categorias e cotas */}
          <button
            type="button"
            onClick={() => setSetoresExpandidos((prev) => !prev)}
            aria-expanded={setoresExpandidos}
            className="w-full px-[18px] py-2.5 bg-background/60 hover:bg-background border-t border-border flex items-center justify-between gap-2 text-xs font-bold text-text-main transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate">
                {setoresExpandidos
                  ? "Ocultar metas por setor"
                  : `Ver metas por setor (${setores.length})`}
              </span>
              {!setoresExpandidos && analise.qtdSetoresEstourados > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-budget-red-bg text-budget-red-text text-[10px] font-extrabold shrink-0">
                  {analise.qtdSetoresEstourados}{" "}
                  {analise.qtdSetoresEstourados === 1
                    ? "estourado"
                    : "estourados"}
                </span>
              )}
            </div>
            <ChevronDown
              className={`w-4 h-4 text-text-muted shrink-0 transition-transform duration-200 ${
                setoresExpandidos ? "rotate-180 text-primary" : ""
              }`}
            />
          </button>
        </div>

        {/* Lista Expansível de Setores (para configurar limites/cotas como antes) */}
        {setoresExpandidos && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 animate-in fade-in duration-150">
            {setores.map((setor) => {
              const gasto = analise.gastoPorSetorMes.get(setor.id) || 0;
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
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold shrink-0">
                        {gasto > 0 && (
                          <span className="text-text-muted font-semibold">
                            {formatarMoeda(gasto)}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full bg-primary-light text-primary-hover">
                          Definir valor
                        </span>
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

            {analise.gastoSemSetor > 0 && (
              <div className="w-full text-left bg-card border border-dashed border-border rounded-[14px] px-[14px] py-[11px] flex flex-col gap-1">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-[14px] font-bold truncate">
                    🧾 Avulsos / Sem setor
                  </span>
                  <span className="text-[12px] font-extrabold text-text-main shrink-0">
                    {formatarMoeda(analise.gastoSemSetor)}
                  </span>
                </div>
                <p className="text-[11px] text-text-muted leading-snug">
                  Compras avulsas ou produtos sem setor definido (já somados no
                  gasto total do mês). Você pode atribuir um setor pelo
                  Histórico.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Dashboards e Assistente de IA */}
        <BudgetAnalyticsDashboard
          mesLabel={mesAnoFormatado}
          ehMesAtual={ehMesAtual}
          gastoTotalMes={analise.gastoTotalMes}
          orcamentoTotalMes={analise.orcamentoTotalMes}
          projecaoMes={analise.projecaoMes}
          qtdComprasMes={analise.qtdComprasMes}
          ticketMedioMes={analise.ticketMedioMes}
          gastoPorDia={analise.gastoPorDia}
          evolucao6Meses={analise.evolucao6Meses}
          setoresResumo={analise.setoresResumo}
          topProdutos={analise.topProdutos}
          avulsosItens={analise.avulsosItens}
          totalAvulsosMes={analise.totalAvulsosMes}
          mercadosResumo={analise.mercadosResumo}
          pagamentosResumo={analise.pagamentosResumo}
          maisSubiram={analise.maisSubiram}
          maisCairam={analise.maisCairam}
          configIA={configIA}
        />
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
                    {formatarMoeda(
                      analise.gastoPorSetorMes.get(setorEditando.id) || 0
                    )}
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={salvando}
                className="w-full h-12 mt-1 rounded-full bg-primary hover:bg-primary-hover text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
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
