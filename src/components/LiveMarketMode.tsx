"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
  Check,
  Search,
  Trash2,
  ArrowUp,
  ArrowDown,
  Delete,
  AlertCircle,
  CreditCard,
  ShoppingBag,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  enfileirarOperacaoOffline,
  lerFilaOffline,
  processarFilaOffline,
} from "@/lib/offline-sync";
import {
  LIMITE_ORCAMENTO_ALERTA,
  LIMITE_ORCAMENTO_ESTOURO,
  calcularEstatisticasPreco,
  calcularEstimativaItemCarrinho,
  dataHojeISO,
  formatarMoeda,
  parseDecimalBR,
} from "@/lib/format";
import type {
  Cart,
  CartItem,
  FormaPagamento,
  GroupSettings,
  Market,
  MarketSectorOrder,
  Price,
  Product,
  Sector,
} from "@/lib/types";

const FORMAS_PAGAMENTO: FormaPagamento[] = [
  "Pix",
  "Crédito",
  "Débito",
  "Vale-alimentação",
  "Dinheiro",
  "Outro",
];

const UNIDADES_RAPIDAS = ["un", "kg", "g", "L", "ml", "pacote", "cx", "dz"];

interface LiveMarketModeProps {
  groupId: string;
  userId: string | null;
  carrinho: Cart;
  itensCarrinho: CartItem[];
  setItensCarrinho: React.Dispatch<React.SetStateAction<CartItem[]>>;
  produtos: Product[];
  setores: Sector[];
  mercados: Market[];
  precos: Price[];
  settings: GroupSettings | null;
  ordemSetoresMercado: MarketSectorOrder[];
  gastoMesPorSetor: Map<string, number>;
  aoVivoConectado?: boolean;
  pulsoRealtime?: boolean;
  onReload: (cartId?: string | null) => Promise<void>;
  onVoltarPlanejamento: () => void;
}

