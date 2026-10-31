"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ShoppingCart,
  Plus,
  Minus,
  Search,
  Store,
  ChevronDown,
  Trash2,
  X,
  Check,
  AlertCircle,
  Tag,
  ArrowRight,
  Pencil,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BottomNav from "@/components/BottomNav";
import FrequentProductsBar from "@/components/FrequentProductsBar";
import LiveMarketMode from "@/components/LiveMarketMode";
import {
  lerSnapshotModoMercado,
  processarFilaOffline,
  salvarSnapshotModoMercado,
} from "@/lib/offline-sync";
import {
  LIMITE_ORCAMENTO_ALERTA,
  LIMITE_ORCAMENTO_ESTOURO,
  calcularEstimativaItemCarrinho,
  dataHojeISO,
  formatarMoeda,
  parseDecimalBR,
  pertenceAoMesAtualNoFuso,
} from "@/lib/format";
import type {
  Cart,
  CartItem,
  Group,
  GroupSettings,
  Market,
  MarketSectorOrder,
  Price,
  Product,
  Sector,
} from "@/lib/types";

// Seção 6: "Implementar de forma fácil de remover (eu quero ver funcionando antes de decidir se gosto)"
// Para ocultar a barra "Costumo comprar", basta mudar para false:
const EXIBIR_COSTUMO_COMPRAR = true;

const UNIDADES_RAPIDAS = ["un", "kg", "g", "L", "ml", "pacote", "cx", "dz"];

function CompraPlanejamentoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const abrirNovoParam = searchParams.get("nova") === "1";
  const cartIdParam = searchParams.get("id");

  const [carregando, setCarregando] = useState(true);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [grupo, setGrupo] = useState<Group | null>(null);
  const [settings, setSettings] = useState<GroupSettings | null>(null);
  const [mercados, setMercados] = useState<Market[]>([]);
  const [setores, setSetores] = useState<Sector[]>([]);
  const [ordemSetoresMercado, setOrdemSetoresMercado] = useState<
    MarketSectorOrder[]
  >([]);
  const [produtos, setProdutos] = useState<Product[]>([]);
  const [precos, setPrecos] = useState<Price[]>([]);

  const [carrinhosAtivos, setCarrinhosAtivos] = useState<Cart[]>([]);
  const [carrinhoAtualId, setCarrinhoAtualId] = useState<string | null>(null);
  const [itensCarrinho, setItensCarrinho] = useState<CartItem[]>([]);

  // Gasto já finalizado no mês por setor (sector_id -> valor total)
  const [gastoMesPorSetor, setGastoMesPorSetor] = useState<Map<string, number>>(
    new Map()
  );
  // Frequência de produtos nos últimos 3 meses (product_id -> contagem)
  const [frequenciaProdutos, setFrequenciaProdutos] = useState<
    Map<string, number>
  >(new Map());

  // Busca para adicionar item ao carrinho
  const [buscaProduto, setBuscaProduto] = useState("");

  // Bottom sheet: Novo Carrinho / Editar Nome e Mercado do Carrinho
  const [sheetCarrinhoAberto, setSheetCarrinhoAberto] = useState(false);
  const [modoSheetCarrinho, setModoSheetCarrinho] = useState<"novo" | "editar">(
    "novo"
  );
  const [nomeCarrinhoForm, setNomeCarrinhoForm] = useState("Compra da semana");
  const [mercadoCarrinhoFormId, setMercadoCarrinhoFormId] = useState("");

  // Bottom sheet: Editar Item do Carrinho (quantidade exata, marca, preço estimado manual)
  const [itemEditando, setItemEditando] = useState<CartItem | null>(null);
  const [qtdItemForm, setQtdItemForm] = useState("1");
  const [marcaItemForm, setMarcaItemForm] = useState("");
  const [precoManualForm, setPrecoManualForm] = useState("");

  // Bottom sheet: Cadastro Rápido de Produto que não existe
  const [sheetNovoProdRapido, setSheetNovoProdRapido] = useState(false);
  const [nomeProdRapido, setNomeProdRapido] = useState("");
  const [setorProdRapidoId, setSetorProdRapidoId] = useState("");
  const [unidadeProdRapido, setUnidadeProdRapido] = useState("un");
  const [emojiProdRapido, setEmojiProdRapido] = useState("");
  const [precoProdRapido, setPrecoProdRapido] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [forcarPlanejamento, setForcarPlanejamento] = useState(false);
  const [aoVivoConectado, setAoVivoConectado] = useState(false);
  const [pulsoRealtime, setPulsoRealtime] = useState(false);

  const carregarDados = useCallback(
    async (preferCartId?: string | null) => {
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
          { data: stData },
          { data: mktData },
          { data: secData },
          { data: ordData },
          { data: prodData },
          { data: prcData },
          { data: allCartsData },
        ] = await Promise.all([
          supabase.from("groups").select("*").eq("id", gId).single(),
          supabase
            .from("group_settings")
            .select("*")
            .eq("group_id", gId)
            .single(),
          supabase
            .from("markets")
            .select("*")
            .eq("group_id", gId)
            .order("padrao", { ascending: false })
            .order("nome", { ascending: true }),
          supabase
            .from("sectors")
            .select("*")
            .eq("group_id", gId)
            .order("ordem", { ascending: true }),
          supabase
            .from("market_sector_order")
            .select("*")
            .eq("group_id", gId),
          supabase
            .from("products")
            .select("*")
            .eq("group_id", gId)
            .eq("ativo", true)
            .order("nome", { ascending: true }),
          supabase
            .from("prices")
            .select("*")
            .eq("group_id", gId)
            .order("data", { ascending: false })
            .order("criado_em", { ascending: false }),
          supabase
            .from("carts")
            .select("*")
            .eq("group_id", gId)
            .order("criado_em", { ascending: false }),
        ]);

        const grp = (gData as Group) || null;
        const st = (stData as GroupSettings) || null;
        const mkts = (mktData as Market[]) || [];
        const secs = (secData as Sector[]) || [];
        const prods = (prodData as Product[]) || [];
        const prcs = (prcData as Price[]) || [];
        const todosCarrinhos = (allCartsData as Cart[]) || [];

        setGrupo(grp);
        setSettings(st);
        setMercados(mkts);
        setSetores(secs);
        setOrdemSetoresMercado((ordData as MarketSectorOrder[]) || []);
        setProdutos(prods);
        setPrecos(prcs);

        // Separa carrinhos ativos (planejado ou em_compra)
        const ativos = todosCarrinhos.filter(
          (c) => c.status === "planejado" || c.status === "em_compra"
        );
        setCarrinhosAtivos(ativos);

        // Calcula gastos dos carrinhos finalizados no mês atual (no fuso do grupo)
        // e frequência dos últimos 3 meses
        const fuso = grp?.fuso_horario || "America/Cuiaba";
        const idsFinalizadosMes = new Set(
          todosCarrinhos
            .filter(
              (c) =>
                c.status === "finalizado" &&
                pertenceAoMesAtualNoFuso(c.finalizado_em || c.criado_em, fuso)
            )
            .map((c) => c.id)
        );

        const limite3Meses = new Date();
        limite3Meses.setMonth(limite3Meses.getMonth() - 3);
        const idsUltimos3Meses = new Set(
          todosCarrinhos
            .filter((c) => new Date(c.criado_em) >= limite3Meses)
            .map((c) => c.id)
        );

        // Busca todos os cart_items do grupo para estatísticas de orçamento do mês e frequência
        const { data: todosItensGrupo } = await supabase
          .from("cart_items")
          .select("*")
          .eq("group_id", gId);

        const listaTodosItens = (todosItensGrupo as CartItem[]) || [];
        const mapaProdSetor = new Map<string, string | null>();
        prods.forEach((p) => mapaProdSetor.set(p.id, p.sector_id));

        const mapaGastoMes = new Map<string, number>();
        const mapaFreq = new Map<string, number>();

        listaTodosItens.forEach((item) => {
          if (idsUltimos3Meses.has(item.cart_id)) {
            mapaFreq.set(
              item.product_id,
              (mapaFreq.get(item.product_id) || 0) + 1
            );
          }

          if (idsFinalizadosMes.has(item.cart_id)) {
            const secId = mapaProdSetor.get(item.product_id);
            if (secId) {
              const precoUsado =
                item.preco_real !== null
                  ? Number(item.preco_real)
                  : Number(item.preco_estimado || 0);
              const subtotal = precoUsado * Number(item.quantidade);
              mapaGastoMes.set(secId, (mapaGastoMes.get(secId) || 0) + subtotal);
            }
          }
        });

        setGastoMesPorSetor(mapaGastoMes);
        setFrequenciaProdutos(mapaFreq);

        // Define qual carrinho exibir
        const idEscolhido =
          preferCartId ||
          cartIdParam ||
          carrinhoAtualId ||
          ativos[0]?.id ||
          null;

        let cartIdFinal: string | null = null;
        let itensFinais: CartItem[] = [];

        if (idEscolhido && ativos.some((c) => c.id === idEscolhido)) {
          cartIdFinal = idEscolhido;
          itensFinais = listaTodosItens
            .filter((i) => i.cart_id === idEscolhido)
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
        } else if (ativos.length > 0) {
          cartIdFinal = ativos[0].id;
          itensFinais = listaTodosItens
            .filter((i) => i.cart_id === ativos[0].id)
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
        }

        setCarrinhoAtualId(cartIdFinal);
        setItensCarrinho(itensFinais);

        // Salva cópia local resiliente (IndexedDB + localStorage) para o Modo Mercado funcionar sem sinal (Seção 9)
        await salvarSnapshotModoMercado({
          groupId: gId,
          userId: user.id,
          grupo: grp,
          settings: st,
          mercados: mkts,
          setores: secs,
          ordemSetoresMercado: (ordData as MarketSectorOrder[]) || [],
          produtos: prods,
          precos: prcs,
          carrinhosAtivos: ativos,
          carrinhoAtualId: cartIdFinal,
          itensCarrinho: itensFinais,
          gastoMesPorSetorEntries: Array.from(mapaGastoMes.entries()),
          atualizadoEm: new Date().toISOString(),
        });

        if (abrirNovoParam) {
          const padraoMkt =
            st?.mercado_padrao_id ||
            mkts.find((m) => m.padrao)?.id ||
            mkts[0]?.id ||
            "";
          setModoSheetCarrinho("novo");
          setNomeCarrinhoForm("Compra da semana");
          setMercadoCarrinhoFormId(padraoMkt);
          setSheetCarrinhoAberto(true);
        }
      } catch {
        // Se estiver sem internet no mercado, restaura automaticamente o último estado salvo no aparelho
        const snapshot = await lerSnapshotModoMercado();
        if (snapshot) {
          setGroupId(snapshot.groupId);
          setUserId(snapshot.userId);
          setGrupo(snapshot.grupo);
          setSettings(snapshot.settings);
          setMercados(snapshot.mercados);
          setSetores(snapshot.setores);
          setOrdemSetoresMercado(snapshot.ordemSetoresMercado);
          setProdutos(snapshot.produtos);
          setPrecos(snapshot.precos);
          setCarrinhosAtivos(snapshot.carrinhosAtivos);
          setCarrinhoAtualId(snapshot.carrinhoAtualId);
          setItensCarrinho(snapshot.itensCarrinho);
          setGastoMesPorSetor(new Map(snapshot.gastoMesPorSetorEntries));
        } else {
          setErro("Erro ao carregar o planejamento de compras.");
        }
      } finally {
        setCarregando(false);
      }
    },
    [router, cartIdParam, carrinhoAtualId, abrirNovoParam]
  );

  // Mantém o snapshot offline atualizado a cada alteração otimista nos itens ou no carrinho
  useEffect(() => {
    if (!groupId || carregando) return;
    salvarSnapshotModoMercado({
      groupId,
      userId,
      grupo,
      settings,
      mercados,
      setores,
      ordemSetoresMercado,
      produtos,
      precos,
      carrinhosAtivos,
      carrinhoAtualId,
      itensCarrinho,
      gastoMesPorSetorEntries: Array.from(gastoMesPorSetor.entries()),
      atualizadoEm: new Date().toISOString(),
    });
  }, [
    groupId,
    userId,
    grupo,
    settings,
    mercados,
    setores,
    ordemSetoresMercado,
    produtos,
    precos,
    carrinhosAtivos,
    carrinhoAtualId,
    itensCarrinho,
    gastoMesPorSetor,
    carregando,
  ]);

  // Processa a fila offline caso o usuário abra a página já com internet após usar offline
  useEffect(() => {
    processarFilaOffline().catch(() => {});
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Sincronização ao vivo a dois (Supabase Realtime — Etapa 7)
  // Em caso de conflito, vale a última alteração por item recebida do banco.
  useEffect(() => {
    if (!groupId) return;
    const supabase = createClient();

    function dispararPulso() {
      setPulsoRealtime(true);
      setTimeout(() => setPulsoRealtime(false), 1800);
    }

    const canal = supabase
      .channel(`compra-ao-vivo-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cart_items",
          filter: `group_id=eq.${groupId}`,
        },
        async (payload) => {
          dispararPulso();

          if (payload.eventType === "INSERT") {
            const novoItem = payload.new as CartItem;
            if (novoItem.cart_id !== carrinhoAtualId) return;

            // Se o produto foi recém-cadastrado pelo parceiro, garante que ele está no estado local de produtos
            setProdutos((prodsAtuais) => {
              if (!prodsAtuais.some((p) => p.id === novoItem.product_id)) {
                supabase
                  .from("products")
                  .select("*")
                  .eq("id", novoItem.product_id)
                  .single()
                  .then(({ data }) => {
                    if (data) {
                      setProdutos((prev) =>
                        prev.some((x) => x.id === (data as Product).id)
                          ? prev
                          : [...prev, data as Product]
                      );
                    }
                  });
              }
              return prodsAtuais;
            });

            setItensCarrinho((prev) => {
              // Se já existe pelo id real, atualiza
              if (prev.some((x) => x.id === novoItem.id)) {
                return prev.map((x) => (x.id === novoItem.id ? novoItem : x));
              }
              // Se havia um item otimista temporário para o mesmo produto, substitui pelo definitivo
              const idxTemp = prev.findIndex(
                (x) =>
                  x.id.startsWith("temp-") &&
                  x.product_id === novoItem.product_id
              );
              if (idxTemp !== -1) {
                const copia = [...prev];
                copia[idxTemp] = novoItem;
                return copia;
              }
              return [...prev, novoItem].sort(
                (a, b) => (a.ordem || 0) - (b.ordem || 0)
              );
            });
          } else if (payload.eventType === "UPDATE") {
            const itemAtualizado = payload.new as CartItem;
            if (itemAtualizado.cart_id !== carrinhoAtualId) return;
            setItensCarrinho((prev) =>
              prev.map((x) =>
                x.id === itemAtualizado.id ? itemAtualizado : x
              )
            );
          } else if (payload.eventType === "DELETE") {
            const idRemovido = (payload.old as { id?: string })?.id;
            if (!idRemovido) return;
            setItensCarrinho((prev) =>
              prev.filter((x) => x.id !== idRemovido)
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "carts",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          dispararPulso();

          if (payload.eventType === "INSERT") {
            const novoCart = payload.new as Cart;
            if (
              novoCart.status === "planejado" ||
              novoCart.status === "em_compra"
            ) {
              setCarrinhosAtivos((prev) =>
                prev.some((c) => c.id === novoCart.id)
                  ? prev
                  : [novoCart, ...prev]
              );
              if (!carrinhoAtualId) {
                setCarrinhoAtualId(novoCart.id);
              }
            }
          } else if (payload.eventType === "UPDATE") {
            const cartAtualizado = payload.new as Cart;
            if (cartAtualizado.status === "finalizado") {
              setCarrinhosAtivos((prev) =>
                prev.filter((c) => c.id !== cartAtualizado.id)
              );
              if (carrinhoAtualId === cartAtualizado.id) {
                router.push("/");
              }
            } else {
              setCarrinhosAtivos((prev) =>
                prev.map((c) =>
                  c.id === cartAtualizado.id ? cartAtualizado : c
                )
              );
            }
          } else if (payload.eventType === "DELETE") {
            const idRemovido = (payload.old as { id?: string })?.id;
            if (!idRemovido) return;
            setCarrinhosAtivos((prev) =>
              prev.filter((c) => c.id !== idRemovido)
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "market_sector_order",
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          supabase
            .from("market_sector_order")
            .select("*")
            .eq("group_id", groupId)
            .then(({ data }) => {
              if (data) {
                setOrdemSetoresMercado(data as MarketSectorOrder[]);
              }
            });
        }
      )
      .subscribe((status) => {
        setAoVivoConectado(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(canal);
    };
  }, [groupId, carrinhoAtualId, router]);

  const carrinhoAtual = useMemo(
    () => carrinhosAtivos.find((c) => c.id === carrinhoAtualId) || null,
    [carrinhosAtivos, carrinhoAtualId]
  );

  const mercadoPadraoId = useMemo(() => {
    if (settings?.mercado_padrao_id) return settings.mercado_padrao_id;
    return mercados.find((m) => m.padrao)?.id || mercados[0]?.id || null;
  }, [settings, mercados]);

  const mapaProdutos = useMemo(() => {
    const map = new Map<string, Product>();
    produtos.forEach((p) => map.set(p.id, p));
    return map;
  }, [produtos]);

  const mapaSetores = useMemo(() => {
    const map = new Map<string, Sector>();
    setores.forEach((s) => map.set(s.id, s));
    return map;
  }, [setores]);

  const mapaMercados = useMemo(() => {
    const map = new Map<string, Market>();
    mercados.forEach((m) => map.set(m.id, m));
    return map;
  }, [mercados]);

  const precosPorProduto = useMemo(() => {
    const map = new Map<string, Price[]>();
    precos.forEach((p) => {
      const lista = map.get(p.product_id) || [];
      lista.push(p);
      map.set(p.product_id, lista);
    });
    return map;
  }, [precos]);

  const marcasExistentes = useMemo(() => {
    const set = new Set<string>();
    precos.forEach((p) => {
      if (p.marca && p.marca.trim()) set.add(p.marca.trim());
    });
    itensCarrinho.forEach((i) => {
      if (i.marca && i.marca.trim()) set.add(i.marca.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [precos, itensCarrinho]);

  const idsNoCarrinhoAtual = useMemo(
    () => new Set(itensCarrinho.map((i) => i.product_id)),
    [itensCarrinho]
  );

  // Calcula estimativa rica para cada item do carrinho atual
  const itensEnriquecidos = useMemo(() => {
    const marketId = carrinhoAtual?.market_id || mercadoPadraoId;
    return itensCarrinho.map((item) => {
      const produto = mapaProdutos.get(item.product_id);
      const listaPrecos = precosPorProduto.get(item.product_id) || [];
      const calc = calcularEstimativaItemCarrinho(
        listaPrecos,
        Number(item.quantidade),
        {
          metodo: settings?.metodo_preco || "media",
          mesesMedia: settings?.meses_media || 3,
          marketIdCarrinho: marketId,
          marcaItem: item.marca,
        }
      );

      // Se o usuário digitou um preço estimado manual quando não havia histórico, respeita o salvo
      const precoUnitario =
        calc.precoUnitarioEstimado !== null
          ? calc.precoUnitarioEstimado
          : item.preco_estimado !== null
          ? Number(item.preco_estimado)
          : null;

      const subtotal =
        precoUnitario !== null ? precoUnitario * Number(item.quantidade) : 0;

      return {
        item,
        produto,
        calc,
        precoUnitario,
        subtotal,
      };
    });
  }, [
    itensCarrinho,
    carrinhoAtual,
    mercadoPadraoId,
    mapaProdutos,
    precosPorProduto,
    settings,
  ]);

  // Total estimado geral do carrinho
  const totalEstimadoCarrinho = useMemo(
    () => itensEnriquecidos.reduce((acc, x) => acc + x.subtotal, 0),
    [itensEnriquecidos]
  );

  // Ordena setores conforme a ordem de corredores do mercado do carrinho
  const setoresOrdenados = useMemo(() => {
    const mktId = carrinhoAtual?.market_id;
    if (!mktId) return setores;
    const mapaPos = new Map<string, number>();
    ordemSetoresMercado
      .filter((o) => o.market_id === mktId)
      .forEach((o) => mapaPos.set(o.sector_id, o.posicao));

    if (mapaPos.size === 0) return setores;

    return [...setores].sort((a, b) => {
      const posA = mapaPos.get(a.id) ?? a.ordem ?? 999;
      const posB = mapaPos.get(b.id) ?? b.ordem ?? 999;
      return posA - posB;
    });
  }, [setores, ordemSetoresMercado, carrinhoAtual]);

  // Agrupa itens do carrinho por setor e calcula impacto no orçamento mensal de cada setor
  const gruposPorSetor = useMemo(() => {
    const mapaItens = new Map<string, typeof itensEnriquecidos>();
    itensEnriquecidos.forEach((enriq) => {
      const secId = enriq.produto?.sector_id || "sem_setor";
      const lista = mapaItens.get(secId) || [];
      lista.push(enriq);
      mapaItens.set(secId, lista);
    });

    const resultado: {
      sectorId: string;
      nome: string;
      emoji: string;
      orcamentoMensal: number | null;
      gastoMesAtual: number;
      estimadoCarrinhoSetor: number;
      projecaoTotalMes: number;
      valorEstouro: number;
      percentualProjetado: number | null;
      statusOrcamento: "normal" | "verde" | "amarelo" | "vermelho";
      itens: typeof itensEnriquecidos;
    }[] = [];

    const processarSetor = (
      secId: string,
      nome: string,
      emoji: string,
      orcamentoMensal: number | null
    ) => {
      const itens = mapaItens.get(secId) || [];
      if (itens.length === 0) return;

      const estimadoSetor = itens.reduce((a, b) => a + b.subtotal, 0);
      const gastoMes = gastoMesPorSetor.get(secId) || 0;
      const projecao = gastoMes + estimadoSetor;

      let statusOrcamento: "normal" | "verde" | "amarelo" | "vermelho" =
        "normal";
      let valorEstouro = 0;
      let percentualProjetado: number | null = null;

      if (orcamentoMensal !== null && orcamentoMensal > 0) {
        const razao = projecao / orcamentoMensal;
        percentualProjetado = Math.round(razao * 100);
        if (razao > LIMITE_ORCAMENTO_ESTOURO) {
          statusOrcamento = "vermelho";
          valorEstouro = projecao - orcamentoMensal;
        } else if (razao >= LIMITE_ORCAMENTO_ALERTA) {
          statusOrcamento = "amarelo";
        } else {
          statusOrcamento = "verde";
        }
      }

      resultado.push({
        sectorId: secId,
        nome,
        emoji,
        orcamentoMensal,
        gastoMesAtual: gastoMes,
        estimadoCarrinhoSetor: estimadoSetor,
        projecaoTotalMes: projecao,
        valorEstouro,
        percentualProjetado,
        statusOrcamento,
        itens,
      });
    };

    setoresOrdenados.forEach((s) =>
      processarSetor(
        s.id,
        s.nome,
        s.emoji,
        s.orcamento_mensal !== null ? Number(s.orcamento_mensal) : null
      )
    );

    if (mapaItens.has("sem_setor")) {
      processarSetor("sem_setor", "Outros / Sem setor", "🛒", null);
    }

    return resultado;
  }, [itensEnriquecidos, setoresOrdenados, gastoMesPorSetor]);

  // Lista de setores que estouram o orçamento neste carrinho (para aviso singelo no topo)
  const setoresEstourados = useMemo(
    () => gruposPorSetor.filter((g) => g.statusOrcamento === "vermelho"),
    [gruposPorSetor]
  );

  // Resultados da busca para adicionar produtos ao carrinho
  const resultadosBusca = useMemo(() => {
    const termo = buscaProduto.trim().toLowerCase();
    if (!termo) return [];
    return produtos
      .filter((p) => p.nome.toLowerCase().includes(termo))
      .slice(0, 8);
  }, [produtos, buscaProduto]);

  // --- Funções de Carrinho ---
  function abrirModalNovoCarrinho() {
    setErro(null);
    setModoSheetCarrinho("novo");
    setNomeCarrinhoForm("Compra da semana");
    setMercadoCarrinhoFormId(mercadoPadraoId || "");
    setSheetCarrinhoAberto(true);
  }

  function abrirModalEditarCarrinho() {
    if (!carrinhoAtual) return;
    setErro(null);
    setModoSheetCarrinho("editar");
    setNomeCarrinhoForm(carrinhoAtual.nome);
    setMercadoCarrinhoFormId(carrinhoAtual.market_id || mercadoPadraoId || "");
    setSheetCarrinhoAberto(true);
  }

  async function handleSalvarCarrinho(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || !nomeCarrinhoForm.trim()) return;

    setSalvando(true);
    setErro(null);
    try {
      const supabase = createClient();
      const mktId = mercadoCarrinhoFormId || null;

      if (modoSheetCarrinho === "novo") {
        const { data: novo, error } = await supabase
          .from("carts")
          .insert({
            group_id: groupId,
            nome: nomeCarrinhoForm.trim(),
            market_id: mktId,
            status: "planejado",
            data_planejada: dataHojeISO(),
            criado_por: userId,
          })
          .select()
          .single();

        if (error) throw error;
        const criado = novo as Cart;
        setSheetCarrinhoAberto(false);
        await carregarDados(criado.id);
      } else if (carrinhoAtual) {
        const { error } = await supabase
          .from("carts")
          .update({
            nome: nomeCarrinhoForm.trim(),
            market_id: mktId,
          })
          .eq("id", carrinhoAtual.id);

        if (error) throw error;

        // Reestima os itens do carrinho para o novo mercado selecionado
        for (const item of itensCarrinho) {
          const listaPrecos = precosPorProduto.get(item.product_id) || [];
          const calc = calcularEstimativaItemCarrinho(
            listaPrecos,
            Number(item.quantidade),
            {
              metodo: settings?.metodo_preco || "media",
              mesesMedia: settings?.meses_media || 3,
              marketIdCarrinho: mktId,
              marcaItem: item.marca,
            }
          );

          if (calc.precoUnitarioEstimado !== null) {
            await supabase
              .from("cart_items")
              .update({
                preco_estimado: calc.precoUnitarioEstimado,
                atacado_aplicado: calc.atacadoAplicado,
              })
              .eq("id", item.id);
          }
        }

        setSheetCarrinhoAberto(false);
        await carregarDados(carrinhoAtual.id);
      }
    } catch {
      setErro("Não foi possível salvar o carrinho.");
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluirCarrinhoAtual() {
    if (!carrinhoAtual) return;
    setSalvando(true);
    try {
      const supabase = createClient();
      await supabase.from("carts").delete().eq("id", carrinhoAtual.id);
      setSheetCarrinhoAberto(false);
      setCarrinhoAtualId(null);
      await carregarDados(null);
    } finally {
      setSalvando(false);
    }
  }

  // --- Funções de Itens no Carrinho (Com atualização otimista!) ---
  async function handleAdicionarProdutoAoCarrinho(prod: Product) {
    if (!groupId) return;
    const supabase = createClient();

    // Se ainda não existir carrinho aberto, cria automaticamente um carrinho "Compra da semana"
    let targetCartId = carrinhoAtual?.id || null;
    let targetMarketId = carrinhoAtual?.market_id || mercadoPadraoId;

    if (!targetCartId) {
      const { data: novoCart, error: cartErr } = await supabase
        .from("carts")
        .insert({
          group_id: groupId,
          nome: "Compra da semana",
          market_id: targetMarketId,
          status: "planejado",
          data_planejada: dataHojeISO(),
          criado_por: userId,
        })
        .select()
        .single();

      if (cartErr || !novoCart) {
        setErro("Não foi possível criar o carrinho.");
        return;
      }
      const c = novoCart as Cart;
      targetCartId = c.id;
      targetMarketId = c.market_id;
      setCarrinhosAtivos((prev) => [c, ...prev]);
      setCarrinhoAtualId(c.id);
    }

    // Verifica se o produto já está no carrinho; se estiver, soma +1 na quantidade
    const existente = itensCarrinho.find((i) => i.product_id === prod.id);
    const listaPrecos = precosPorProduto.get(prod.id) || [];

    if (existente) {
      const novaQtd = Number(existente.quantidade) + 1;
      const calc = calcularEstimativaItemCarrinho(listaPrecos, novaQtd, {
        metodo: settings?.metodo_preco || "media",
        mesesMedia: settings?.meses_media || 3,
        marketIdCarrinho: targetMarketId,
        marcaItem: existente.marca,
      });

      const novoPrecoEst =
        calc.precoUnitarioEstimado !== null
          ? calc.precoUnitarioEstimado
          : existente.preco_estimado;

      // Atualização otimista
      setItensCarrinho((prev) =>
        prev.map((x) =>
          x.id === existente.id
            ? {
                ...x,
                quantidade: novaQtd,
                preco_estimado: novoPrecoEst,
                atacado_aplicado: calc.atacadoAplicado,
              }
            : x
        )
      );

      await supabase
        .from("cart_items")
        .update({
          quantidade: novaQtd,
          preco_estimado: novoPrecoEst,
          atacado_aplicado: calc.atacadoAplicado,
        })
        .eq("id", existente.id);

      setBuscaProduto("");
      return;
    }

    // Insere novo item no carrinho
    const calc = calcularEstimativaItemCarrinho(listaPrecos, 1, {
      metodo: settings?.metodo_preco || "media",
      mesesMedia: settings?.meses_media || 3,
      marketIdCarrinho: targetMarketId,
    });

    const novaOrdem = itensCarrinho.length + 1;
    const { data: itemCriado, error: itemErr } = await supabase
      .from("cart_items")
      .insert({
        cart_id: targetCartId,
        group_id: groupId,
        product_id: prod.id,
        marca: null,
        quantidade: 1,
        preco_estimado: calc.precoUnitarioEstimado,
        preco_real: null,
        marcado: false,
        atacado_aplicado: calc.atacadoAplicado,
        ordem: novaOrdem,
      })
      .select()
      .single();

    if (!itemErr && itemCriado) {
      setItensCarrinho((prev) => [...prev, itemCriado as CartItem]);
    }
    setBuscaProduto("");
  }

  async function handleAlterarQuantidadeRapida(
    item: CartItem,
    delta: number
  ) {
    const atual = Number(item.quantidade);
    const passo = atual < 1 || !Number.isInteger(atual) ? 0.5 : 1;
    const novaQtd = Number((atual + delta * passo).toFixed(3));

    if (novaQtd <= 0) {
      await handleRemoverItem(item.id);
      return;
    }

    const listaPrecos = precosPorProduto.get(item.product_id) || [];
    const calc = calcularEstimativaItemCarrinho(listaPrecos, novaQtd, {
      metodo: settings?.metodo_preco || "media",
      mesesMedia: settings?.meses_media || 3,
      marketIdCarrinho: carrinhoAtual?.market_id || mercadoPadraoId,
      marcaItem: item.marca,
    });

    const novoPrecoEst =
      calc.precoUnitarioEstimado !== null
        ? calc.precoUnitarioEstimado
        : item.preco_estimado;

    // Atualização otimista na tela
    setItensCarrinho((prev) =>
      prev.map((x) =>
        x.id === item.id
          ? {
              ...x,
              quantidade: novaQtd,
              preco_estimado: novoPrecoEst,
              atacado_aplicado: calc.atacadoAplicado,
            }
          : x
      )
    );

    const supabase = createClient();
    await supabase
      .from("cart_items")
      .update({
        quantidade: novaQtd,
        preco_estimado: novoPrecoEst,
        atacado_aplicado: calc.atacadoAplicado,
      })
      .eq("id", item.id);
  }

  async function handleRemoverItem(itemId: string) {
    setItensCarrinho((prev) => prev.filter((x) => x.id !== itemId));
    const supabase = createClient();
    await supabase.from("cart_items").delete().eq("id", itemId);
  }

  // --- Editar Item Detalhado (Marca, Quantidade Decimal, Preço Estimado) ---
  function abrirEdicaoItem(
    item: CartItem,
    precoUnitarioCalculado: number | null
  ) {
    setErro(null);
    setItemEditando(item);
    setQtdItemForm(String(Number(item.quantidade)).replace(".", ","));
    setMarcaItemForm(item.marca || "");
    setPrecoManualForm(
      precoUnitarioCalculado !== null
        ? precoUnitarioCalculado.toFixed(2).replace(".", ",")
        : ""
    );
  }

  async function handleSalvarEdicaoItem(e: React.FormEvent) {
    e.preventDefault();
    if (!itemEditando || !groupId) return;

    const qtdNum = parseDecimalBR(qtdItemForm);
    if (qtdNum <= 0) {
      setErro("A quantidade deve ser maior que zero.");
      return;
    }

    const marcaLimpa = marcaItemForm.trim() || null;
    const precoDigitado = parseDecimalBR(precoManualForm);

    const listaPrecos = precosPorProduto.get(itemEditando.product_id) || [];
    const calc = calcularEstimativaItemCarrinho(listaPrecos, qtdNum, {
      metodo: settings?.metodo_preco || "media",
      mesesMedia: settings?.meses_media || 3,
      marketIdCarrinho: carrinhoAtual?.market_id || mercadoPadraoId,
      marcaItem: marcaLimpa,
    });

    const precoEstimadoFinal =
      precoDigitado > 0 ? precoDigitado : calc.precoUnitarioEstimado;

    setSalvando(true);
    try {
      const supabase = createClient();
      await supabase
        .from("cart_items")
        .update({
          quantidade: qtdNum,
          marca: marcaLimpa,
          preco_estimado: precoEstimadoFinal,
          atacado_aplicado: calc.atacadoAplicado,
        })
        .eq("id", itemEditando.id);

      // Se o produto nunca teve preço registrado e o usuário informou o estimado, guarda no histórico
      const mktId = carrinhoAtual?.market_id || mercadoPadraoId;
      if (listaPrecos.length === 0 && precoDigitado > 0 && mktId) {
        await supabase.from("prices").insert({
          group_id: groupId,
          product_id: itemEditando.product_id,
          market_id: mktId,
          marca: marcaLimpa,
          valor: precoDigitado,
          tipo: "varejo",
          quantidade_minima: 1,
          data: dataHojeISO(),
          criado_por: userId,
        });
      }

      setItemEditando(null);
      await carregarDados(carrinhoAtual?.id);
    } finally {
      setSalvando(false);
    }
  }

  // --- Cadastro Rápido de Produto a partir da busca ---
  function abrirCadastroRapidoDaBusca() {
    setErro(null);
    setNomeProdRapido(buscaProduto.trim());
    setSetorProdRapidoId(setores[0]?.id || "");
    setUnidadeProdRapido("un");
    setEmojiProdRapido("");
    setPrecoProdRapido("");
    setSheetNovoProdRapido(true);
  }

  async function handleSalvarProdRapidoEAdicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || !nomeProdRapido.trim()) return;

    setSalvando(true);
    try {
      const supabase = createClient();
      const { data: novoProd, error } = await supabase
        .from("products")
        .insert({
          group_id: groupId,
          nome: nomeProdRapido.trim(),
          sector_id: setorProdRapidoId || null,
          unidade: unidadeProdRapido,
          emoji: emojiProdRapido.trim() || null,
          ativo: true,
        })
        .select()
        .single();

      if (error || !novoProd) throw error;
      const p = novoProd as Product;

      const valPreco = parseDecimalBR(precoProdRapido);
      const mktId = carrinhoAtual?.market_id || mercadoPadraoId;
      if (valPreco > 0 && mktId) {
        await supabase.from("prices").insert({
          group_id: groupId,
          product_id: p.id,
          market_id: mktId,
          marca: null,
          valor: valPreco,
          tipo: "varejo",
          quantidade_minima: 1,
          data: dataHojeISO(),
          criado_por: userId,
        });
      }

      setSheetNovoProdRapido(false);
      setBuscaProduto("");
      await carregarDados(carrinhoAtual?.id);
      await handleAdicionarProdutoAoCarrinho(p);
    } catch {
      setErro("Erro ao cadastrar o produto rápido.");
    } finally {
      setSalvando(false);
    }
  }

  async function handleIniciarModoMercado() {
    if (!carrinhoAtual) return;
    setForcarPlanejamento(false);
    // Atualização otimista para entrar no Modo Mercado imediatamente
    setCarrinhosAtivos((prev) =>
      prev.map((c) =>
        c.id === carrinhoAtual.id ? { ...c, status: "em_compra" } : c
      )
    );
    const supabase = createClient();
    await supabase
      .from("carts")
      .update({ status: "em_compra" })
      .eq("id", carrinhoAtual.id);
  }

  const mercadoAtualNome =
    (carrinhoAtual?.market_id &&
      mapaMercados.get(carrinhoAtual.market_id)?.nome) ||
    (mercadoPadraoId && mapaMercados.get(mercadoPadraoId)?.nome) ||
    "Escolher mercado";

  if (
    !carregando &&
    groupId &&
    carrinhoAtual &&
    carrinhoAtual.status === "em_compra" &&
    !forcarPlanejamento
  ) {
    return (
      <LiveMarketMode
        groupId={groupId}
        userId={userId}
        carrinho={carrinhoAtual}
        itensCarrinho={itensCarrinho}
        setItensCarrinho={setItensCarrinho}
        produtos={produtos}
        setores={setores}
        mercados={mercados}
        precos={precos}
        settings={settings}
        ordemSetoresMercado={ordemSetoresMercado}
        gastoMesPorSetor={gastoMesPorSetor}
        aoVivoConectado={aoVivoConectado}
        pulsoRealtime={pulsoRealtime}
        onReload={carregarDados}
        onVoltarPlanejamento={() => setForcarPlanejamento(true)}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-main pb-32 w-full max-w-full overflow-x-hidden">
      <main className="flex-1 w-full max-w-md mx-auto px-4 sm:px-5 pt-5 flex flex-col gap-4 min-w-0 max-w-full">
        {/* Topo: Seletor de Carrinho e Botão Novo Carrinho */}
        <div className="flex items-center justify-between gap-2 w-full min-w-0">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-text-muted font-medium flex items-center gap-2 truncate">
              <span className="truncate">Planejamento de Compra</span>
              {aoVivoConectado && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-light text-primary-hover text-[11px] font-bold shrink-0">
                  <span
                    className={`w-1.5 h-1.5 rounded-full bg-primary ${
                      pulsoRealtime ? "animate-ping" : ""
                    }`}
                  />
                  <span>Ao vivo</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-[24px] font-extrabold leading-tight truncate">
                {carrinhoAtual ? carrinhoAtual.nome : "Carrinho"}
              </h1>
              {carrinhoAtual && (
                <button
                  type="button"
                  onClick={abrirModalEditarCarrinho}
                  className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center text-text-muted hover:text-text-main shrink-0 cursor-pointer"
                  title="Editar nome ou mercado do carrinho"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={abrirModalNovoCarrinho}
            className="h-11 px-3.5 rounded-btn bg-card border border-border hover:border-primary text-primary font-bold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo carrinho</span>
          </button>
        </div>

        {/* Se houver mais de um carrinho planejado/aberto, pílulas para alternar */}
        {carrinhosAtivos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar w-full max-w-full min-w-0">
            {carrinhosAtivos.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => carregarDados(c.id)}
                className={`h-9 px-3.5 rounded-full text-xs font-bold shrink-0 border cursor-pointer ${
                  c.id === carrinhoAtual?.id
                    ? "bg-primary text-white border-primary"
                    : "bg-card text-text-muted border-border"
                }`}
              >
                {c.nome}
              </button>
            ))}
          </div>
        )}

        {erro && (
          <div className="bg-budget-red-bg text-budget-red-text px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {carregando ? (
          <div className="flex flex-col gap-3">
            <div className="h-32 bg-border/70 rounded-card animate-pulse" />
            <div className="h-24 bg-border/70 rounded-card animate-pulse" />
            <div className="h-48 bg-border/70 rounded-card animate-pulse" />
          </div>
        ) : (
          <>
            {/* CARD DE ESTIMATIVA GERAL DO CARRINHO + MERCADO ESCOLHIDO */}
            <section className="bg-card border border-border rounded-card p-4 sm:p-5 flex flex-col gap-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-text-muted">
                    Total estimado · {itensCarrinho.length}{" "}
                    {itensCarrinho.length === 1 ? "item" : "itens"}
                  </div>
                  <div className="text-3xl font-extrabold text-text-main mt-0.5">
                    {formatarMoeda(totalEstimadoCarrinho)}
                  </div>
                </div>

                {/* Pílula de escolha de mercado (uma vez por carrinho) */}
                <button
                  type="button"
                  onClick={
                    carrinhoAtual
                      ? abrirModalEditarCarrinho
                      : abrirModalNovoCarrinho
                  }
                  className="h-11 px-3.5 rounded-full bg-background border border-border hover:border-primary flex items-center gap-1.5 text-xs font-bold text-text-main shrink-0 cursor-pointer"
                >
                  <Store className="w-4 h-4 text-primary" />
                  <span className="max-w-[120px] truncate">
                    {mercadoAtualNome}
                  </span>
                  <ChevronDown className="w-4 h-4 text-text-muted" />
                </button>
              </div>

              {/* Avisos singelos de orçamento (Seção 6: uma linha pequena, sem pop-up) */}
              {setoresEstourados.length > 0 && (
                <div className="flex flex-col gap-1 pt-2 border-t border-border">
                  {setoresEstourados.map((st) => (
                    <div
                      key={st.sectorId}
                      className="text-xs font-bold text-budget-red-text flex items-center gap-1.5"
                    >
                      <span className="w-2 h-2 rounded-full bg-budget-red shrink-0" />
                      <span>
                        Esse carrinho estoura {st.nome} em{" "}
                        {formatarMoeda(st.valorEstouro)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* BLOCO "COSTUMO COMPRAR" (Seção 6 — fácil de remover) */}
            {EXIBIR_COSTUMO_COMPRAR && (
              <FrequentProductsBar
                produtos={produtos}
                setores={setores}
                precos={precos}
                contagemFrequenciaCarrinhos={frequenciaProdutos}
                idsNoCarrinhoAtual={idsNoCarrinhoAtual}
                onAddProduct={handleAdicionarProdutoAoCarrinho}
              />
            )}

            {/* BUSCA RÁPIDA PARA ADICIONAR PRODUTO AO CARRINHO */}
            <div className="relative flex flex-col gap-1.5">
              <div className="relative flex items-center">
                <Search className="w-5 h-5 text-text-muted absolute left-3.5" />
                <input
                  type="text"
                  value={buscaProduto}
                  onChange={(e) => setBuscaProduto(e.target.value)}
                  placeholder="Adicionar produto ao carrinho..."
                  className="w-full h-12 pl-11 pr-10 rounded-2xl bg-card border border-border text-sm font-medium text-text-main focus:outline-none focus:border-primary shadow-sm"
                />
                {buscaProduto && (
                  <button
                    type="button"
                    onClick={() => setBuscaProduto("")}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted absolute right-2 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Dropdown de sugestões instantâneas da busca */}
              {buscaProduto.trim().length > 0 && (
                <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden divide-y divide-border z-20 max-h-72 overflow-y-auto overscroll-contain">
                  {resultadosBusca.map((prod) => {
                    const setor = prod.sector_id
                      ? mapaSetores.get(prod.sector_id)
                      : null;
                    const noCarrinho = idsNoCarrinhoAtual.has(prod.id);
                    return (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => {
                          (document.activeElement as HTMLElement)?.blur();
                          handleAdicionarProdutoAoCarrinho(prod);
                        }}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-background text-left cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-lg shrink-0">
                            {prod.emoji || setor?.emoji || "📦"}
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-text-main truncate">
                              {prod.nome}
                            </div>
                            <div className="text-[11px] text-text-muted truncate">
                              {setor?.nome || "Sem setor"} · {prod.unidade}
                            </div>
                          </div>
                        </div>
                        <span className="h-8 px-3 rounded-full bg-primary-light text-primary font-bold text-xs flex items-center gap-1 shrink-0">
                          <Plus className="w-3.5 h-3.5" />
                          <span>{noCarrinho ? "Mais 1" : "Adicionar"}</span>
                        </span>
                      </button>
                    );
                  })}

                  {/* Opção para cadastrar rápido se não encontrou */}
                  <button
                    type="button"
                    onClick={() => {
                      (document.activeElement as HTMLElement)?.blur();
                      abrirCadastroRapidoDaBusca();
                    }}
                    className="w-full px-4 py-3 bg-primary-light/50 hover:bg-primary-light flex items-center justify-between text-left cursor-pointer transition-colors"
                  >
                    <span className="text-xs font-extrabold text-primary-hover truncate">
                      + Cadastrar &ldquo;{buscaProduto.trim()}&rdquo; e colocar
                      no carrinho
                    </span>
                    <ArrowRight className="w-4 h-4 text-primary shrink-0 ml-2" />
                  </button>
                </div>
              )}
            </div>

            {/* LISTA DE ITENS DO CARRINHO AGRUPADA POR SETOR */}
            {gruposPorSetor.length === 0 ? (
              <div className="bg-card border border-border rounded-card p-6 text-center flex flex-col items-center gap-2.5">
                <div className="w-12 h-12 rounded-2xl bg-primary-light text-primary flex items-center justify-center">
                  <ShoppingCart className="w-6 h-6" />
                </div>
                <h2 className="text-base font-extrabold">
                  Seu carrinho está vazio
                </h2>
                <p className="text-xs text-text-muted max-w-xs">
                  Toque nos produtos em <strong>Costumo comprar</strong> acima
                  ou busque um produto para montar sua lista e ver a estimativa
                  de gasto.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3.5">
                {gruposPorSetor.map((grupoSetor) => {
                  const bgHeader =
                    grupoSetor.statusOrcamento === "vermelho"
                      ? "bg-budget-red-bg"
                      : grupoSetor.statusOrcamento === "amarelo"
                      ? "bg-budget-yellow-bg"
                      : "bg-[#ECEEF5]";

                  return (
                    <div key={grupoSetor.sectorId} className="flex flex-col">
                      {/* Cabeçalho do setor conforme 2-modo-mercado.html */}
                      <div className={`px-3 py-2 rounded-xl ${bgHeader}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-lg leading-none">
                            {grupoSetor.emoji}
                          </span>
                          <span className="flex-1 text-[15px] font-bold text-text-main">
                            {grupoSetor.nome}
                          </span>
                          <span className="text-[13px] font-bold text-text-muted">
                            {formatarMoeda(grupoSetor.estimadoCarrinhoSetor)}
                          </span>
                        </div>

                        {/* Linha singela de estouro ou alerta de orçamento do setor */}
                        {grupoSetor.statusOrcamento === "vermelho" && (
                          <div className="pl-7 mt-0.5 text-xs font-bold text-budget-red-text">
                            Esse carrinho estoura {grupoSetor.nome} em{" "}
                            {formatarMoeda(grupoSetor.valorEstouro)}
                          </div>
                        )}
                        {grupoSetor.statusOrcamento === "amarelo" &&
                          grupoSetor.percentualProjetado !== null && (
                            <div className="pl-7 mt-0.5 text-xs font-bold text-budget-yellow-text">
                              Atinge {grupoSetor.percentualProjetado}% do
                              orçamento do mês
                            </div>
                          )}
                      </div>

                      {/* Itens do setor */}
                      <div className="mt-1.5 bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
                        {grupoSetor.itens.map(
                          ({ item, produto, calc, precoUnitario, subtotal }) => {
                            const un = produto?.unidade || "un";
                            return (
                              <div
                                key={item.id}
                                className="p-3 flex flex-col gap-1.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  {/* Toque no nome/preço abre bottom sheet de edição detalhada */}
                                  <div
                                    onClick={() =>
                                      abrirEdicaoItem(item, precoUnitario)
                                    }
                                    className="flex-1 min-w-0 cursor-pointer"
                                  >
                                    <div className="text-[15px] font-bold text-text-main truncate">
                                      {produto?.nome || "Produto"}
                                    </div>
                                    <div className="text-xs text-text-muted flex flex-wrap items-center gap-1">
                                      <span>
                                        {String(
                                          Number(item.quantidade)
                                        ).replace(".", ",")}{" "}
                                        {un}
                                      </span>
                                      <span>×</span>
                                      <span>
                                        {precoUnitario !== null
                                          ? `est. ${formatarMoeda(
                                              precoUnitario
                                            )}`
                                          : "Toque p/ digitar preço"}
                                      </span>
                                      {item.marca && (
                                        <span className="font-semibold text-primary">
                                          · {item.marca}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Controles rápidos de quantidade (- / +) e Subtotal */}
                                  <div className="flex items-center gap-2 shrink-0">
                                    <div className="flex items-center bg-background border border-border rounded-xl h-9">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleAlterarQuantidadeRapida(
                                            item,
                                            -1
                                          )
                                        }
                                        className="w-8 h-full flex items-center justify-center text-text-muted hover:text-text-main cursor-pointer"
                                        aria-label="Diminuir quantidade"
                                      >
                                        <Minus className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          abrirEdicaoItem(item, precoUnitario)
                                        }
                                        className="px-2 text-xs font-extrabold text-text-main cursor-pointer"
                                      >
                                        {String(
                                          Number(item.quantidade)
                                        ).replace(".", ",")}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleAlterarQuantidadeRapida(item, 1)
                                        }
                                        className="w-8 h-full flex items-center justify-center text-primary hover:text-primary-hover cursor-pointer"
                                        aria-label="Aumentar quantidade"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                      </button>
                                    </div>

                                    <div
                                      onClick={() =>
                                        abrirEdicaoItem(item, precoUnitario)
                                      }
                                      className="min-w-[74px] text-right cursor-pointer"
                                    >
                                      <div className="text-[15px] font-extrabold text-text-main">
                                        {precoUnitario !== null
                                          ? `~ ${formatarMoeda(subtotal)}`
                                          : "—"}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Avisos discretos de Atacado, Outro Mercado, Marca ou Desatualizado */}
                                {(calc.atacadoAplicado ||
                                  calc.dicaAtacadoDisponivel ||
                                  calc.usouOutroMercado ||
                                  calc.usouProdutoGeralSemMarca ||
                                  calc.desatualizado) && (
                                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                                    {calc.atacadoAplicado && (
                                      <span className="px-2.5 py-0.5 rounded-full bg-primary-light text-primary-hover text-[11px] font-extrabold">
                                        Atacado · levando{" "}
                                        {String(
                                          Number(item.quantidade)
                                        ).replace(".", ",")}
                                        , você economiza{" "}
                                        {formatarMoeda(
                                          calc.economiaAtacadoTotal
                                        )}
                                      </span>
                                    )}
                                    {!calc.atacadoAplicado &&
                                      calc.dicaAtacadoDisponivel && (
                                        <span className="text-[11px] font-semibold text-primary">
                                          Atacado a partir de{" "}
                                          {
                                            calc.dicaAtacadoDisponivel
                                              .quantidadeMinima
                                          }{" "}
                                          {un} (
                                          {formatarMoeda(
                                            calc.dicaAtacadoDisponivel
                                              .precoAtacado
                                          )}
                                          /{un})
                                        </span>
                                      )}
                                    {calc.usouOutroMercado && (
                                      <span className="text-[11px] text-text-muted font-medium">
                                        · preço de outro mercado
                                      </span>
                                    )}
                                    {calc.usouProdutoGeralSemMarca && (
                                      <span className="text-[11px] text-text-muted font-medium">
                                        · sem histórico da marca (usando geral)
                                      </span>
                                    )}
                                    {calc.desatualizado && (
                                      <span className="text-[11px] text-text-muted font-medium">
                                        · preço desatualizado
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Botão de iniciar modo mercado */}
            {carrinhoAtual && itensCarrinho.length > 0 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleIniciarModoMercado}
                  className="w-full h-12 rounded-btn bg-primary hover:bg-primary-hover text-white font-extrabold text-[15px] flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <ShoppingCart className="w-5 h-5" />
                  <span>
                    {carrinhoAtual.status === "em_compra"
                      ? "Compra em andamento no mercado"
                      : "Iniciar compra no mercado"}
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* BOTTOM SHEET: CRIAR / EDITAR CARRINHO E MERCADO */}
      {sheetCarrinhoAberto && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end justify-center">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-card rounded-t-[24px] p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">
                {modoSheetCarrinho === "novo"
                  ? "Novo carrinho"
                  : "Configurar carrinho"}
              </h3>
              <button
                type="button"
                onClick={() => setSheetCarrinhoAberto(false)}
                className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-text-muted cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarCarrinho} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-muted">
                  Nome do carrinho
                </label>
                <input
                  type="text"
                  value={nomeCarrinhoForm}
                  onChange={(e) => setNomeCarrinhoForm(e.target.value)}
                  placeholder="Ex: Compra do mês, Compra da semana..."
                  className="w-full h-12 px-4 rounded-xl bg-background border border-border text-sm font-semibold text-text-main focus:outline-none focus:border-primary"
                  required
                />
                <div className="flex gap-1.5 pt-0.5">
                  {["Compra do mês", "Compra da semana", "Reposição"].map(
                    (sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => setNomeCarrinhoForm(sug)}
                        className="h-7 px-2.5 rounded-full bg-background border border-border text-[11px] font-bold text-text-muted hover:text-primary cursor-pointer"
                      >
                        {sug}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-muted">
                  Mercado desta compra (escolhido uma vez por carrinho)
                </label>
                <select
                  value={mercadoCarrinhoFormId}
                  onChange={(e) => setMercadoCarrinhoFormId(e.target.value)}
                  className="w-full h-12 px-3.5 rounded-xl bg-background border border-border text-sm font-bold text-text-main focus:outline-none focus:border-primary"
                >
                  <option value="">Qualquer mercado</option>
                  {mercados.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome} {m.padrao ? "(Padrão)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2.5 pt-1">
                {modoSheetCarrinho === "editar" && carrinhoAtual && (
                  <button
                    type="button"
                    onClick={handleExcluirCarrinhoAtual}
                    disabled={salvando}
                    className="h-12 px-4 rounded-btn border border-budget-red text-budget-red font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Excluir</span>
                  </button>
                )}
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 h-12 rounded-btn bg-primary hover:bg-primary-hover text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{salvando ? "Salvando..." : "Salvar"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BOTTOM SHEET: EDITAR ITEM DO CARRINHO (Quantidade, Marca, Preço estimado) */}
      {itemEditando && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end justify-center">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-card rounded-t-[24px] p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold">
                  {mapaProdutos.get(itemEditando.product_id)?.nome || "Item"}
                </h3>
                <p className="text-xs text-text-muted">
                  Ajustar quantidade, marca ou estimativa
                </p>
              </div>
              <button
                type="button"
                onClick={() => setItemEditando(null)}
                className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-text-muted cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSalvarEdicaoItem}
              className="flex flex-col gap-3.5"
            >
              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-muted">
                    Quantidade (
                    {mapaProdutos.get(itemEditando.product_id)?.unidade || "un"}
                    )
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={qtdItemForm}
                    onChange={(e) => setQtdItemForm(e.target.value)}
                    className="w-full h-12 px-3.5 rounded-xl bg-background border border-border text-base font-extrabold text-text-main focus:outline-none focus:border-primary"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-muted">
                    Preço estimado (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={precoManualForm}
                    onChange={(e) => setPrecoManualForm(e.target.value)}
                    placeholder="Automático"
                    className="w-full h-12 px-3.5 rounded-xl bg-background border border-border text-base font-extrabold text-text-main focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-muted flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-primary" />
                  <span>Marca preferida (opcional)</span>
                </label>
                <input
                  type="text"
                  value={marcaItemForm}
                  onChange={(e) => setMarcaItemForm(e.target.value)}
                  placeholder="Qualquer marca"
                  className="w-full h-11 px-3.5 rounded-xl bg-background border border-border text-sm font-semibold text-text-main focus:outline-none focus:border-primary"
                />
                {marcasExistentes.length > 0 && (
                  <div className="flex gap-1.5 overflow-x-auto pt-0.5 pb-1">
                    {marcasExistentes.slice(0, 8).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          const novaMarca = marcaItemForm === m ? "" : m;
                          setMarcaItemForm(novaMarca);
                          // Atualiza a prévia do preço estimado para a marca escolhida
                          const lista =
                            precosPorProduto.get(itemEditando.product_id) || [];
                          const c = calcularEstimativaItemCarrinho(
                            lista,
                            parseDecimalBR(qtdItemForm) || 1,
                            {
                              metodo: settings?.metodo_preco || "media",
                              mesesMedia: settings?.meses_media || 3,
                              marketIdCarrinho:
                                carrinhoAtual?.market_id || mercadoPadraoId,
                              marcaItem: novaMarca || null,
                            }
                          );
                          if (c.precoUnitarioEstimado !== null) {
                            setPrecoManualForm(
                              c.precoUnitarioEstimado
                                .toFixed(2)
                                .replace(".", ",")
                            );
                          }
                        }}
                        className={`h-8 px-3 rounded-full text-xs font-bold shrink-0 border cursor-pointer ${
                          marcaItemForm.toLowerCase() === m.toLowerCase()
                            ? "bg-primary-light border-primary text-primary-hover"
                            : "bg-background border-border text-text-muted"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    handleRemoverItem(itemEditando.id);
                    setItemEditando(null);
                  }}
                  className="h-12 px-4 rounded-btn border border-budget-red text-budget-red font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Remover</span>
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 h-12 rounded-btn bg-primary hover:bg-primary-hover text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirmar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BOTTOM SHEET: CADASTRO RÁPIDO DE PRODUTO A PARTIR DA BUSCA */}
      {sheetNovoProdRapido && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end justify-center">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-card rounded-t-[24px] p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">
                Cadastrar e adicionar ao carrinho
              </h3>
              <button
                type="button"
                onClick={() => setSheetNovoProdRapido(false)}
                className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-text-muted cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSalvarProdRapidoEAdicionar}
              className="flex flex-col gap-3.5"
            >
              <div className="flex gap-2.5">
                <div className="w-20 flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-muted">
                    Emoji
                  </label>
                  <input
                    type="text"
                    value={emojiProdRapido}
                    onChange={(e) => setEmojiProdRapido(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder={
                      (setorProdRapidoId &&
                        mapaSetores.get(setorProdRapidoId)?.emoji) ||
                      "📦"
                    }
                    className="w-full h-12 text-center rounded-xl bg-background border border-border text-lg focus:outline-none focus:border-primary focus:placeholder-transparent"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-muted">
                    Nome do produto
                  </label>
                  <input
                    type="text"
                    value={nomeProdRapido}
                    onChange={(e) => setNomeProdRapido(e.target.value)}
                    className="w-full h-12 px-3.5 rounded-xl bg-background border border-border text-sm font-semibold text-text-main"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-muted">
                    Setor
                  </label>
                  <select
                    value={setorProdRapidoId}
                    onChange={(e) => setSetorProdRapidoId(e.target.value)}
                    className="w-full h-12 px-3 rounded-xl bg-background border border-border text-sm font-semibold text-text-main"
                  >
                    <option value="">Sem setor</option>
                    {setores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.emoji} {s.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-muted">
                    Unidade
                  </label>
                  <select
                    value={unidadeProdRapido}
                    onChange={(e) => setUnidadeProdRapido(e.target.value)}
                    className="w-full h-12 px-3 rounded-xl bg-background border border-border text-sm font-semibold text-text-main"
                  >
                    {UNIDADES_RAPIDAS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-text-muted">
                  Preço estimado inicial em R$ (opcional)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={precoProdRapido}
                  onChange={(e) => setPrecoProdRapido(e.target.value)}
                  placeholder="Ex: 9,90"
                  className="w-full h-12 px-3.5 rounded-xl bg-background border border-border text-sm font-extrabold text-text-main"
                />
              </div>

              <button
                type="submit"
                disabled={salvando}
                className="h-12 rounded-btn bg-primary hover:bg-primary-hover text-white font-extrabold text-sm flex items-center justify-center gap-2 mt-1 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>
                  {salvando ? "Adicionando..." : "Salvar e adicionar"}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

export default function CompraPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen p-5 bg-background">
          <div className="max-w-md mx-auto h-80 bg-border/60 rounded-card animate-pulse" />
        </main>
      }
    >
      <CompraPlanejamentoContent />
    </Suspense>
  );
}