export default function LiveMarketMode({
  groupId,
  userId,
  carrinho,
  itensCarrinho,
  setItensCarrinho,
  produtos,
  setores,
  mercados,
  precos,
  settings,
  ordemSetoresMercado,
  gastoMesPorSetor,
  aoVivoConectado = false,
  pulsoRealtime = false,
  onReload,
  onVoltarPlanejamento,
}: LiveMarketModeProps) {
  const router = useRouter();

  const [sincronizando, setSincronizando] = useState(false);
  const [estaOffline, setEstaOffline] = useState(false);
  const [qtdFilaOffline, setQtdFilaOffline] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  // Monitora sinal de internet e sincroniza automaticamente a fila offline quando o sinal voltar (Seção 9)
  useEffect(() => {
    if (typeof window === "undefined") return;
    setEstaOffline(!window.navigator.onLine);

    lerFilaOffline().then((f) => setQtdFilaOffline(f.length));

    async function sincronizarQuandoOnline() {
      setEstaOffline(false);
      setSincronizando(true);
      try {
        const res = await processarFilaOffline();
        setQtdFilaOffline(res.restantes);
        if (res.sincronizadas > 0) {
          await onReload(carrinho.id);
        }
      } finally {
        setSincronizando(false);
      }
    }

    function aoFicarOffline() {
      setEstaOffline(true);
    }

    window.addEventListener("online", sincronizarQuandoOnline);
    window.addEventListener("offline", aoFicarOffline);
    return () => {
      window.removeEventListener("online", sincronizarQuandoOnline);
      window.removeEventListener("offline", aoFicarOffline);
    };
  }, [carrinho.id, onReload]);

  // Estado de swipe para remover item deslizando
  const [itemDeslizadoId, setItemDeslizadoId] = useState<string | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  // Estado de reordenação de setores (corredores do mercado)
  const [modoReordenarSetores, setModoReordenarSetores] = useState(false);
  const [setorArrastandoId, setSetorArrastandoId] = useState<string | null>(
    null
  );

  // Bottom Sheet 1: Preço do Item (fiel a 3-preco-do-item.html)
  const [itemPrecoAtivo, setItemPrecoAtivo] = useState<CartItem | null>(null);
  const [precoTextoSheet, setPrecoTextoSheet] = useState("");
  const [marcaSheet, setMarcaSheet] = useState("");
  const [novaMarcaDigitada, setNovaMarcaDigitada] = useState("");
  const [mostrarInputNovaMarca, setMostrarInputNovaMarca] = useState(false);
  const [qtdTextoSheet, setQtdTextoSheet] = useState("1");
  const [editandoQtdManual, setEditandoQtdManual] = useState(false);
  const [mostrarAtacadoSheet, setMostrarAtacadoSheet] = useState(false);
  const [ehAtacadoSheet, setEhAtacadoSheet] = useState(false);
  const [qtdMinAtacadoSheet, setQtdMinAtacadoSheet] = useState("6");
  const [precoAtacadoTextoSheet, setPrecoAtacadoTextoSheet] = useState("");

  // Bottom Sheet 2: Trocar Mercado do Carrinho
  const [sheetMercadoAberto, setSheetMercadoAberto] = useState(false);

  // Bottom Sheet 3: Botão Flutuante "+" (Busca instantânea e cadastro rápido)
  const [sheetAdicionarAberto, setSheetAdicionarAberto] = useState(false);
  const [buscaRapida, setBuscaRapida] = useState("");
  const [criandoProdutoNovo, setCriandoProdutoNovo] = useState(false);
  const [novoProdNome, setNovoProdNome] = useState("");
  const [novoProdSetorId, setNovoProdSetorId] = useState("");
  const [novoProdUnidade, setNovoProdUnidade] = useState("un");
  const [novoProdPreco, setNovoProdPreco] = useState("");

  // Bottom Sheet 4: Finalizar Compra com Pagamento Misto
  const [sheetFinalizarAberto, setSheetFinalizarAberto] = useState(false);
  const [pagamentosMistos, setPagamentosMistos] = useState<
    { id: string; forma_pagamento: FormaPagamento; valorTexto: string }[]
  >([]);
  const [finalizando, setFinalizando] = useState(false);

  // Mapas auxiliares
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

  const mercadoPadraoId = useMemo(() => {
    if (settings?.mercado_padrao_id) return settings.mercado_padrao_id;
    return mercados.find((m) => m.padrao)?.id || mercados[0]?.id || null;
  }, [settings, mercados]);

  const marketIdCarrinho = carrinho.market_id || mercadoPadraoId;
  const nomeMercadoAtual =
    (marketIdCarrinho && mapaMercados.get(marketIdCarrinho)?.nome) ||
    "Escolher mercado";

  const precosPorProduto = useMemo(() => {
    const map = new Map<string, Price[]>();
    precos.forEach((p) => {
      const lista = map.get(p.product_id) || [];
      lista.push(p);
      map.set(p.product_id, lista);
    });
    return map;
  }, [precos]);

  // Ordenação dos setores conforme os corredores do mercado escolhido
  const setoresOrdenados = useMemo(() => {
    if (!marketIdCarrinho) return setores;
    const mapaPos = new Map<string, number>();
    ordemSetoresMercado
      .filter((o) => o.market_id === marketIdCarrinho)
      .forEach((o) => mapaPos.set(o.sector_id, o.posicao));

    if (mapaPos.size === 0) return setores;

    return [...setores].sort((a, b) => {
      const posA = mapaPos.get(a.id) ?? a.ordem ?? 999;
      const posB = mapaPos.get(b.id) ?? b.ordem ?? 999;
      return posA - posB;
    });
  }, [setores, ordemSetoresMercado, marketIdCarrinho]);

  // Enriquecimento de cada item do carrinho (preço real vs estimado)
  const itensEnriquecidos = useMemo(() => {
    return itensCarrinho.map((item) => {
      const produto = mapaProdutos.get(item.product_id);
      const listaPrecos = precosPorProduto.get(item.product_id) || [];
      const calc = calcularEstimativaItemCarrinho(
        listaPrecos,
        Number(item.quantidade),
        {
          metodo: settings?.metodo_preco || "media",
          mesesMedia: settings?.meses_media || 3,
          marketIdCarrinho,
          marcaItem: item.marca,
        }
      );

      const precoEstimadoUnit =
        calc.precoUnitarioEstimado !== null
          ? calc.precoUnitarioEstimado
          : item.preco_estimado !== null
          ? Number(item.preco_estimado)
          : 0;

      const precoRealUnit =
        item.preco_real !== null ? Number(item.preco_real) : null;

      const qtd = Number(item.quantidade);
      const subtotalEstimado = precoEstimadoUnit * qtd;
      // Se o item está marcado como pego, usa o preço real (ou o estimado caso ainda não tenha digitado outro)
      const precoEfetivoUnit =
        precoRealUnit !== null ? precoRealUnit : precoEstimadoUnit;
      const subtotalReal = item.marcado ? precoEfetivoUnit * qtd : 0;

      return {
        item,
        produto,
        calc,
        precoEstimadoUnit,
        precoRealUnit,
        precoEfetivoUnit,
        subtotalEstimado,
        subtotalReal,
      };
    });
  }, [
    itensCarrinho,
    mapaProdutos,
    precosPorProduto,
    settings,
    marketIdCarrinho,
  ]);

  // Totais do topo fixo (conforme 2-modo-mercado.html)
  const qtdTotalItens = itensEnriquecidos.length;
  const qtdItensMarcados = itensEnriquecidos.filter(
    (x) => x.item.marcado
  ).length;
  const percentualProgresso =
    qtdTotalItens > 0 ? Math.round((qtdItensMarcados / qtdTotalItens) * 100) : 0;

  const totalRealNoCarrinho = useMemo(
    () => itensEnriquecidos.reduce((acc, x) => acc + x.subtotalReal, 0),
    [itensEnriquecidos]
  );

  const totalEstimadoGeral = useMemo(
    () => itensEnriquecidos.reduce((acc, x) => acc + x.subtotalEstimado, 0),
    [itensEnriquecidos]
  );

  // Agrupamento por setor com cálculo de orçamento do mês em tempo real
  const gruposPorSetor = useMemo(() => {
    const mapa = new Map<string, typeof itensEnriquecidos>();
    itensEnriquecidos.forEach((enriq) => {
      const secId = enriq.produto?.sector_id || "sem_setor";
      const lista = mapa.get(secId) || [];
      lista.push(enriq);
      mapa.set(secId, lista);
    });

    const listaGrupos: {
      sectorId: string;
      nome: string;
      emoji: string;
      subtotalSetor: number;
      statusOrcamento: "normal" | "verde" | "amarelo" | "vermelho";
      valorEstouro: number;
      percentualMes: number | null;
      itens: typeof itensEnriquecidos;
    }[] = [];

    const adicionarSetor = (
      secId: string,
      nome: string,
      emoji: string,
      orcamentoMensal: number | null
    ) => {
      const itens = mapa.get(secId) || [];
      if (itens.length === 0) return;

      // Soma o valor real dos itens marcados + estimado dos não marcados para projeção do setor
      const subtotalRealSetor = itens.reduce(
        (acc, x) =>
          acc + (x.item.marcado ? x.subtotalReal : x.subtotalEstimado),
        0
      );
      const subtotalPegosSetor = itens.reduce(
        (acc, x) => acc + (x.item.marcado ? x.subtotalReal : 0),
        0
      );

      const gastoAnteriorMes = gastoMesPorSetor.get(secId) || 0;
      const projecaoMes = gastoAnteriorMes + subtotalRealSetor;

      let statusOrcamento: "normal" | "verde" | "amarelo" | "vermelho" =
        "normal";
      let valorEstouro = 0;
      let percentualMes: number | null = null;

      if (orcamentoMensal !== null && orcamentoMensal > 0) {
        const razao = projecaoMes / orcamentoMensal;
        percentualMes = Math.round(razao * 100);
        if (razao > LIMITE_ORCAMENTO_ESTOURO) {
          statusOrcamento = "vermelho";
          valorEstouro = projecaoMes - orcamentoMensal;
        } else if (razao >= LIMITE_ORCAMENTO_ALERTA) {
          statusOrcamento = "amarelo";
        } else {
          statusOrcamento = "verde";
        }
      }

      listaGrupos.push({
        sectorId: secId,
        nome,
        emoji,
        subtotalSetor:
          subtotalPegosSetor > 0 ? subtotalPegosSetor : subtotalRealSetor,
        statusOrcamento,
        valorEstouro,
        percentualMes,
        itens,
      });
    };

    setoresOrdenados.forEach((s) =>
      adicionarSetor(
        s.id,
        s.nome,
        s.emoji,
        s.orcamento_mensal !== null ? Number(s.orcamento_mensal) : null
      )
    );

    if (mapa.has("sem_setor")) {
      adicionarSetor("sem_setor", "Outros", "🛒", null);
    }

    return listaGrupos;
  }, [itensEnriquecidos, setoresOrdenados, gastoMesPorSetor]);

  // --- Interação 1: Marcar / Desmarcar Item como Pego ---
  async function handleAlternarMarcado(enriq: (typeof itensEnriquecidos)[0]) {
    const { item, precoEfetivoUnit } = enriq;
    const novoMarcado = !item.marcado;

    // Se ainda não tem preço nenhum (nem estimado nem real) e está tentando marcar, abre o bottom sheet de preço
    if (novoMarcado && precoEfetivoUnit <= 0) {
      abrirBottomSheetPreco(enriq);
      return;
    }

    const novoPrecoReal =
      novoMarcado && item.preco_real === null
        ? precoEfetivoUnit
        : item.preco_real;

    // Atualização otimista
    setItensCarrinho((prev) =>
      prev.map((x) =>
        x.id === item.id
          ? { ...x, marcado: novoMarcado, preco_real: novoPrecoReal }
          : x
      )
    );

    if (typeof window !== "undefined" && !window.navigator.onLine) {
      const totalFila = await enfileirarOperacaoOffline({
        tipo: "UPDATE_CART_ITEM",
        alvoId: item.id,
        dados: { marcado: novoMarcado, preco_real: novoPrecoReal },
      });
      setQtdFilaOffline(totalFila);
      return;
    }

    setSincronizando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("cart_items")
        .update({
          marcado: novoMarcado,
          preco_real: novoPrecoReal,
        })
        .eq("id", item.id);
      if (error) throw error;
    } catch {
      const totalFila = await enfileirarOperacaoOffline({
        tipo: "UPDATE_CART_ITEM",
        alvoId: item.id,
        dados: { marcado: novoMarcado, preco_real: novoPrecoReal },
      });
      setQtdFilaOffline(totalFila);
    } finally {
      setSincronizando(false);
    }
  }

  // --- Interação 2: Deslizar para Remover Item ---
  async function handleRemoverItem(itemId: string) {
    setItensCarrinho((prev) => prev.filter((x) => x.id !== itemId));
    setItemDeslizadoId(null);

    if (typeof window !== "undefined" && !window.navigator.onLine) {
      const totalFila = await enfileirarOperacaoOffline({
        tipo: "DELETE_CART_ITEM",
        alvoId: itemId,
        dados: {},
      });
      setQtdFilaOffline(totalFila);
      return;
    }

    setSincronizando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("cart_items")
        .delete()
        .eq("id", itemId);
      if (error) throw error;
    } catch {
      const totalFila = await enfileirarOperacaoOffline({
        tipo: "DELETE_CART_ITEM",
        alvoId: itemId,
        dados: {},
      });
      setQtdFilaOffline(totalFila);
    } finally {
      setSincronizando(false);
    }
  }

  // --- Interação 3: Reordenar Setores conforme corredores do mercado ---
  async function salvarNovaOrdemSetores(novaListaIdsSetores: string[]) {
    if (!marketIdCarrinho) return;
    // Monta a ordem completa mantendo os setores visíveis na frente
    const idsRestantes = setoresOrdenados
      .map((s) => s.id)
      .filter((id) => !novaListaIdsSetores.includes(id));
    const todosIds = [...novaListaIdsSetores, ...idsRestantes].filter(
      (id) => id !== "sem_setor"
    );

    const registros = todosIds.map((secId, index) => ({
      market_id: marketIdCarrinho,
      sector_id: secId,
      group_id: groupId,
      posicao: index + 1,
    }));

    if (typeof window !== "undefined" && !window.navigator.onLine) {
      const totalFila = await enfileirarOperacaoOffline({
        tipo: "REORDER_SECTORS",
        alvoId: marketIdCarrinho,
        dados: { group_id: groupId, ordens: registros },
      });
      setQtdFilaOffline(totalFila);
      return;
    }

    setSincronizando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("market_sector_order")
        .upsert(registros, {
          onConflict: "market_id,sector_id",
        });
      if (error) throw error;
      await onReload(carrinho.id);
    } catch {
      const totalFila = await enfileirarOperacaoOffline({
        tipo: "REORDER_SECTORS",
        alvoId: marketIdCarrinho,
        dados: { group_id: groupId, ordens: registros },
      });
      setQtdFilaOffline(totalFila);
    } finally {
      setSincronizando(false);
    }
  }

  async function moverSetor(sectorId: string, direcao: -1 | 1) {
    const idsVisiveis = gruposPorSetor
      .map((g) => g.sectorId)
      .filter((id) => id !== "sem_setor");
    const idx = idsVisiveis.indexOf(sectorId);
    if (idx === -1) return;
    const novoIdx = idx + direcao;
    if (novoIdx < 0 || novoIdx >= idsVisiveis.length) return;

    const copia = [...idsVisiveis];
    const [removido] = copia.splice(idx, 1);
    copia.splice(novoIdx, 0, removido);
    await salvarNovaOrdemSetores(copia);
  }

  async function handleDropSetor(targetSectorId: string) {
    if (
      !setorArrastandoId ||
      setorArrastandoId === targetSectorId ||
      targetSectorId === "sem_setor"
    ) {
      setSetorArrastandoId(null);
      return;
    }

    const idsVisiveis = gruposPorSetor
      .map((g) => g.sectorId)
      .filter((id) => id !== "sem_setor");
    const idxOrigem = idsVisiveis.indexOf(setorArrastandoId);
    const idxDestino = idsVisiveis.indexOf(targetSectorId);

    if (idxOrigem !== -1 && idxDestino !== -1) {
      const copia = [...idsVisiveis];
      const [movido] = copia.splice(idxOrigem, 1);
      copia.splice(idxDestino, 0, movido);
      setSetorArrastandoId(null);
      await salvarNovaOrdemSetores(copia);
    } else {
      setSetorArrastandoId(null);
    }
  }

  // --- Interação 4: Bottom Sheet de Preço do Item (3-preco-do-item.html) ---
  function abrirBottomSheetPreco(enriq: (typeof itensEnriquecidos)[0]) {
    setErro(null);
    const { item, precoRealUnit, precoEstimadoUnit, calc } = enriq;
    setItemPrecoAtivo(item);

    const valorInicial =
      precoRealUnit !== null
        ? precoRealUnit
        : precoEstimadoUnit > 0
        ? precoEstimadoUnit
        : null;

    setPrecoTextoSheet(
      valorInicial !== null ? valorInicial.toFixed(2).replace(".", ",") : ""
    );
    setMarcaSheet(item.marca || "");
    setNovaMarcaDigitada("");
    setMostrarInputNovaMarca(false);
    setQtdTextoSheet(String(Number(item.quantidade)).replace(".", ","));
    setEditandoQtdManual(false);
    setMostrarAtacadoSheet(item.atacado_aplicado);
    setEhAtacadoSheet(item.atacado_aplicado);
    setQtdMinAtacadoSheet(
      calc.dicaAtacadoDisponivel
        ? String(calc.dicaAtacadoDisponivel.quantidadeMinima)
        : "6"
    );
    setPrecoAtacadoTextoSheet(
      calc.dicaAtacadoDisponivel
        ? calc.dicaAtacadoDisponivel.precoAtacado.toFixed(2).replace(".", ",")
        : ""
    );
  }

  // Teclado numérico grande do Bottom Sheet (3-preco-do-item.html)
  function handleTeclaNumerica(tecla: string) {
    setPrecoTextoSheet((atual) => {
      if (tecla === "BACKSPACE") {
        return atual.slice(0, -1);
      }
      if (tecla === ",") {
        if (atual.includes(",")) return atual;
        return atual === "" ? "0," : `${atual},`;
      }
      // Limita a 2 casas decimais após a vírgula
      const partes = atual.split(",");
      if (partes.length === 2 && partes[1].length >= 2) {
        return atual;
      }
      return `${atual}${tecla}`;
    });
  }

  function alterarQtdNoSheet(delta: number) {
    const atual = parseDecimalBR(qtdTextoSheet) || 1;
    const prod = itemPrecoAtivo
      ? mapaProdutos.get(itemPrecoAtivo.product_id)
      : null;
    const ehPeso = prod?.unidade === "kg" || !Number.isInteger(atual);
    const passo = ehPeso ? 0.2 : 1;
    const novo = Math.max(ehPeso ? 0.1 : 1, Number((atual + delta * passo).toFixed(3)));
    setQtdTextoSheet(String(novo).replace(".", ","));
  }

  // Estatísticas para o chip discreto de comparação no Bottom Sheet ("Média de 3 meses: R$ 47,10 · ▲ 6%")
  const comparacaoItemAtivo = useMemo(() => {
    if (!itemPrecoAtivo) return null;
    const lista = precosPorProduto.get(itemPrecoAtivo.product_id) || [];
    const stats = calcularEstatisticasPreco(lista, {
      metodo: settings?.metodo_preco || "media",
      mesesMedia: settings?.meses_media || 3,
      marketIdPreferencial: marketIdCarrinho,
      marcaPreferencial: marcaSheet || null,
    });

    const valorDigitado = parseDecimalBR(precoTextoSheet);
    const mediaRef = stats.mediaPeriodo;
    let diffPercent: number | null = null;
    if (valorDigitado > 0 && mediaRef !== null && mediaRef > 0) {
      diffPercent = Math.round(((valorDigitado - mediaRef) / mediaRef) * 100);
    }

    // Marcas conhecidas deste produto (ou gerais do grupo)
    const marcasProd = new Set<string>();
    lista.forEach((p) => {
      if (p.marca && p.marca.trim()) marcasProd.add(p.marca.trim());
    });
    if (marcaSheet && marcaSheet.trim()) {
      marcasProd.add(marcaSheet.trim());
    }
    precos.forEach((p) => {
      if (marcasProd.size < 4 && p.marca && p.marca.trim()) {
        marcasProd.add(p.marca.trim());
      }
    });

    return {
      stats,
      valorDigitado,
      diffPercent,
      marcasSugeridas: Array.from(marcasProd).slice(0, 5),
    };
  }, [
    itemPrecoAtivo,
    precosPorProduto,
    settings,
    marketIdCarrinho,
    marcaSheet,
    precoTextoSheet,
    precos,
  ]);

  async function handleSalvarPrecoItem() {
    if (!itemPrecoAtivo) return;
    const qtdFinal = parseDecimalBR(qtdTextoSheet);
    if (qtdFinal <= 0) {
      setErro("Informe uma quantidade válida.");
      return;
    }

    let precoUnitarioFinal = parseDecimalBR(precoTextoSheet);
    const precoAtacadoNum = parseDecimalBR(precoAtacadoTextoSheet);
    const qtdMinAtacadoNum = Math.max(2, parseDecimalBR(qtdMinAtacadoSheet) || 2);

    let usarAtacado = false;
    if (ehAtacadoSheet && precoAtacadoNum > 0 && qtdFinal >= qtdMinAtacadoNum) {
      precoUnitarioFinal = precoAtacadoNum;
      usarAtacado = true;
    }

    if (precoUnitarioFinal <= 0) {
      setErro("Digite um preço maior que zero.");
      return;
    }

    const marcaFinal = marcaSheet.trim() || null;

    // Atualização otimista imediata na lista
    setItensCarrinho((prev) =>
      prev.map((x) =>
        x.id === itemPrecoAtivo.id
          ? {
              ...x,
              quantidade: qtdFinal,
              marca: marcaFinal,
              preco_real: precoUnitarioFinal,
              marcado: true,
              atacado_aplicado: usarAtacado,
            }
          : x
      )
    );

    const itemSalvo = itemPrecoAtivo;
    setItemPrecoAtivo(null);

    const payloadUpdate = {
      quantidade: qtdFinal,
      marca: marcaFinal,
      preco_real: precoUnitarioFinal,
      marcado: true,
      atacado_aplicado: usarAtacado,
    };

    if (typeof window !== "undefined" && !window.navigator.onLine) {
      const totalFila = await enfileirarOperacaoOffline({
        tipo: "UPDATE_CART_ITEM",
        alvoId: itemSalvo.id,
        dados: payloadUpdate,
      });
      setQtdFilaOffline(totalFila);
      return;
    }

    setSincronizando(true);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("cart_items")
        .update(payloadUpdate)
        .eq("id", itemSalvo.id);
      if (error) throw error;

      // Se o usuário também preencheu um preço de atacado nas opções, registra no histórico de atacado
      if (ehAtacadoSheet && precoAtacadoNum > 0 && marketIdCarrinho) {
        await supabase.from("prices").insert({
          group_id: groupId,
          product_id: itemSalvo.product_id,
          market_id: marketIdCarrinho,
          marca: marcaFinal,
          valor: precoAtacadoNum,
          tipo: "atacado",
          quantidade_minima: qtdMinAtacadoNum,
          data: dataHojeISO(),
          criado_por: userId,
        });
      }
    } catch {
      const totalFila = await enfileirarOperacaoOffline({
        tipo: "UPDATE_CART_ITEM",
        alvoId: itemSalvo.id,
        dados: payloadUpdate,
      });
      setQtdFilaOffline(totalFila);
    } finally {
      setSincronizando(false);
    }
  }

  // --- Interação 5: Botão Flutuante "+" (Adicionar produto rápido no mercado) ---
  const produtosBuscaFlutuante = useMemo(() => {
    const t = buscaRapida.trim().toLowerCase();
    if (!t) return produtos.slice(0, 8);
    return produtos.filter((p) => p.nome.toLowerCase().includes(t)).slice(0, 8);
  }, [produtos, buscaRapida]);

  async function handleAdicionarProdutoRapidoAoVivo(prod: Product) {
    const existente = itensCarrinho.find((i) => i.product_id === prod.id);
    const supabase = createClient();

    if (existente) {
      const novaQtd = Number(existente.quantidade) + 1;
      setItensCarrinho((prev) =>
        prev.map((x) =>
          x.id === existente.id ? { ...x, quantidade: novaQtd } : x
        )
      );
      setSheetAdicionarAberto(false);
      setBuscaRapida("");

      if (typeof window !== "undefined" && !window.navigator.onLine) {
        const totalFila = await enfileirarOperacaoOffline({
          tipo: "UPDATE_CART_ITEM",
          alvoId: existente.id,
          dados: { quantidade: novaQtd },
        });
        setQtdFilaOffline(totalFila);
        return;
      }

      setSincronizando(true);
      try {
        const { error } = await supabase
          .from("cart_items")
          .update({ quantidade: novaQtd })
          .eq("id", existente.id);
        if (error) throw error;
      } catch {
        const totalFila = await enfileirarOperacaoOffline({
          tipo: "UPDATE_CART_ITEM",
          alvoId: existente.id,
          dados: { quantidade: novaQtd },
        });
        setQtdFilaOffline(totalFila);
      } finally {
        setSincronizando(false);
      }
      return;
    }

    const lista = precosPorProduto.get(prod.id) || [];
    const calc = calcularEstimativaItemCarrinho(lista, 1, {
      metodo: settings?.metodo_preco || "media",
      mesesMedia: settings?.meses_media || 3,
      marketIdCarrinho,
    });

    const tempId = `temp-${Date.now()}`;
    const itemOtimista: CartItem = {
      id: tempId,
      cart_id: carrinho.id,
      group_id: groupId,
      product_id: prod.id,
      marca: null,
      quantidade: 1,
      preco_estimado: calc.precoUnitarioEstimado,
      preco_real: null,
      marcado: false,
      atacado_aplicado: calc.atacadoAplicado,
      ordem: itensCarrinho.length + 1,
      atualizado_em: new Date().toISOString(),
    };

    setItensCarrinho((prev) => [...prev, itemOtimista]);
    setSheetAdicionarAberto(false);
    setBuscaRapida("");

    const payloadInsert = {
      cart_id: carrinho.id,
      group_id: groupId,
      product_id: prod.id,
      quantidade: 1,
      preco_estimado: calc.precoUnitarioEstimado,
      preco_real: null,
      marcado: false,
      atacado_aplicado: calc.atacadoAplicado,
      ordem: itensCarrinho.length + 1,
    };

    if (typeof window !== "undefined" && !window.navigator.onLine) {
      const totalFila = await enfileirarOperacaoOffline({
        tipo: "INSERT_CART_ITEM",
        alvoId: tempId,
        dados: payloadInsert,
      });
      setQtdFilaOffline(totalFila);
      return;
    }

    setSincronizando(true);
    try {
      const { data: novoItem, error } = await supabase
        .from("cart_items")
        .insert(payloadInsert)
        .select()
        .single();

      if (error || !novoItem) throw error;

      setItensCarrinho((prev) =>
        prev.map((x) => (x.id === tempId ? (novoItem as CartItem) : x))
      );
    } catch {
      const totalFila = await enfileirarOperacaoOffline({
        tipo: "INSERT_CART_ITEM",
        alvoId: tempId,
        dados: payloadInsert,
      });
      setQtdFilaOffline(totalFila);
    } finally {
      setSincronizando(false);
    }
  }

  async function handleCriarECadastrarProdutoNoMercado(e: React.FormEvent) {
    e.preventDefault();
    if (!novoProdNome.trim()) return;
    setSincronizando(true);
    try {
      const supabase = createClient();
      const precoNum = parseDecimalBR(novoProdPreco);

      const { data: prodCriado, error } = await supabase
        .from("products")
        .insert({
          group_id: groupId,
          nome: novoProdNome.trim(),
          sector_id: novoProdSetorId || setores[0]?.id || null,
          unidade: novoProdUnidade,
          ativo: true,
        })
        .select()
        .single();

      if (error || !prodCriado) throw error;
      const p = prodCriado as Product;

      const { data: itemCriado } = await supabase
        .from("cart_items")
        .insert({
          cart_id: carrinho.id,
          group_id: groupId,
          product_id: p.id,
          quantidade: 1,
          preco_estimado: precoNum > 0 ? precoNum : null,
          preco_real: precoNum > 0 ? precoNum : null,
          marcado: precoNum > 0,
          atacado_aplicado: false,
          ordem: itensCarrinho.length + 1,
        })
        .select()
        .single();

      if (itemCriado) {
        setItensCarrinho((prev) => [...prev, itemCriado as CartItem]);
      }

      setCriandoProdutoNovo(false);
      setSheetAdicionarAberto(false);
      setBuscaRapida("");
      await onReload(carrinho.id);
    } catch {
      setErro("Não foi possível cadastrar o produto.");
    } finally {
      setSincronizando(false);
    }
  }

  // --- Interação 6: Trocar Mercado no Modo Mercado ---
  async function handleSelecionarMercado(novoMarketId: string) {
    setSheetMercadoAberto(false);
    setSincronizando(true);
    try {
      const supabase = createClient();
      await supabase
        .from("carts")
        .update({ market_id: novoMarketId })
        .eq("id", carrinho.id);
      await onReload(carrinho.id);
    } finally {
      setSincronizando(false);
    }
  }

  // --- Interação 7: Finalizar Compra com Pagamento Misto (Seção 6) ---
  function abrirModalFinalizarCompra() {
    setErro(null);
    // Inicia vazio (opcional) ou permite adicionar 1 ou mais formas
    setPagamentosMistos([]);
    setSheetFinalizarAberto(true);
  }

  function adicionarLinhaPagamento(formaPadrao: FormaPagamento = "Pix") {
    const somaAtual = pagamentosMistos.reduce(
      (acc, p) => acc + parseDecimalBR(p.valorTexto),
      0
    );
    const restante = Math.max(0, totalRealNoCarrinho - somaAtual);
    setPagamentosMistos((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        forma_pagamento: formaPadrao,
        valorTexto:
          restante > 0 ? restante.toFixed(2).replace(".", ",") : "0,00",
      },
    ]);
  }

  const somaPagamentosInformados = useMemo(
    () =>
      pagamentosMistos.reduce(
        (acc, p) => acc + parseDecimalBR(p.valorTexto),
        0
      ),
    [pagamentosMistos]
  );

  const diferencaPagamento = useMemo(
    () => Number((somaPagamentosInformados - totalRealNoCarrinho).toFixed(2)),
    [somaPagamentosInformados, totalRealNoCarrinho]
  );

  async function handleConfirmarFinalizacao() {
    setFinalizando(true);
    setErro(null);
    try {
      const supabase = createClient();
      const hoje = dataHojeISO();

      // 1. Grava os preços reais no histórico `prices` evitando duplicar (índice único cart_item_id)
      if (marketIdCarrinho) {
        const itensPegos = itensEnriquecidos.filter(
          (x) => x.item.marcado && x.precoEfetivoUnit > 0
        );

        for (const enriq of itensPegos) {
          const { item, precoEfetivoUnit } = enriq;

          // Verifica se já existe preço com este cart_item_id
          const { data: existente } = await supabase
            .from("prices")
            .select("id")
            .eq("cart_item_id", item.id)
            .maybeSingle();

          if (existente?.id) {
            await supabase
              .from("prices")
              .update({
                market_id: marketIdCarrinho,
                marca: item.marca,
                valor: precoEfetivoUnit,
                tipo: item.atacado_aplicado ? "atacado" : "varejo",
                data: hoje,
              })
              .eq("id", existente.id);
          } else {
            await supabase.from("prices").insert({
              group_id: groupId,
              product_id: item.product_id,
              market_id: marketIdCarrinho,
              marca: item.marca,
              valor: precoEfetivoUnit,
              tipo: item.atacado_aplicado ? "atacado" : "varejo",
              quantidade_minima: 1,
              data: hoje,
              criado_por: userId,
              cart_item_id: item.id,
            });
          }

          // Garante que o preco_real ficou salvo no cart_item
          if (item.preco_real === null) {
            await supabase
              .from("cart_items")
              .update({ preco_real: precoEfetivoUnit })
              .eq("id", item.id);
          }
        }
      }

      // 2. Salva os pagamentos (se informados)
      await supabase
        .from("cart_payments")
        .delete()
        .eq("cart_id", carrinho.id);

      const pagamentosValidos = pagamentosMistos
        .map((p) => ({
          cart_id: carrinho.id,
          group_id: groupId,
          forma_pagamento: p.forma_pagamento,
          valor: parseDecimalBR(p.valorTexto),
        }))
        .filter((p) => p.valor > 0);

      if (pagamentosValidos.length > 0) {
        await supabase.from("cart_payments").insert(pagamentosValidos);
      }

      // 3. Atualiza status do carrinho para finalizado
      await supabase
        .from("carts")
        .update({
          status: "finalizado",
          finalizado_em: new Date().toISOString(),
        })
        .eq("id", carrinho.id);

      setSheetFinalizarAberto(false);
      router.push("/");
      router.refresh();
    } catch {
      setErro("Não foi possível finalizar a compra. Tente novamente.");
    } finally {
      setFinalizando(false);
    }
  }

  const produtoAtivoSheet = itemPrecoAtivo
    ? mapaProdutos.get(itemPrecoAtivo.product_id) || null
    : null;
  const setorAtivoSheet =
    produtoAtivoSheet?.sector_id
      ? mapaSetores.get(produtoAtivoSheet.sector_id) || null
      : null;

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-main w-full max-w-full overflow-x-hidden">
      {/* TOPO FIXO DO MODO MERCADO (Fiel a 2-modo-mercado.html) */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border/60">
        <div className="w-full max-w-md mx-auto">
          {/* Linha 1: Botão Fechar (X), Seletor de Mercado e Status Salvo */}
          <div className="flex items-center gap-3 px-4 pt-3 pb-1">
            <button
              type="button"
              onClick={onVoltarPlanejamento}
              aria-label="Voltar ao planejamento"
              className="w-11 h-11 rounded-full bg-card border border-border flex items-center justify-center shrink-0 cursor-pointer"
            >
              <X className="w-5 h-5 text-text-main" />
            </button>

            <button
              type="button"
              onClick={() => setSheetMercadoAberto(true)}
              className="flex-1 h-11 rounded-full bg-card border border-border flex items-center justify-center gap-1.5 px-4 text-sm font-bold text-text-main truncate cursor-pointer"
            >
              <span className="truncate">{nomeMercadoAtual}</span>
              <ChevronDown className="w-4 h-4 text-text-muted shrink-0" />
            </button>

            <div
              className="w-24 flex items-center justify-end gap-1.5 text-xs font-semibold text-text-muted shrink-0"
              title={
                estaOffline || qtdFilaOffline > 0
                  ? "As alterações estão salvas no aparelho e sincronizam automaticamente quando a conexão voltar"
                  : "Sincronizado com o servidor"
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  estaOffline
                    ? "bg-text-muted"
                    : sincronizando || pulsoRealtime || qtdFilaOffline > 0
                      ? "bg-primary animate-ping"
                      : aoVivoConectado
                        ? "bg-primary"
                        : "bg-text-muted"
                }`}
              />
              <span>
                {estaOffline
                  ? "Offline"
                  : sincronizando || qtdFilaOffline > 0
                    ? "Sincronizando"
                    : aoVivoConectado
                      ? "Ao vivo"
                      : "Salvo"}
              </span>
            </div>
          </div>

          {/* Linha 2: Total Real em Destaque + Estimado ao lado + Barra de Progresso */}
          <div className="px-5 pt-2 pb-3">
            <div className="flex items-center justify-between">
              <div className="text-[13px] text-text-muted font-semibold">
                No carrinho · {qtdItensMarcados} de {qtdTotalItens}{" "}
                {qtdTotalItens === 1 ? "item" : "itens"}
              </div>
              <button
                type="button"
                onClick={() => setModoReordenarSetores(!modoReordenarSetores)}
                className={`text-xs font-bold px-2.5 py-1 rounded-full cursor-pointer ${
                  modoReordenarSetores
                    ? "bg-primary text-white"
                    : "text-primary hover:bg-primary-light"
                }`}
              >
                {modoReordenarSetores
                  ? "Concluir ordem"
                  : "Ordenar corredores"}
              </button>
            </div>

            <div className="flex items-baseline gap-2.5 mt-0.5">
              <span className="text-[36px] font-extrabold leading-[44px] text-text-main">
                {formatarMoeda(totalRealNoCarrinho)}
              </span>
              <span className="text-[14px] text-text-muted font-medium">
                estimado {formatarMoeda(totalEstimadoGeral)}
              </span>
            </div>

            <div className="h-2 rounded bg-border mt-2 overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${percentualProgresso}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* LISTA DE SETORES E ITENS (Com espaço extra pb-44 no fim para o botão "+" nunca cobrir o último item — Seção 7) */}
      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-3 pb-44 flex flex-col gap-3 min-w-0 max-w-full">
        {erro && (
          <div className="bg-budget-red-bg text-budget-red-text px-4 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {gruposPorSetor.length === 0 ? (
          <div className="bg-card border border-border rounded-card p-6 text-center flex flex-col items-center gap-3 mt-4">
            <ShoppingBag className="w-10 h-10 text-primary" />
            <div className="text-base font-extrabold">
              Nenhum item neste carrinho
            </div>
            <p className="text-xs text-text-muted">
              Toque no botão azul <strong>+</strong> no canto inferior direito
              para adicionar produtos agora.
            </p>
          </div>
        ) : (
          gruposPorSetor.map((grupoSetor, idxGrupo) => {
            const bgSetor =
              grupoSetor.statusOrcamento === "vermelho"
                ? "bg-[#FCEBEA]"
                : grupoSetor.statusOrcamento === "amarelo"
                ? "bg-[#FFF3D6]"
                : "bg-[#ECEEF5]";

            return (
              <div
                key={grupoSetor.sectorId}
                draggable={
                  modoReordenarSetores && grupoSetor.sectorId !== "sem_setor"
                }
                onDragStart={() => setSetorArrastandoId(grupoSetor.sectorId)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDropSetor(grupoSetor.sectorId)}
                className={`flex flex-col transition-opacity ${
                  setorArrastandoId === grupoSetor.sectorId ? "opacity-50" : ""
                }`}
              >
                {/* Cabeçalho do Setor conforme 2-modo-mercado.html */}
                <div className={`px-2.5 py-2 rounded-xl ${bgSetor}`}>
                  <div className="flex items-center gap-2">
                    {/* Ícone de 6 pontos (grip de reordenação dos corredores) */}
                    <button
                      type="button"
                      onClick={() =>
                        setModoReordenarSetores(!modoReordenarSetores)
                      }
                      title="Toque ou arraste para ordenar os corredores deste mercado"
                      className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text-main p-0.5"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <circle cx="9" cy="6" r="1.6" />
                        <circle cx="15" cy="6" r="1.6" />
                        <circle cx="9" cy="12" r="1.6" />
                        <circle cx="15" cy="12" r="1.6" />
                        <circle cx="9" cy="18" r="1.6" />
                        <circle cx="15" cy="18" r="1.6" />
                      </svg>
                    </button>

                    <span className="text-[18px] leading-5">
                      {grupoSetor.emoji}
                    </span>
                    <span className="flex-1 text-[15px] font-bold text-text-main truncate">
                      {grupoSetor.nome}
                    </span>

                    {modoReordenarSetores &&
                    grupoSetor.sectorId !== "sem_setor" ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idxGrupo === 0}
                          onClick={() => moverSetor(grupoSetor.sectorId, -1)}
                          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center disabled:opacity-40 cursor-pointer"
                          aria-label="Subir corredor"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={idxGrupo === gruposPorSetor.length - 1}
                          onClick={() => moverSetor(grupoSetor.sectorId, 1)}
                          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center disabled:opacity-40 cursor-pointer"
                          aria-label="Descer corredor"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[13px] font-semibold text-text-muted">
                        {formatarMoeda(grupoSetor.subtotalSetor)}
                      </span>
                    )}
                  </div>

                  {/* Linha pequena de aviso de orçamento do setor (fiel a 2-modo-mercado.html) */}
                  {grupoSetor.statusOrcamento === "vermelho" && (
                    <div className="pl-[26px] mt-0.5 text-[12px] font-semibold text-[#B3261E]">
                      Passa do orçamento do mês em{" "}
                      {formatarMoeda(grupoSetor.valorEstouro)}
                    </div>
                  )}
                  {grupoSetor.statusOrcamento === "amarelo" &&
                    grupoSetor.percentualMes !== null && (
                      <div className="pl-[26px] mt-0.5 text-[12px] font-semibold text-[#7A5000]">
                        Chega a {grupoSetor.percentualMes}% do orçamento do mês
                      </div>
                    )}
                </div>

                {/* Lista de Itens do Setor */}
                <div className="mt-1 bg-card border border-border rounded-[14px] overflow-hidden divide-y divide-border">
                  {grupoSetor.itens.map((enriq) => {
                    const {
                      item,
                      produto,
                      calc,
                      precoEstimadoUnit,
                      precoEfetivoUnit,
                      subtotalEstimado,
                      subtotalReal,
                    } = enriq;
                    const un = produto?.unidade || "un";
                    const qtdFormatada = String(
                      Number(item.quantidade)
                    ).replace(".", ",");
                    const deslizado = itemDeslizadoId === item.id;

                    return (
                      <div
                        key={item.id}
                        onTouchStart={(e) => {
                          touchStartXRef.current = e.touches[0].clientX;
                        }}
                        onTouchEnd={(e) => {
                          if (touchStartXRef.current === null) return;
                          const diffX =
                            e.changedTouches[0].clientX -
                            touchStartXRef.current;
                          if (diffX < -50) {
                            setItemDeslizadoId(item.id);
                          } else if (diffX > 40) {
                            setItemDeslizadoId(null);
                          }
                          touchStartXRef.current = null;
                        }}
                        className="relative flex items-center min-h-[56px] px-3 py-2 gap-3 hover:bg-background/40 transition-colors"
                      >
                        {/* Bolinha de marcar item como pego (26x26px conforme 2-modo-mercado.html) */}
                        <button
                          type="button"
                          onClick={() => handleAlternarMarcado(enriq)}
                          aria-label={
                            item.marcado
                              ? `Desmarcar ${produto?.nome}`
                              : `Marcar ${produto?.nome} como pego`
                          }
                          className="w-8 h-8 flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          {item.marcado ? (
                            <span className="w-[26px] h-[26px] rounded-full bg-primary flex items-center justify-center">
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#FFFFFF"
                                strokeWidth="3.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M5 12.5l4.5 4.5L19 7.5" />
                              </svg>
                            </span>
                          ) : (
                            <span className="w-[26px] h-[26px] rounded-full border-2 border-[#A9AFBE] block" />
                          )}
                        </button>

                        {/* Nome e detalhe da quantidade × preço · marca (Tocar abre o Bottom Sheet de Preço!) */}
                        <div
                          onClick={() => abrirBottomSheetPreco(enriq)}
                          className="flex-1 min-w-0 cursor-pointer"
                        >
                          <div className="text-[15px] font-semibold text-text-main truncate">
                            {produto?.nome || "Produto"}
                          </div>
                          <div className="text-[12px] text-text-muted truncate">
                            {item.marcado ? (
                              <>
                                {qtdFormatada} {un} ×{" "}
                                {formatarMoeda(precoEfetivoUnit)}
                                {item.marca ? ` · ${item.marca}` : ""}
                              </>
                            ) : (
                              <>
                                {qtdFormatada} {un} · est.{" "}
                                {precoEstimadoUnit > 0
                                  ? formatarMoeda(precoEstimadoUnit)
                                  : "digitar"}
                                {item.marca ? ` · ${item.marca}` : ""}
                              </>
                            )}
                          </div>
                          {calc.atacadoAplicado && (
                            <div className="text-[11px] font-bold text-primary">
                              Atacado · economiza{" "}
                              {formatarMoeda(calc.economiaAtacadoTotal)}
                            </div>
                          )}
                        </div>

                        {/* Preço Total do Item à direita (Tocar abre o Bottom Sheet de Preço!) */}
                        {deslizado ? (
                          <button
                            type="button"
                            onClick={() => handleRemoverItem(item.id)}
                            className="h-9 px-3 rounded-xl bg-budget-red text-white text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remover</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => abrirBottomSheetPreco(enriq)}
                            className={`text-[15px] shrink-0 cursor-pointer ${
                              item.marcado
                                ? "font-bold text-text-main"
                                : "font-semibold text-text-muted"
                            }`}
                          >
                            {item.marcado
                              ? formatarMoeda(subtotalReal)
                              : subtotalEstimado > 0
                              ? `~ ${formatarMoeda(subtotalEstimado)}`
                              : "R$ —"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* BOTÃO FLUTUANTE "+" PARA ADICIONAR PRODUTO RÁPIDO (56x56px conforme 2-modo-mercado.html) */}
      <div className="fixed bottom-24 left-0 right-0 pointer-events-none z-30">
        <div className="w-full max-w-md mx-auto px-5 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setBuscaRapida("");
              setCriandoProdutoNovo(false);
              setSheetAdicionarAberto(true);
            }}
            aria-label="Adicionar produto"
            className="pointer-events-auto w-14 h-14 rounded-full bg-primary hover:bg-primary-hover text-white flex items-center justify-center shadow-[0_6px_16px_rgba(59,76,202,0.35)] cursor-pointer transition-transform active:scale-95"
          >
            <Plus className="w-7 h-7" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* RODAPÉ FIXO COM BOTÃO "FINALIZAR COMPRA" (Fiel a 2-modo-mercado.html) */}
      <footer className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-30">
        <div className="w-full max-w-md mx-auto px-4 pt-3 pb-5">
          <button
            type="button"
            onClick={abrirModalFinalizarCompra}
            className="w-full h-[52px] rounded-2xl bg-[#14171F] hover:bg-black text-white text-[16px] font-bold flex items-center justify-center cursor-pointer"
          >
            Finalizar compra
          </button>
        </div>
      </footer>

      {/* =====================================================================
          BOTTOM SHEET 1: PREÇO DO ITEM (Fiel a 3-preco-do-item.html)
         ===================================================================== */}
      {itemPrecoAtivo && produtoAtivoSheet && comparacaoItemAtivo && (
        <div className="fixed inset-0 z-50 bg-[#14171F]/50 flex items-end justify-center">
          <div className="w-full max-w-md max-h-[94dvh] overflow-y-auto bg-card rounded-t-[24px] px-5 pt-3 pb-5 flex flex-col">
            {/* Puxador */}
            <div className="w-10 h-1 rounded-full bg-[#D5D8E2] mx-auto mb-3" />

            {/* Cabeçalho do Produto */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary-light flex items-center justify-center text-[22px] shrink-0">
                {produtoAtivoSheet.emoji || setorAtivoSheet?.emoji || "📦"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[20px] font-extrabold leading-[26px] text-text-main truncate">
                  {produtoAtivoSheet.nome}
                </div>
                <div className="text-xs text-text-muted truncate">
                  {setorAtivoSheet?.nome || "Setor"} · preço por{" "}
                  {produtoAtivoSheet.unidade}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setItemPrecoAtivo(null)}
                aria-label="Fechar"
                className="w-11 h-11 rounded-full bg-[#F1F2F7] flex items-center justify-center text-text-main shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Caixa de Preço com Borda Azul #3B4CCA */}
            <div className="mt-3.5 border-2 border-primary rounded-2xl px-4 py-2 flex items-center justify-between">
              <div className="flex-1">
                <div className="text-xs text-text-muted font-semibold">
                  Preço por {produtoAtivoSheet.unidade}
                </div>
                <div className="flex items-center text-[32px] font-extrabold leading-[40px] text-text-main">
                  <span className="mr-1.5">R$</span>
                  <span>{precoTextoSheet || "0,00"}</span>
                  <span className="inline-block w-0.5 h-8 bg-primary ml-0.5 animate-pulse" />
                </div>
              </div>
              {precoTextoSheet && (
                <button
                  type="button"
                  onClick={() => setPrecoTextoSheet("")}
                  className="text-xs font-bold text-text-muted hover:text-text-main px-2 py-1 rounded-lg bg-background cursor-pointer"
                >
                  Limpar
                </button>
              )}
            </div>

            {/* Chip Discreto de Comparação ("Média de 3 meses: R$ 47,10 · ▲ 6%   Último: R$ 48,90") */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {comparacaoItemAtivo.stats.mediaPeriodo !== null ? (
                <span className="px-3 py-1.5 rounded-full bg-[#EEF0F6] text-xs font-semibold text-text-main">
                  Média de {settings?.meses_media || 3} meses:{" "}
                  {formatarMoeda(comparacaoItemAtivo.stats.mediaPeriodo)}
                  {comparacaoItemAtivo.diffPercent !== null && (
                    <>
                      {" · "}
                      {comparacaoItemAtivo.diffPercent > 0
                        ? `▲ ${comparacaoItemAtivo.diffPercent}%`
                        : comparacaoItemAtivo.diffPercent < 0
                        ? `▼ ${Math.abs(comparacaoItemAtivo.diffPercent)}%`
                        : "igual à média"}
                    </>
                  )}
                </span>
              ) : (
                <span className="px-3 py-1.5 rounded-full bg-[#EEF0F6] text-xs font-semibold text-text-muted">
                  Primeiro registro de preço deste produto
                </span>
              )}

              {comparacaoItemAtivo.stats.ultimo !== null && (
                <span className="text-xs text-text-muted font-medium">
                  Último: {formatarMoeda(comparacaoItemAtivo.stats.ultimo)}
                </span>
              )}
            </div>

            {/* Escolha de Marca em Pílulas de 44px */}
            <div className="mt-3.5 flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
              <span className="text-[13px] font-semibold text-text-muted shrink-0 w-11">
                Marca
              </span>
              {comparacaoItemAtivo.marcasSugeridas.map((m) => {
                const selecionada =
                  marcaSheet.trim().toLowerCase() === m.toLowerCase();
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMarcaSheet(selecionada ? "" : m)}
                    className={`h-11 px-4 rounded-full text-sm shrink-0 cursor-pointer transition-colors ${
                      selecionada
                        ? "bg-primary text-white font-bold"
                        : "bg-[#F1F2F7] text-text-main font-semibold"
                    }`}
                  >
                    {m}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setMarcaSheet("")}
                className={`h-11 px-4 rounded-full text-sm shrink-0 cursor-pointer ${
                  marcaSheet === ""
                    ? "bg-primary text-white font-bold"
                    : "bg-[#F1F2F7] text-text-main font-semibold"
                }`}
              >
                Sem marca
              </button>

              <button
                type="button"
                onClick={() => setMostrarInputNovaMarca(true)}
                className="h-11 px-3.5 rounded-full bg-[#F1F2F7] text-primary text-xs font-bold shrink-0 cursor-pointer"
              >
                + Outra
              </button>
            </div>

            {/* Controle de Quantidade (44x44px) */}
            <div className="mt-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-text-main">
                  Quantidade
                </span>
                <button
                  type="button"
                  onClick={() => {
                    handleRemoverItem(itemPrecoAtivo.id);
                    setItemPrecoAtivo(null);
                  }}
                  className="text-xs font-bold text-budget-red hover:underline ml-2 cursor-pointer"
                >
                  Remover item
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => alterarQtdNoSheet(-1)}
                  aria-label="Diminuir quantidade"
                  className="w-11 h-11 rounded-full bg-[#F1F2F7] flex items-center justify-center text-text-main cursor-pointer"
                >
                  <Minus className="w-5 h-5" />
                </button>

                {editandoQtdManual ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={qtdTextoSheet}
                    onChange={(e) => setQtdTextoSheet(e.target.value)}
                    onBlur={() => setEditandoQtdManual(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    autoFocus
                    className="w-20 h-10 text-center font-extrabold text-base bg-background border border-primary rounded-xl"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditandoQtdManual(true)}
                    title="Toque para digitar quantidade exata"
                    className="min-w-[76px] px-2 text-center text-base font-extrabold text-text-main cursor-pointer"
                  >
                    {qtdTextoSheet} {produtoAtivoSheet.unidade}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => alterarQtdNoSheet(1)}
                  aria-label="Aumentar quantidade"
                  className="w-11 h-11 rounded-full bg-[#F1F2F7] flex items-center justify-center text-text-main cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Mais opções (atacado) discreto */}
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => setMostrarAtacadoSheet(!mostrarAtacadoSheet)}
                className="h-7 flex items-center gap-1 text-[13px] font-semibold text-text-muted hover:text-text-main cursor-pointer"
              >
                <span>Mais opções (atacado)</span>
                {mostrarAtacadoSheet ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {mostrarAtacadoSheet && (
                <div className="mt-2 p-3 rounded-2xl bg-background border border-border flex flex-col gap-2.5">
                  <label className="flex items-center gap-2 text-xs font-bold text-text-main cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ehAtacadoSheet}
                      onChange={(e) => setEhAtacadoSheet(e.target.checked)}
                      className="w-4 h-4 accent-primary"
                    />
                    <span>Aplicar / registrar preço de atacado</span>
                  </label>

                  {ehAtacadoSheet && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-text-muted">
                          Qtd. mínima ({produtoAtivoSheet.unidade})
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={qtdMinAtacadoSheet}
                          onChange={(e) =>
                            setQtdMinAtacadoSheet(e.target.value)
                          }
                          className="h-10 px-3 rounded-xl bg-card border border-border text-sm font-extrabold"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-text-muted">
                          Preço atacado (R$/{produtoAtivoSheet.unidade})
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={precoAtacadoTextoSheet}
                          onChange={(e) =>
                            setPrecoAtacadoTextoSheet(e.target.value)
                          }
                          placeholder={precoTextoSheet || "0,00"}
                          className="h-10 px-3 rounded-xl bg-card border border-border text-sm font-extrabold"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Teclado Numérico Grande 3x4 (Fiel a 3-preco-do-item.html) */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0"].map(
                (tecla) => (
                  <button
                    key={tecla}
                    type="button"
                    onClick={() => handleTeclaNumerica(tecla)}
                    className="h-12 rounded-xl bg-[#F1F2F7] active:bg-border text-text-main text-[22px] font-semibold flex items-center justify-center cursor-pointer select-none"
                  >
                    {tecla}
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => handleTeclaNumerica("BACKSPACE")}
                aria-label="Apagar"
                className="h-12 rounded-xl bg-[#F1F2F7] active:bg-border text-text-main flex items-center justify-center cursor-pointer select-none"
              >
                <Delete className="w-6 h-6" />
              </button>
            </div>

            {/* Botão Salvar Preço (52px de altura, #3B4CCA) */}
            <button
              type="button"
              onClick={handleSalvarPrecoItem}
              className="mt-3 w-full h-[52px] rounded-2xl bg-primary hover:bg-primary-hover text-white text-[16px] font-bold flex items-center justify-center cursor-pointer"
            >
              Salvar preço
            </button>
          </div>

          {/* SUB-MODAL DEDICADO: DIGITAR NOVA MARCA (Evita conflito com teclado 3x4) */}
          {mostrarInputNovaMarca && (
            <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4">
              <div className="w-full max-w-sm bg-card rounded-2xl p-5 shadow-2xl border border-border flex flex-col gap-3.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-extrabold text-text-main">
                    Nova Marca
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setMostrarInputNovaMarca(false);
                      setNovaMarcaDigitada("");
                    }}
                    className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-text-muted hover:text-text-main cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-text-muted">
                  Digite o nome ou variação da marca:
                </p>
                <input
                  type="text"
                  value={novaMarcaDigitada}
                  onChange={(e) => setNovaMarcaDigitada(e.target.value)}
                  placeholder="Ex: Tang Laranja, Clight..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (novaMarcaDigitada.trim()) {
                        setMarcaSheet(novaMarcaDigitada.trim());
                      }
                      setMostrarInputNovaMarca(false);
                      setNovaMarcaDigitada("");
                    }
                  }}
                  className="w-full h-12 px-4 rounded-xl bg-background border border-border text-sm font-semibold text-text-main focus:outline-none focus:border-primary"
                />
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMostrarInputNovaMarca(false);
                      setNovaMarcaDigitada("");
                    }}
                    className="flex-1 h-11 rounded-xl bg-background border border-border text-text-muted font-bold text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (novaMarcaDigitada.trim()) {
                        setMarcaSheet(novaMarcaDigitada.trim());
                      }
                      setMostrarInputNovaMarca(false);
                      setNovaMarcaDigitada("");
                    }}
                    className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Usar marca</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          BOTTOM SHEET 2: ESCOLHER MERCADO
         ===================================================================== */}
      {sheetMercadoAberto && (
        <div className="fixed inset-0 z-50 bg-[#14171F]/50 flex items-end justify-center">
          <div className="w-full max-w-md bg-card rounded-t-[24px] p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">Mercado desta compra</h3>
              <button
                type="button"
                onClick={() => setSheetMercadoAberto(false)}
                className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-text-muted cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {mercados.map((m) => {
                const ativo = m.id === marketIdCarrinho;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelecionarMercado(m.id)}
                    className={`h-12 px-4 rounded-2xl border flex items-center justify-between text-sm font-bold cursor-pointer ${
                      ativo
                        ? "bg-primary-light border-primary text-primary-hover"
                        : "bg-background border-border text-text-main"
                    }`}
                  >
                    <span>
                      {m.nome} {m.padrao ? "(Padrão)" : ""}
                    </span>
                    {ativo && <Check className="w-4 h-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          BOTTOM SHEET 3: BOTÃO FLUTUANTE "+" (ADICIONAR PRODUTO NO MERCADO)
         ===================================================================== */}
      {sheetAdicionarAberto && (
        <div className="fixed inset-0 z-50 bg-[#14171F]/50 flex items-end justify-center">
          <div className="w-full max-w-md max-h-[90dvh] sm:max-h-[85vh] bg-card rounded-t-[24px] p-4 sm:p-5 flex flex-col min-h-0">
            {/* Topo fixo: Título e Botão Fechar */}
            <div className="flex items-center justify-between shrink-0 mb-3">
              <h3 className="text-lg font-extrabold text-text-main">
                {criandoProdutoNovo
                  ? "Novo produto rápido"
                  : "Adicionar à compra"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  (document.activeElement as HTMLElement)?.blur();
                  setSheetAdicionarAberto(false);
                  setCriandoProdutoNovo(false);
                }}
                className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-text-muted hover:text-text-main cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!criandoProdutoNovo ? (
              <>
                {/* Input de busca fixo no topo do sheet */}
                <div className="relative flex items-center shrink-0 mb-3">
                  <Search className="w-5 h-5 text-text-muted absolute left-3.5" />
                  <input
                    type="text"
                    value={buscaRapida}
                    onChange={(e) => setBuscaRapida(e.target.value)}
                    placeholder="Digite o nome do produto..."
                    autoFocus
                    className="w-full h-12 pl-11 pr-10 rounded-2xl bg-background border border-border text-sm font-semibold focus:outline-none focus:border-primary text-text-main"
                  />
                  {buscaRapida && (
                    <button
                      type="button"
                      onClick={() => setBuscaRapida("")}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted absolute right-2.5 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Área rolável de resultados + botão cadastrar com scroll suave */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col gap-2 pb-6 pr-0.5">
                  <div className="flex flex-col divide-y divide-border border border-border rounded-2xl overflow-hidden">
                    {produtosBuscaFlutuante.map((p) => {
                      const sec = p.sector_id
                        ? mapaSetores.get(p.sector_id)
                        : null;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            (document.activeElement as HTMLElement)?.blur();
                            handleAdicionarProdutoRapidoAoVivo(p);
                          }}
                          className="px-4 py-3 bg-card hover:bg-background flex items-center justify-between text-left cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-lg shrink-0">
                              {p.emoji || sec?.emoji || "📦"}
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-text-main truncate">
                                {p.nome}
                              </div>
                              <div className="text-xs text-text-muted truncate">
                                {sec?.nome || "Sem setor"} · {p.unidade}
                              </div>
                            </div>
                          </div>
                          <span className="px-3 py-1 rounded-full bg-primary-light text-primary text-xs font-bold shrink-0">
                            + Adicionar
                          </span>
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        (document.activeElement as HTMLElement)?.blur();
                        setNovoProdNome(buscaRapida.trim());
                        setNovoProdSetorId(setores[0]?.id || "");
                        setNovoProdUnidade("un");
                        setNovoProdPreco("");
                        setCriandoProdutoNovo(true);
                      }}
                      className="px-4 py-3.5 bg-primary-light/60 hover:bg-primary-light text-primary-hover text-xs font-extrabold text-left cursor-pointer transition-colors"
                    >
                      + Cadastrar novo produto{" "}
                      {buscaRapida.trim() ? `"${buscaRapida.trim()}"` : ""} agora
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <form
                onSubmit={handleCriarECadastrarProdutoNoMercado}
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col gap-3.5 pb-6 pr-0.5"
              >
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-muted">
                    Nome do produto
                  </label>
                  <input
                    type="text"
                    value={novoProdNome}
                    onChange={(e) => setNovoProdNome(e.target.value)}
                    placeholder="Ex: Café torrado 500g"
                    autoFocus
                    className="w-full h-12 px-3.5 rounded-xl bg-background border border-border text-sm font-semibold"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-text-muted">
                      Setor
                    </label>
                    <select
                      value={novoProdSetorId}
                      onChange={(e) => setNovoProdSetorId(e.target.value)}
                      className="w-full h-12 px-3 rounded-xl bg-background border border-border text-sm font-semibold"
                    >
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
                      value={novoProdUnidade}
                      onChange={(e) => setNovoProdUnidade(e.target.value)}
                      className="w-full h-12 px-3 rounded-xl bg-background border border-border text-sm font-semibold"
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
                    Preço na prateleira em R$ (opcional — já marca como pego)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={novoProdPreco}
                    onChange={(e) => setNovoProdPreco(e.target.value)}
                    placeholder="0,00"
                    className="w-full h-12 px-3.5 rounded-xl bg-background border border-border text-base font-extrabold"
                  />
                </div>

                <button
                  type="submit"
                  className="h-12 rounded-btn bg-primary text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar e colocar no carrinho</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          BOTTOM SHEET 4: FINALIZAR COMPRA COM PAGAMENTO MISTO (Seção 6)
         ===================================================================== */}
      {sheetFinalizarAberto && (
        <div className="fixed inset-0 z-50 bg-[#14171F]/50 flex items-end justify-center">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-card rounded-t-[24px] p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold">Finalizar compra</h3>
                <p className="text-xs text-text-muted">
                  Os preços reais serão salvos no histórico de{" "}
                  <strong>{nomeMercadoAtual}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSheetFinalizarAberto(false)}
                className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-text-muted cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Resumo Total */}
            <div className="bg-background border border-border rounded-2xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-text-muted">
                  Total dos itens no carrinho ({qtdItensMarcados} pegos)
                </div>
                <div className="text-2xl font-extrabold text-text-main mt-0.5">
                  {formatarMoeda(totalRealNoCarrinho)}
                </div>
              </div>
              <div className="text-right text-xs text-text-muted">
                <div>Estimado</div>
                <div className="font-bold">
                  {formatarMoeda(totalEstimadoGeral)}
                </div>
              </div>
            </div>

            {/* Formas de pagamento (opcional, permite pagamento misto) */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-text-main flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-primary" />
                  <span>Forma de pagamento (opcional)</span>
                </span>
                <button
                  type="button"
                  onClick={() => adicionarLinhaPagamento("Pix")}
                  className="text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  + Adicionar forma
                </button>
              </div>

              {pagamentosMistos.length === 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {FORMAS_PAGAMENTO.map((forma) => (
                    <button
                      key={forma}
                      type="button"
                      onClick={() => adicionarLinhaPagamento(forma)}
                      className="h-10 px-3.5 rounded-full bg-background border border-border hover:border-primary text-xs font-bold text-text-main cursor-pointer"
                    >
                      {forma}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {pagamentosMistos.map((pag, index) => (
                    <div key={pag.id} className="flex items-center gap-2">
                      <select
                        value={pag.forma_pagamento}
                        onChange={(e) => {
                          const novaForma = e.target.value as FormaPagamento;
                          setPagamentosMistos((prev) =>
                            prev.map((x, i) =>
                              i === index
                                ? { ...x, forma_pagamento: novaForma }
                                : x
                            )
                          );
                        }}
                        className="flex-1 h-11 px-3 rounded-xl bg-background border border-border text-xs font-bold text-text-main"
                      >
                        {FORMAS_PAGAMENTO.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>

                      <div className="relative w-32">
                        <span className="text-xs font-bold text-text-muted absolute left-3 top-3">
                          R$
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={pag.valorTexto}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPagamentosMistos((prev) =>
                              prev.map((x, i) =>
                                i === index ? { ...x, valorTexto: val } : x
                              )
                            );
                          }}
                          className="w-full h-11 pl-8 pr-2.5 rounded-xl bg-background border border-border text-sm font-extrabold text-right text-text-main"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setPagamentosMistos((prev) =>
                            prev.filter((_, i) => i !== index)
                          )
                        }
                        className="w-9 h-11 rounded-xl flex items-center justify-center text-text-muted hover:text-budget-red cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {/* Aviso de diferença no pagamento misto (Seção 6: avisar a diferença, sem bloquear) */}
                  {Math.abs(diferencaPagamento) >= 0.01 && (
                    <div className="text-xs font-semibold text-budget-yellow-text bg-budget-yellow-bg px-3 py-2 rounded-xl">
                      Soma dos pagamentos:{" "}
                      <strong>{formatarMoeda(somaPagamentosInformados)}</strong>{" "}
                      (diferença de{" "}
                      <strong>
                        {formatarMoeda(Math.abs(diferencaPagamento))}
                      </strong>{" "}
                      para o total da compra). Você pode confirmar mesmo assim.
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleConfirmarFinalizacao}
              disabled={finalizando}
              className="mt-1 w-full h-[52px] rounded-2xl bg-[#14171F] hover:bg-black disabled:opacity-60 text-white text-[16px] font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-5 h-5" />
              <span>
                {finalizando ? "Finalizando..." : "Confirmar e finalizar"}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
