"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  QrCode,
  FileText,
  Link2,
  ArrowLeft,
  ArrowRight,
  Upload,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Store,
  Tag,
  Trash2,
  Plus,
  RefreshCw,
  Check,
  X,
  Settings,
  Calendar,
  CreditCard,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BottomNav from "@/components/BottomNav";
import QrCodeScanner from "@/components/QrCodeScanner";
import {
  dataHojeISO,
  dataInputParaISO,
  extrairDataInput,
  formatarDataBR,
  formatarMoeda,
  parseDecimalBR,
} from "@/lib/format";
import type { DadosCupomFiscal } from "@/lib/cupom-parser";
import {
  correlacionarItensCupom,
  normalizarTexto,
  removerMarcaDoTexto,
  type ResultadoIAItem,
  type SugestaoMatchProduto,
} from "@/lib/cupom-matcher";
import {
  carregarConfigIADoGrupo,
  ehProdutoInternoSistema,
  lerConfigIA,
  MODELOS_IA_DISPONIVEIS,
  salvarConfigIANoGrupo,
  temIAConfigurada,
  type ConfigIA,
} from "@/lib/ia-config";
import type { FormaPagamento, Market, Product, Sector } from "@/lib/types";

const FORMAS_PAGAMENTO_CUPOM: FormaPagamento[] = [
  "Pix",
  "Crédito",
  "Débito",
  "Vale-alimentação",
  "Dinheiro",
  "Outro",
];

export default function ImportarCupomPage() {
  const router = useRouter();

  // Estados de dados
  const [groupId, setGroupId] = useState<string | null>(null);
  const [produtos, setProdutos] = useState<Product[]>([]);
  const [setores, setSetores] = useState<Sector[]>([]);
  const [mercados, setMercados] = useState<Market[]>([]);
  const [marcasHistorico, setMarcasHistorico] = useState<string[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);

  // Configuração local da IA opcional (Google AI Studio)
  const [configIA, setConfigIA] = useState<ConfigIA>({
    ativada: false,
    apiKey: "",
    modelo: "gemini-3.8-flash",
  });

  // Estados do Fluxo de Importação
  // 1: Entrada (Câmera / PDF / Link) | 2: Tabela Comparativa
  const [passo, setPasso] = useState<1 | 2>(1);
  const [abaEntrada, setAbaEntrada] = useState<"camera" | "pdf" | "link">("camera");

  // Inputs da Entrada
  const [urlCupom, setUrlCupom] = useState("");
  const [textoManual, setTextoManual] = useState("");
  const [arquivoPdf, setArquivoPdf] = useState<File | null>(null);
  const [processando, setProcessando] = useState(false);
  const [etapaProcessamento, setEtapaProcessamento] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoIA, setAvisoIA] = useState<string | null>(null);
  const [usouIA, setUsouIA] = useState(false);

  // Dados do Cupom e Matching
  const [dadosCupom, setDadosCupom] = useState<DadosCupomFiscal | null>(null);
  const [itensRevisao, setItensRevisao] = useState<SugestaoMatchProduto[]>([]);
  const [mercadoSelecionadoId, setMercadoSelecionadoId] = useState<string>("");
  const [novoMercadoNome, setNovoMercadoNome] = useState("");
  const [gerandoCarrinho, setGerandoCarrinho] = useState(false);
  const [indiceEscolhendoProduto, setIndiceEscolhendoProduto] = useState<number | null>(null);

  // Modal de finalização direta da compra pelo cupom (vai direto para Histórico)
  const [modalFinalizarAberto, setModalFinalizarAberto] = useState(false);
  const [nomeCompraFinal, setNomeCompraFinal] = useState("");
  const [dataCompraFinal, setDataCompraFinal] = useState(dataHojeISO());
  const [pagamentosCupom, setPagamentosCupom] = useState<
    { id: string; forma_pagamento: FormaPagamento; valorTexto: string }[]
  >([]);

  // Mantém preferência da IA sincronizada com o grupo ao montar ou voltar da tela Mais
  useEffect(() => {
    const atualizarConfig = () => {
      if (groupId) {
        carregarConfigIADoGrupo(createClient(), groupId).then(setConfigIA);
      } else {
        setConfigIA(lerConfigIA());
      }
    };
    atualizarConfig();
    window.addEventListener("focus", atualizarConfig);
    window.addEventListener("storage", atualizarConfig);
    return () => {
      window.removeEventListener("focus", atualizarConfig);
      window.removeEventListener("storage", atualizarConfig);
    };
  }, [groupId]);

  // Carrega produtos, setores, mercados e marcas históricas do grupo
  useEffect(() => {
    async function carregarContexto() {
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
          { data: prods },
          { data: secs },
          { data: mercs },
          { data: marcasPrices },
          { data: marcasCart },
        ] = await Promise.all([
          supabase.from("products").select("*").eq("group_id", gId),
          supabase.from("sectors").select("*").eq("group_id", gId).order("ordem"),
          supabase.from("markets").select("*").eq("group_id", gId),
          supabase
            .from("prices")
            .select("marca")
            .eq("group_id", gId)
            .not("marca", "is", null)
            .limit(500),
          supabase
            .from("cart_items")
            .select("marca")
            .eq("group_id", gId)
            .not("marca", "is", null)
            .limit(500),
        ]);

        const cfgGrupo = await carregarConfigIADoGrupo(supabase, gId);
        setConfigIA(cfgGrupo);

        const prodsFiltrados = ((prods as Product[]) || []).filter(
          (p) => !ehProdutoInternoSistema(p.codigo_barras)
        );
        setProdutos(prodsFiltrados);
        setSetores(secs || []);
        setMercados(mercs || []);

        const mapaMarcas = new Map<string, string>();
        for (const reg of [...(marcasPrices || []), ...(marcasCart || [])]) {
          const m = typeof reg.marca === "string" ? reg.marca.trim() : "";
          if (m.length >= 2) {
            const chave = m.toLowerCase();
            if (!mapaMarcas.has(chave)) {
              mapaMarcas.set(chave, m);
            }
          }
        }
        setMarcasHistorico(Array.from(mapaMarcas.values()));
      } catch {
        setErro("Erro ao carregar dados do grupo.");
      } finally {
        setCarregandoDados(false);
      }
    }

    carregarContexto();
  }, [router]);

  async function alternarIAAtivaRapido() {
    if (!configIA.apiKey.trim()) return;
    if (groupId) {
      const atualizada = await salvarConfigIANoGrupo(createClient(), groupId, {
        ativada: !configIA.ativada,
      });
      setConfigIA(atualizada);
    } else {
      setConfigIA((prev) => ({ ...prev, ativada: !prev.ativada }));
    }
  }

  // Processa a resposta do parser, consulta IA opcional e avança para a tabela comparativa
  async function aplicarDadosCupom(dados: DadosCupomFiscal) {
    if (!dados.itens || dados.itens.length === 0) {
      setErro("Nenhum produto foi detectado neste cupom. Tente enviar o PDF ou colar o link.");
      return;
    }

    const cfgAtual = groupId
      ? await carregarConfigIADoGrupo(createClient(), groupId)
      : lerConfigIA();
    setConfigIA(cfgAtual);

    let analiseIA: ResultadoIAItem[] | undefined;
    let mensagemAvisoIA: string | null = null;
    let iaAplicada = false;

    if (temIAConfigurada(cfgAtual)) {
      setEtapaProcessamento("Organizando nomes, marcas e setores com IA...");
      try {
        const resIA = await fetch("/api/cupom/ia", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-gemini-api-key": cfgAtual.apiKey,
          },
          body: JSON.stringify({
            acao: "analisar",
            modelo: cfgAtual.modelo,
            itens: dados.itens.map((it) => it.descricao),
            setores: setores.map((s) => s.nome),
          }),
        });

        const jsonIA = await resIA.json().catch(() => ({}));
        if (resIA.ok && Array.isArray(jsonIA?.itens) && jsonIA.itens.length > 0) {
          analiseIA = jsonIA.itens;
          iaAplicada = true;
        } else {
          mensagemAvisoIA =
            jsonIA?.erro ||
            "A IA não respondeu desta vez. Seguimos com a identificação local.";
        }
      } catch {
        mensagemAvisoIA =
          "Não foi possível consultar a IA agora. Seguimos com a identificação local.";
      }
    }

    setDadosCupom(dados);
    setAvisoIA(mensagemAvisoIA);
    setUsouIA(iaAplicada);

    // Cruza com o catálogo usando IA (quando ativa) e Plano B local + marcas do histórico
    const matches = correlacionarItensCupom(dados.itens, produtos, setores, {
      marcasDoHistorico: marcasHistorico,
      analiseIA,
    });
    setItensRevisao(matches);

    // Tenta identificar o mercado
    if (dados.mercado_nome) {
      const nomeLower = dados.mercado_nome.toLowerCase();
      const achado = mercados.find((m) =>
        nomeLower.includes(m.nome.toLowerCase()) || m.nome.toLowerCase().includes(nomeLower)
      );

      if (achado) {
        setMercadoSelecionadoId(achado.id);
      } else {
        setNovoMercadoNome(dados.mercado_nome);
      }
    } else if (mercados.length > 0) {
      const padrao = mercados.find((m) => m.padrao) || mercados[0];
      setMercadoSelecionadoId(padrao.id);
    }

    setIndiceEscolhendoProduto(null);
    setPasso(2);
    setErro(null);
  }

  // Interpreta respostas da API de forma segura contra erros de formato ou falhas 500
  async function interpretarRespostaApi(res: Response) {
    const rawText = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(rawText);
    } catch {
      throw new Error(
        res.status >= 500
          ? "O servidor não conseguiu extrair os dados deste cupom no momento. Tente tirar uma foto nítida do QR Code pela câmera ou colar o link oficial."
          : "Não foi possível interpretar o arquivo do cupom fiscal."
      );
    }

    if (!res.ok || json.erro) {
      throw new Error(json?.erro || "Falha ao processar o cupom fiscal.");
    }

    return json;
  }

  // 1. Processamento via QR Code lido pela Câmera
  async function handleScanQrCode(textoDecodificado: string) {
    if (processando) return;
    setProcessando(true);
    setEtapaProcessamento("Consultando cupom na SEFAZ...");
    setErro(null);

    try {
      const res = await fetch("/api/cupom/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: textoDecodificado }),
      });

      const json = await interpretarRespostaApi(res);
      await aplicarDadosCupom(json.dados);
    } catch (err: any) {
      setErro(err.message || "Não foi possível consultar este cupom na SEFAZ.");
    } finally {
      setProcessando(false);
      setEtapaProcessamento(null);
    }
  }

  // 2. Processamento via Upload de PDF
  async function handleUploadPdf(e: React.FormEvent) {
    e.preventDefault();
    if (!arquivoPdf) {
      setErro("Selecione um arquivo PDF do cupom.");
      return;
    }

    setProcessando(true);
    setEtapaProcessamento("Extraindo itens do PDF...");
    setErro(null);

    try {
      const formData = new FormData();
      formData.append("file", arquivoPdf);

      const res = await fetch("/api/cupom/parse", {
        method: "POST",
        body: formData,
      });

      const json = await interpretarRespostaApi(res);
      await aplicarDadosCupom(json.dados);
    } catch (err: any) {
      setErro(err.message || "Erro ao ler o arquivo PDF.");
    } finally {
      setProcessando(false);
      setEtapaProcessamento(null);
    }
  }

  // 3. Processamento via Link ou Texto colado
  async function handleProcessarLinkOuTexto(e: React.FormEvent) {
    e.preventDefault();
    if (!urlCupom.trim() && !textoManual.trim()) {
      setErro("Informe o link da SEFAZ ou cole o texto do cupom.");
      return;
    }

    setProcessando(true);
    setEtapaProcessamento("Consultando dados do cupom...");
    setErro(null);

    try {
      const res = await fetch("/api/cupom/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: urlCupom.trim() || undefined,
          texto: textoManual.trim() || undefined,
        }),
      });

      const json = await interpretarRespostaApi(res);
      await aplicarDadosCupom(json.dados);
    } catch (err: any) {
      setErro(err.message || "Erro ao processar dados.");
    } finally {
      setProcessando(false);
      setEtapaProcessamento(null);
    }
  }

  // Ações da Tabela Comparativa (Etapa 3)
  function alternarTipoProduto(index: number, ehMesmo: boolean) {
    setItensRevisao((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ehMesmoProduto: ehMesmo } : item))
    );
    if (!ehMesmo) {
      setIndiceEscolhendoProduto((atual) => (atual === index ? null : atual));
    }
  }

  function associarProdutoExistente(index: number, productId: string) {
    setItensRevisao((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        if (!productId) {
          return {
            ...item,
            ehMesmoProduto: false,
            produtoSugerido: null,
          };
        }

        const prod = produtos.find((p) => p.id === productId);
        if (!prod) return item;

        const ehSetorGenerico = (sectorId?: string | null) => {
          if (!sectorId) return true;
          const sec = setores.find((s) => s.id === sectorId);
          if (!sec) return true;
          const norm = normalizarTexto(sec.nome);
          return norm.includes("mercearia") || norm.includes("outros");
        };

        const setorAtualizado =
          prod.sector_id && !ehSetorGenerico(prod.sector_id)
            ? prod.sector_id
            : item.setorSugeridoId || prod.sector_id || null;

        const nomeSemMarca = item.marcaConfirmada.trim()
          ? removerMarcaDoTexto(item.nomeFormatadoNovo, item.marcaConfirmada)
          : item.nomeFormatadoNovo;

        return {
          ...item,
          ehMesmoProduto: true,
          produtoSugerido: prod,
          scoreSimilaridade: 100,
          nomeFormatadoNovo: nomeSemMarca,
          setorSugeridoId: setorAtualizado,
        };
      })
    );
    setIndiceEscolhendoProduto(null);
  }

  function atualizarMarcaItem(index: number, marca: string) {
    setItensRevisao((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const nomeAtualizado =
          marca.trim().length >= 2
            ? removerMarcaDoTexto(item.nomeFormatadoNovo, marca)
            : item.nomeFormatadoNovo;
        return {
          ...item,
          marcaConfirmada: marca,
          nomeFormatadoNovo: nomeAtualizado,
        };
      })
    );
  }

  function limparMarcaDoNomeManual(index: number) {
    setItensRevisao((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const nomeLimpo = removerMarcaDoTexto(
          item.nomeFormatadoNovo,
          item.marcaConfirmada
        );
        return { ...item, nomeFormatadoNovo: nomeLimpo };
      })
    );
  }

  function atualizarNomeNovo(index: number, nome: string) {
    setItensRevisao((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, nomeFormatadoNovo: nome } : item))
    );
  }

  function atualizarSetorNovo(index: number, sectorId: string) {
    setItensRevisao((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, setorSugeridoId: sectorId } : item))
    );
  }

  function alternarDescarteItem(index: number) {
    setItensRevisao((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? {
              ...item,
              itemCupom: { ...item.itemCupom, descartar: !item.itemCupom.descartar },
            }
          : item
      )
    );
  }

  function atualizarPrecoUnitario(index: number, valorDigitado: string) {
    // Permite apenas números, vírgula e ponto (evita caracteres inválidos)
    const textoLimpo = valorDigitado.replace(/[^0-9.,]/g, "");
    const precoNum = parseDecimalBR(textoLimpo);

    setItensRevisao((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const qtd = item.itemCupom.quantidade || 1;
        const novoTotal = Number((precoNum * qtd).toFixed(2));
        return {
          ...item,
          precoDigitadoTexto: textoLimpo,
          itemCupom: {
            ...item.itemCupom,
            valor_unitario: precoNum,
            valor_total: novoTotal,
          },
        };
      })
    );
  }

  function normalizarPrecoUnitarioAoSair(index: number) {
    setItensRevisao((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const num = item.itemCupom.valor_unitario;
        return {
          ...item,
          precoDigitadoTexto: num > 0 ? num.toFixed(2).replace(".", ",") : "",
        };
      })
    );
  }

  function alternarAtacado(index: number) {
    setItensRevisao((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, ehAtacado: !item.ehAtacado } : item
      )
    );
  }

  const itensConfirmados = itensRevisao.filter((i) => !i.itemCupom.descartar);
  const totalConfirmadoCupom = itensConfirmados.reduce(
    (acc, curr) => acc + (curr.itemCupom.valor_total || 0),
    0
  );
  const somaPagamentosCupom = pagamentosCupom.reduce(
    (acc, p) => acc + parseDecimalBR(p.valorTexto),
    0
  );

  function abrirModalFinalizarCompra() {
    if (itensConfirmados.length === 0) {
      setErro("Selecione ao menos 1 item confirmado para finalizar a compra.");
      return;
    }
    setErro(null);
    const dataBase = extrairDataInput(dadosCupom?.data_emissao);
    setDataCompraFinal(dataBase);
    setNomeCompraFinal(`Compra Cupom (${formatarDataBR(dataBase)})`);
    setPagamentosCupom([
      {
        id: `pag-${Date.now()}`,
        forma_pagamento: "Pix",
        valorTexto: totalConfirmadoCupom.toFixed(2).replace(".", ","),
      },
    ]);
    setModalFinalizarAberto(true);
  }

  function adicionarPagamentoCupom() {
    const restante = Math.max(0, totalConfirmadoCupom - somaPagamentosCupom);
    setPagamentosCupom((prev) => [
      ...prev,
      {
        id: `pag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        forma_pagamento: "Crédito",
        valorTexto: restante > 0 ? restante.toFixed(2).replace(".", ",") : "",
      },
    ]);
  }

  // Finalização Direta da Compra pelo Cupom -> salva no Histórico (sem passar por /compra)
  async function handleFinalizarCompraCupom(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId) return;
    setGerandoCarrinho(true);
    setErro(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Usuário não autenticado.");

      // 1. Resolve ou cadastra o Mercado
      let mId = mercadoSelecionadoId;
      if (!mId && novoMercadoNome.trim()) {
        const { data: novoM, error: errM } = await supabase
          .from("markets")
          .insert({
            group_id: groupId,
            nome: novoMercadoNome.trim(),
            padrao: mercados.length === 0,
          })
          .select("id")
          .single();

        if (errM) throw errM;
        mId = novoM.id;
      } else if (!mId && mercados.length > 0) {
        mId = mercados[0].id;
      }

      // 2. Valida itens confirmados
      const itensValidos = itensRevisao.filter((i) => !i.itemCupom.descartar);
      if (itensValidos.length === 0) {
        throw new Error("Nenhum item selecionado para finalizar a compra.");
      }

      const dataFinalISO = dataCompraFinal || dataHojeISO();
      const nomeCarrinho =
        nomeCompraFinal.trim() || `Compra Cupom (${formatarDataBR(dataFinalISO)})`;

      // 3. Cria o carrinho já finalizado com a data do cupom/compra
      const { data: novoCart, error: errCart } = await supabase
        .from("carts")
        .insert({
          group_id: groupId,
          market_id: mId || null,
          criado_por: user.id,
          nome: nomeCarrinho,
          status: "finalizado",
          data_planejada: dataFinalISO,
          finalizado_em: dataInputParaISO(dataFinalISO),
        })
        .select("id")
        .single();

      if (errCart) throw errCart;
      const cartId = novoCart.id;

      const mapaEmojiSetor = new Map(setores.map((s) => [s.id, s.emoji]));

      // 4. Atualiza/cadastra produtos (salvando emoji), grava cart_items e histórico prices
      for (let i = 0; i < itensValidos.length; i++) {
        const itemRev = itensValidos[i];
        let produtoId = itemRev.produtoSugerido?.id;
        const setorResolvidoId =
          itemRev.setorSugeridoId ||
          itemRev.produtoSugerido?.sector_id ||
          setores[0]?.id ||
          null;
        const emojiResolvido =
          itemRev.emojiSugerido?.trim() ||
          (setorResolvidoId ? mapaEmojiSetor.get(setorResolvidoId) : null) ||
          null;

        if (itemRev.ehMesmoProduto && produtoId) {
          const nomeFinal = (
            itemRev.nomeFormatadoNovo ||
            itemRev.produtoSugerido?.nome ||
            itemRev.itemCupom.descricao
          ).trim();
          const precisaAtualizarEmoji =
            !itemRev.produtoSugerido?.emoji && Boolean(emojiResolvido);

          if (
            nomeFinal !== itemRev.produtoSugerido?.nome ||
            setorResolvidoId !== itemRev.produtoSugerido?.sector_id ||
            precisaAtualizarEmoji
          ) {
            const payloadProd: {
              nome: string;
              sector_id: string | null;
              emoji?: string | null;
            } = {
              nome: nomeFinal,
              sector_id: setorResolvidoId,
            };
            if (precisaAtualizarEmoji && emojiResolvido) {
              payloadProd.emoji = emojiResolvido;
            }

            const { error: errUpdateProd } = await supabase
              .from("products")
              .update(payloadProd)
              .eq("id", produtoId)
              .eq("group_id", groupId);

            if (errUpdateProd) {
              console.error("Erro ao atualizar produto:", errUpdateProd);
              throw new Error(
                `Erro ao atualizar produto "${nomeFinal}": ${errUpdateProd.message}`
              );
            }
          }
        } else {
          const setorId = itemRev.setorSugeridoId || setores[0]?.id || null;
          const nomeFinal = (
            itemRev.nomeFormatadoNovo || itemRev.itemCupom.descricao
          ).trim();

          // Verifica se já existe um produto com este nome no grupo para evitar duplicações
          const { data: prodExistente } = await supabase
            .from("products")
            .select("id, emoji")
            .eq("group_id", groupId)
            .ilike("nome", nomeFinal)
            .limit(1)
            .maybeSingle();

          if (prodExistente) {
            produtoId = prodExistente.id;
            if (!prodExistente.emoji && emojiResolvido) {
              await supabase
                .from("products")
                .update({ emoji: emojiResolvido })
                .eq("id", prodExistente.id)
                .eq("group_id", groupId);
            }
          } else {
            const { data: prodCriado, error: errProd } = await supabase
              .from("products")
              .insert({
                group_id: groupId,
                sector_id: setorId,
                nome: nomeFinal,
                unidade: itemRev.itemCupom.unidade || "un",
                emoji: emojiResolvido,
              })
              .select("id")
              .single();

            if (errProd) {
              console.error("Erro ao cadastrar produto:", errProd);
              throw new Error(
                `Erro ao cadastrar produto "${nomeFinal}": ${errProd.message}`
              );
            }

            if (prodCriado) {
              produtoId = prodCriado.id;
            }
          }
        }

        if (produtoId) {
          const precoUnitario =
            itemRev.itemCupom.valor_unitario > 0 ? itemRev.itemCupom.valor_unitario : null;

          const { data: cartItemCriado, error: errCartItem } = await supabase
            .from("cart_items")
            .insert({
              cart_id: cartId,
              group_id: groupId,
              product_id: produtoId,
              quantidade: itemRev.itemCupom.quantidade || 1,
              preco_estimado: precoUnitario,
              preco_real: precoUnitario,
              marca: itemRev.marcaConfirmada.trim() || null,
              atacado_aplicado: itemRev.ehAtacado,
              marcado: true,
              ordem: i,
            })
            .select("id")
            .single();

          if (errCartItem) {
            console.error("Erro ao inserir item no carrinho:", errCartItem);
            throw new Error(
              `Erro ao adicionar "${itemRev.itemCupom.descricao}" à compra: ${errCartItem.message}`
            );
          }

          if (mId && precoUnitario && precoUnitario > 0) {
            await supabase.from("prices").insert({
              group_id: groupId,
              product_id: produtoId,
              market_id: mId,
              valor: precoUnitario,
              marca: itemRev.marcaConfirmada.trim() || null,
              tipo: itemRev.ehAtacado ? "atacado" : "varejo",
              quantidade_minima: 1,
              data: dataFinalISO,
              criado_por: user.id,
              cart_item_id: cartItemCriado?.id || null,
            });
          }
        }
      }

      // 5. Registra as formas de pagamento selecionadas
      const pagamentosValidos = pagamentosCupom
        .map((p) => ({
          cart_id: cartId,
          group_id: groupId,
          forma_pagamento: p.forma_pagamento,
          valor: parseDecimalBR(p.valorTexto),
        }))
        .filter((p) => p.valor > 0);

      if (pagamentosValidos.length > 0) {
        const { error: errPag } = await supabase
          .from("cart_payments")
          .insert(pagamentosValidos);
        if (errPag) throw errPag;
      }

      setModalFinalizarAberto(false);
      router.push("/historico");
      router.refresh();
    } catch (err: any) {
      setErro(err.message || "Falha ao finalizar a compra.");
      setGerandoCarrinho(false);
    }
  }

  return (
    <div
      className={`min-h-screen flex flex-col bg-background text-text-main md:pl-64 ${
        passo === 2 ? "pb-36 md:pb-24" : "pb-24 md:pb-8"
      }`}
    >
      <main className="flex-1 w-full max-w-md md:max-w-4xl lg:max-w-5xl mx-auto px-4 sm:px-6 md:px-8 pt-5 md:pt-8 flex flex-col gap-5">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Link
              href="/mais"
              className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-text-muted hover:text-text-main transition-colors"
              title="Voltar para Mais"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <span className="text-xs font-semibold text-text-muted">
                Automação de Compras
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold leading-tight">
                Importar Cupom Fiscal
              </h1>
            </div>
          </div>
        </div>

        {/* Mensagens de Erro */}
        {erro && (
          <div className="bg-budget-red-bg text-budget-red-text px-4 py-3 rounded-2xl text-xs font-semibold flex items-start gap-2 shadow-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{erro}</span>
          </div>
        )}

        {/* =========================================================================
            PASSO 1: ENTRADA DO CUPOM (CÂMERA QR CODE / UPLOAD PDF / LINK)
           ========================================================================= */}
        {passo === 1 && (
          <div className="bg-card border border-border rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col gap-5">
            {/* Controle rápido da IA opcional */}
            <div className="rounded-2xl border border-border bg-background/70 px-3.5 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    temIAConfigurada(configIA)
                      ? "bg-primary text-white"
                      : "bg-primary-light text-primary"
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-extrabold text-text-main">
                      {temIAConfigurada(configIA)
                        ? "IA Ativa"
                        : configIA.apiKey.trim().length >= 15
                        ? "IA Desligada"
                        : "IA Opcional"}
                    </span>
                    {temIAConfigurada(configIA) && (
                      <span className="text-[10px] font-bold bg-primary-light text-primary px-2 py-0.5 rounded-full truncate">
                        {MODELOS_IA_DISPONIVEIS.find((m) => m.id === configIA.modelo)?.nome.replace(
                          " (Recomendado)",
                          ""
                        ) || configIA.modelo}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-text-muted truncate">
                    {temIAConfigurada(configIA)
                      ? "Limpa nomes, extrai marcas e sugere setores na leitura."
                      : configIA.apiKey.trim().length >= 15
                      ? "Chave salva. Ligue se quiser limpar nomes e marcas agora."
                      : "Use uma chave gratuita do Google AI Studio em Mais."}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {configIA.apiKey.trim().length >= 15 ? (
                  <>
                    <button
                      type="button"
                      onClick={alternarIAAtivaRapido}
                      className={`h-9 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        configIA.ativada
                          ? "bg-card border border-border text-text-main hover:border-primary"
                          : "bg-primary text-white hover:bg-primary-hover"
                      }`}
                    >
                      {configIA.ativada ? "Desligar" : "Ligar IA"}
                    </button>
                    <Link
                      href="/mais"
                      title="Configurações da IA em Mais"
                      className="w-9 h-9 rounded-xl bg-card border border-border text-text-muted hover:text-text-main flex items-center justify-center transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                    </Link>
                  </>
                ) : (
                  <Link
                    href="/mais"
                    className="h-9 px-3 rounded-xl bg-primary-light text-primary text-xs font-bold flex items-center gap-1 hover:opacity-90 transition-opacity"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Configurar</span>
                  </Link>
                )}
              </div>
            </div>

            {/* Seletor de Método de Importação */}
            <div className="grid grid-cols-3 bg-background p-1 rounded-2xl border border-border">
              <button
                type="button"
                onClick={() => {
                  setAbaEntrada("camera");
                  setErro(null);
                }}
                className={`h-11 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                  abaEntrada === "camera"
                    ? "bg-card text-primary shadow-xs"
                    : "text-text-muted hover:text-text-main"
                }`}
              >
                <QrCode className="w-4 h-4" />
                <span className="hidden sm:inline">Câmera</span>
                <span>QR Code</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAbaEntrada("pdf");
                  setErro(null);
                }}
                className={`h-11 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                  abaEntrada === "pdf"
                    ? "bg-card text-primary shadow-xs"
                    : "text-text-muted hover:text-text-main"
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Upload PDF</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAbaEntrada("link");
                  setErro(null);
                }}
                className={`h-11 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                  abaEntrada === "link"
                    ? "bg-card text-primary shadow-xs"
                    : "text-text-muted hover:text-text-main"
                }`}
              >
                <Link2 className="w-4 h-4" />
                <span>Colar Link</span>
              </button>
            </div>

            {/* ABA 1: CÂMERA AO VIVO */}
            {abaEntrada === "camera" && (
              <div className="flex flex-col items-center gap-4 py-2">
                <p className="text-xs text-text-muted text-center max-w-sm">
                  Aponte a câmera para o QR Code impresso no final do cupom de supermercado (NFC-e / SAT).
                </p>

                <QrCodeScanner
                  ativo={abaEntrada === "camera" && passo === 1 && !processando && !carregandoDados}
                  onScan={handleScanQrCode}
                />

                {processando && (
                  <div className="flex items-center gap-2 text-xs font-bold text-primary animate-pulse">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{etapaProcessamento || "Consultando cupom na SEFAZ..."}</span>
                  </div>
                )}
              </div>
            )}

            {/* ABA 2: UPLOAD DE PDF */}
            {abaEntrada === "pdf" && (
              <form onSubmit={handleUploadPdf} className="flex flex-col gap-4 py-2">
                <p className="text-xs text-text-muted">
                  Envie o arquivo PDF do cupom fiscal ou Danfe recebido por e-mail ou baixado do supermercado.
                </p>

                <label className="border-2 border-dashed border-border hover:border-primary/60 rounded-3xl p-6 sm:p-8 flex flex-col items-center justify-center gap-3 cursor-pointer bg-background hover:bg-primary-light/20 transition-all">
                  <Upload className="w-8 h-8 text-primary" />
                  <div className="text-center">
                    <span className="text-sm font-bold text-text-main">
                      {arquivoPdf ? arquivoPdf.name : "Clique para selecionar o PDF"}
                    </span>
                    <p className="text-xs text-text-muted mt-0.5">
                      Suporta Danfe NFC-e padrão de supermercados
                    </p>
                  </div>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setArquivoPdf(e.target.files[0]);
                        setErro(null);
                      }
                    }}
                  />
                </label>

                <button
                  type="submit"
                  disabled={!arquivoPdf || processando || carregandoDados}
                  className="h-12 rounded-2xl bg-primary text-white font-extrabold text-sm hover:bg-primary-hover disabled:opacity-50 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  {processando ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{etapaProcessamento || "Extraindo itens do PDF..."}</span>
                    </>
                  ) : (
                    <>
                      <span>Processar Cupom em PDF</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* ABA 3: COLAR LINK OU CHAVE */}
            {abaEntrada === "link" && (
              <form onSubmit={handleProcessarLinkOuTexto} className="flex flex-col gap-4 py-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-muted">
                    Link da SEFAZ ou URL do QR Code
                  </label>
                  <input
                    type="url"
                    value={urlCupom}
                    onChange={(e) => setUrlCupom(e.target.value)}
                    placeholder="http://sefaz.uf.gov.br/nfce/consultanfce?p=..."
                    className="w-full h-12 px-4 rounded-xl bg-background border border-border text-sm text-text-main focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-muted">
                    Ou cole o texto do cupom fiscal
                  </label>
                  <textarea
                    rows={4}
                    value={textoManual}
                    onChange={(e) => setTextoManual(e.target.value)}
                    placeholder="Cole aqui o texto copiado da consulta do cupom..."
                    className="w-full p-3.5 rounded-xl bg-background border border-border text-xs text-text-main focus:outline-none focus:border-primary font-mono resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={(!urlCupom.trim() && !textoManual.trim()) || processando || carregandoDados}
                  className="h-12 rounded-2xl bg-primary text-white font-extrabold text-sm hover:bg-primary-hover disabled:opacity-50 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  {processando ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{etapaProcessamento || "Consultando dados..."}</span>
                    </>
                  ) : (
                    <>
                      <span>Processar Cupom</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        )}

        {/* =========================================================================
            PASSO 2: TABELA COMPARATIVA E REVISÃO DE ITENS (ETAPA 3)
           ========================================================================= */}
        {passo === 2 && (
          <div className="flex flex-col gap-5">
            {/* Aviso caso a IA tenha falhado e usado o Plano B local */}
            {avisoIA && (
              <div className="bg-card border border-border rounded-2xl p-3.5 flex items-start justify-between gap-3 shadow-xs">
                <div className="flex items-start gap-2.5 min-w-0">
                  <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="text-xs text-text-muted leading-relaxed">
                    <strong className="text-text-main">Plano B ativado:</strong> {avisoIA}{" "}
                    <Link href="/mais" className="text-primary font-bold hover:underline">
                      Ajustar IA
                    </Link>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAvisoIA(null)}
                  className="w-7 h-7 rounded-full hover:bg-background flex items-center justify-center text-text-muted cursor-pointer shrink-0"
                  title="Fechar aviso"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Card com Metadados da Nota */}
            <div className="bg-card border border-border rounded-3xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary-light text-primary flex items-center justify-center shrink-0">
                  <Store className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-text-main leading-tight">
                    {dadosCupom?.mercado_nome || "Mercado do Cupom"}
                  </h2>
                  <p className="text-xs text-text-muted">
                    {dadosCupom?.data_emissao ? `Emissão: ${dadosCupom.data_emissao}` : "Cupom importado com sucesso"}
                    {dadosCupom?.mercado_cnpj ? ` · CNPJ: ${dadosCupom.mercado_cnpj}` : ""}
                  </p>
                </div>
              </div>

              {dadosCupom?.total_cupom && (
                <div className="bg-background px-4 py-2 rounded-2xl border border-border self-start sm:self-auto text-right">
                  <span className="text-[11px] font-bold text-text-muted block">Total da Nota</span>
                  <span className="text-lg font-black text-primary">
                    {formatarMoeda(dadosCupom.total_cupom)}
                  </span>
                </div>
              )}
            </div>

            {/* Banner de Desconto na Nota (se houver desconto identificado na SEFAZ ou cupom) */}
            {dadosCupom?.total_descontos && dadosCupom.total_descontos > 0 && (
              <div className="bg-primary-light border border-primary/20 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
                <div className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Tag className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-xs font-bold text-text-main">
                      Desconto de {formatarMoeda(dadosCupom.total_descontos)} identificado nesta compra!
                    </h4>
                    <span className="text-[10px] font-extrabold bg-primary text-white px-2 py-0.5 rounded-full">
                      Atacado / Desconto
                    </span>
                  </div>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">
                    A SEFAZ disponibiliza a lista de produtos com o valor cheio/bruto. Você pode ajustar o preço unitário e marcar <strong>Preço de Atacado</strong> nos itens que receberam desconto abaixo antes de salvar.
                  </p>
                </div>
              </div>
            )}

            {/* Seletor do Mercado no Pechincha */}
            <div className="bg-card border border-border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div>
                <label className="text-xs font-bold text-text-main">Vincular a qual mercado?</label>
                <p className="text-xs text-text-muted">Os preços deste cupom serão gravados neste estabelecimento</p>
              </div>

              <select
                value={mercadoSelecionadoId}
                onChange={(e) => setMercadoSelecionadoId(e.target.value)}
                className="h-11 px-3.5 rounded-xl bg-background border border-border text-xs font-bold text-text-main focus:outline-none focus:border-primary"
              >
                {mercados.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome} {m.padrao ? "(Padrão)" : ""}
                  </option>
                ))}
                {!mercadoSelecionadoId && novoMercadoNome && (
                  <option value="">+ Cadastrar como: {novoMercadoNome}</option>
                )}
              </select>
            </div>

            {/* Cabeçalho da Lista */}
            <div className="flex items-center justify-between gap-2 flex-wrap px-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-text-muted">
                  {itensRevisao.filter((i) => !i.itemCupom.descartar).length} itens no cupom para conferência
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    usouIA
                      ? "bg-primary-light text-primary"
                      : "bg-card border border-border text-text-muted"
                  }`}
                >
                  {usouIA && <Sparkles className="w-2.5 h-2.5" />}
                  <span>{usouIA ? "Organizado com IA" : "Identificação local"}</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPasso(1)}
                className="text-xs text-primary font-bold hover:underline cursor-pointer"
              >
                Escanear outro cupom
              </button>
            </div>

            {/* Sugestões de marcas já usadas pelo grupo */}
            {marcasHistorico.length > 0 && (
              <datalist id="marcas-historico-cupom">
                {marcasHistorico.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            )}

            {/* Lista dos Itens com Comparação Inteligente */}
            {(() => {
              const produtosOrdenados = [...produtos].sort((a, b) =>
                a.nome.localeCompare(b.nome, "pt-BR")
              );

              return (
            <div className="flex flex-col gap-3.5">
              {itensRevisao.map((rev, index) => {
                const descartado = rev.itemCupom.descartar;
                const selecionandoOutro = indiceEscolhendoProduto === index;
                const marcaAindaNoNome =
                  rev.marcaConfirmada.trim().length >= 2 &&
                  normalizarTexto(rev.nomeFormatadoNovo).includes(
                    normalizarTexto(rev.marcaConfirmada)
                  );
                const vaiRenomearCatalogo =
                  rev.ehMesmoProduto &&
                  rev.produtoSugerido &&
                  rev.nomeFormatadoNovo.trim().length > 0 &&
                  rev.nomeFormatadoNovo.trim().toLowerCase() !==
                    rev.produtoSugerido.nome.trim().toLowerCase();

                return (
                  <div
                    key={rev.itemCupom.id_temp}
                    className={`bg-card border rounded-2xl p-4 sm:p-5 transition-all shadow-xs flex flex-col gap-3.5 ${
                      descartado
                        ? "opacity-50 border-border bg-background/50"
                        : rev.ehMesmoProduto
                        ? "border-primary/40 bg-card"
                        : "border-border"
                    }`}
                  >
                    {/* Linha 1: Item da Nota Fiscal vs. Preço e Quantidade */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-bold tracking-wider text-text-muted uppercase">
                            No Cupom
                          </span>
                          {rev.ehAtacado && (
                            <span className="text-[10px] font-black bg-primary-light text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Tag className="w-2.5 h-2.5" />
                              <span>Atacado</span>
                            </span>
                          )}
                          {rev.itemCupom.desconto && rev.itemCupom.desconto > 0 && (
                            <span className="text-[10px] font-bold bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">
                              -{formatarMoeda(rev.itemCupom.desconto)} desc.
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-extrabold text-text-main leading-snug mt-0.5">
                          {rev.itemCupom.descricao}
                        </h3>
                        <p className="text-xs text-text-muted font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>
                            {String(rev.itemCupom.quantidade).replace(".", ",")} {rev.itemCupom.unidade} ×{" "}
                            {formatarMoeda(rev.itemCupom.valor_unitario)}
                          </span>
                          <span>=</span>
                          <span className="font-bold text-text-main">
                            {formatarMoeda(rev.itemCupom.valor_total)}
                          </span>
                          {rev.itemCupom.valor_original && rev.itemCupom.valor_original > rev.itemCupom.valor_total && (
                            <span className="line-through text-text-muted/60 text-[11px]">
                              {formatarMoeda(rev.itemCupom.valor_original)}
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Botão Descartar / Incluir */}
                      <button
                        type="button"
                        onClick={() => alternarDescarteItem(index)}
                        className={`h-9 px-3 rounded-full text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                          descartado
                            ? "bg-primary-light text-primary hover:bg-primary-light/80"
                            : "bg-background border border-border text-text-muted hover:text-budget-red hover:border-budget-red"
                        }`}
                      >
                        {descartado ? (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Recuperar</span>
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Descartar</span>
                          </>
                        )}
                      </button>
                    </div>

                    {!descartado && (
                      <div className="pt-2 border-t border-border flex flex-col gap-3">
                        {/* Barra de Associação ao Catálogo */}
                        <div className="flex flex-col gap-2">
                          {rev.ehMesmoProduto && rev.produtoSugerido ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="h-9 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-primary text-white shadow-2xs">
                                <Check className="w-3.5 h-3.5" />
                                <span>Associado: {rev.produtoSugerido.nome}</span>
                                <span className="ml-1 text-[10px] opacity-80 bg-white/20 px-1.5 py-0.2 rounded-full">
                                  {rev.scoreSimilaridade}%
                                </span>
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  setIndiceEscolhendoProduto(selecionandoOutro ? null : index)
                                }
                                className="h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-background border border-border text-text-muted hover:text-text-main hover:border-primary transition-all cursor-pointer"
                              >
                                <Link2 className="w-3.5 h-3.5" />
                                <span>Associar a outro</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => alternarTipoProduto(index, false)}
                                className="h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-background border border-border text-text-muted hover:text-text-main transition-all cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Cadastrar separado</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-light text-primary text-xs font-bold border border-primary/20">
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Novo produto no catálogo</span>
                              </span>

                              {produtosOrdenados.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setIndiceEscolhendoProduto(selecionandoOutro ? null : index)
                                  }
                                  className={`h-9 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                    selecionandoOutro
                                      ? "bg-primary text-white shadow-2xs"
                                      : "bg-background border border-border text-text-main hover:border-primary"
                                  }`}
                                >
                                  <Link2 className="w-3.5 h-3.5" />
                                  <span>Associar a produto existente</span>
                                </button>
                              )}

                              {rev.produtoSugerido && (
                                <button
                                  type="button"
                                  onClick={() => alternarTipoProduto(index, true)}
                                  className="h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-background border border-border text-text-muted hover:text-text-main transition-all cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Usar: {rev.produtoSugerido.nome}</span>
                                </button>
                              )}
                            </div>
                          )}

                          {/* Aviso quando o nome limpo vai atualizar o nome antigo no catálogo */}
                          {vaiRenomearCatalogo && (
                            <p className="text-[11px] font-semibold text-primary px-0.5">
                              O nome no catálogo será atualizado para{" "}
                              <strong>&ldquo;{rev.nomeFormatadoNovo}&rdquo;</strong> ao gerar o carrinho.
                            </p>
                          )}

                          {/* Seletor inline para associar manualmente a qualquer produto do catálogo */}
                          {selecionandoOutro && (
                            <div className="flex items-center gap-2 bg-background p-2.5 rounded-xl border border-primary/40">
                              <select
                                value={rev.ehMesmoProduto && rev.produtoSugerido ? rev.produtoSugerido.id : ""}
                                onChange={(e) => associarProdutoExistente(index, e.target.value)}
                                className="flex-1 h-9 px-3 rounded-lg bg-card border border-border text-xs font-semibold text-text-main focus:outline-none focus:border-primary min-w-0"
                              >
                                <option value="">+ Criar como produto novo (sem associar)</option>
                                {produtosOrdenados.map((p) => {
                                  const sec = setores.find((s) => s.id === p.sector_id);
                                  return (
                                    <option key={p.id} value={p.id}>
                                      {sec ? `${sec.emoji} ` : ""}
                                      {p.nome} ({p.unidade})
                                    </option>
                                  );
                                })}
                              </select>
                              <button
                                type="button"
                                onClick={() => setIndiceEscolhendoProduto(null)}
                                className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center text-text-muted hover:text-text-main cursor-pointer shrink-0"
                                title="Fechar seletor"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Campos de Ajuste do Item (sempre visíveis e editáveis) */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 bg-background/60 p-3 rounded-2xl border border-border">
                          {/* Nome no catálogo (sempre editável) */}
                          <div className="sm:col-span-6 flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2">
                              <label className="text-[11px] font-bold text-text-muted">
                                Nome do produto (sem a marca)
                              </label>
                              {marcaAindaNoNome && (
                                <button
                                  type="button"
                                  onClick={() => limparMarcaDoNomeManual(index)}
                                  className="text-[10px] font-bold text-primary hover:underline cursor-pointer"
                                >
                                  Tirar marca
                                </button>
                              )}
                            </div>
                            <input
                              type="text"
                              value={rev.nomeFormatadoNovo}
                              onChange={(e) => atualizarNomeNovo(index, e.target.value)}
                              className="h-9 px-3 rounded-lg bg-card border border-border text-xs text-text-main focus:outline-none focus:border-primary"
                              placeholder="Nome limpo do produto"
                            />
                          </div>

                          {/* Marca (Editável) */}
                          <div className="sm:col-span-6 flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-text-muted flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              <span>Marca ou Sabor</span>
                            </label>
                            <input
                              type="text"
                              list="marcas-historico-cupom"
                              value={rev.marcaConfirmada}
                              onChange={(e) => atualizarMarcaItem(index, e.target.value)}
                              placeholder="Ex: Tio João, Italac, Sadia..."
                              className="h-9 px-3 rounded-lg bg-card border border-border text-xs text-text-main focus:outline-none focus:border-primary w-full"
                            />
                          </div>

                          {/* Setor do mercado (sempre editável) */}
                          <div className="sm:col-span-12 flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-text-muted">
                              Setor do mercado
                            </label>
                            <select
                              value={rev.setorSugeridoId || ""}
                              onChange={(e) => atualizarSetorNovo(index, e.target.value)}
                              className="h-9 px-3 rounded-lg bg-card border border-border text-xs text-text-main focus:outline-none focus:border-primary"
                            >
                              {setores.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.emoji} {s.nome}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Edição de Preço Unitário e Tipo de Preço (Atacado / Varejo) */}
                          <div className="sm:col-span-12 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-border/70">
                            <div className="flex items-center gap-2">
                              <label className="text-[11px] font-bold text-text-muted whitespace-nowrap">
                                Preço unitário:
                              </label>
                              <div className="relative flex items-center">
                                <span className="absolute left-2.5 text-xs font-bold text-text-muted">R$</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={
                                    rev.precoDigitadoTexto !== undefined
                                      ? rev.precoDigitadoTexto
                                      : rev.itemCupom.valor_unitario > 0
                                      ? rev.itemCupom.valor_unitario.toFixed(2).replace(".", ",")
                                      : ""
                                  }
                                  onChange={(e) => atualizarPrecoUnitario(index, e.target.value)}
                                  onBlur={() => normalizarPrecoUnitarioAoSair(index)}
                                  placeholder="0,00"
                                  className="w-24 h-8 pl-8 pr-2 rounded-lg bg-card border border-border text-xs font-extrabold text-text-main focus:outline-none focus:border-primary"
                                />
                              </div>
                              <span className="text-xs font-bold text-text-muted">
                                / {rev.itemCupom.unidade}
                              </span>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3">
                              <span className="text-xs font-medium text-text-muted">
                                Subtotal:{" "}
                                <strong className="text-text-main font-bold">
                                  {formatarMoeda(rev.itemCupom.valor_total)}
                                </strong>
                              </span>

                              <button
                                type="button"
                                onClick={() => alternarAtacado(index)}
                                className={`h-8 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                  rev.ehAtacado
                                    ? "bg-primary text-white shadow-2xs"
                                    : "bg-card border border-border text-text-muted hover:text-text-main"
                                }`}
                                title="Define se este valor será salvo no Pechincha como Preço de Atacado ou Preço de Varejo"
                              >
                                <Tag className="w-3 h-3" />
                                <span>{rev.ehAtacado ? "🏷️ Preço Atacado" : "Preço Varejo"}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
              );
            })()}

            {/* Barra Inferior Fixa de Finalização da Compra */}
            <div className="fixed bottom-16 md:bottom-0 left-0 right-0 md:pl-64 bg-card/95 backdrop-blur-md border-t border-border p-3 sm:p-4 z-30 shadow-lg">
              <div className="max-w-md md:max-w-4xl lg:max-w-5xl mx-auto flex items-center justify-between gap-3">
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-semibold text-text-muted truncate">
                    {itensConfirmados.length}{" "}
                    {itensConfirmados.length === 1
                      ? "item confirmado"
                      : "itens confirmados"}
                  </span>
                  <span className="text-base sm:text-lg font-extrabold text-text-main whitespace-nowrap">
                    {formatarMoeda(totalConfirmadoCupom)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={abrirModalFinalizarCompra}
                  disabled={gerandoCarrinho || itensConfirmados.length === 0}
                  className="h-12 px-5 sm:px-8 rounded-2xl bg-primary text-white font-extrabold text-sm sm:text-base hover:bg-primary-hover shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 shrink-0 disabled:opacity-60"
                >
                  {gerandoCarrinho ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Finalizar Compra</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal de Finalização Direta do Cupom (Pagamento + Data -> Histórico) */}
      {modalFinalizarAberto && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto bg-card rounded-t-[24px] md:rounded-2xl p-5 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-text-main">
                  Finalizar compra do cupom
                </h2>
                <p className="text-xs text-text-muted">
                  Confirme a data e a forma de pagamento para salvar no histórico.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !gerandoCarrinho && setModalFinalizarAberto(false)}
                className="w-9 h-9 rounded-full bg-background border border-border flex items-center justify-center text-text-muted hover:text-text-main cursor-pointer shrink-0"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-primary-light/60 border border-primary/20 rounded-xl p-3 flex items-center justify-between">
              <div className="text-xs font-semibold text-text-muted">
                {itensConfirmados.length}{" "}
                {itensConfirmados.length === 1 ? "item" : "itens"} confirmados
              </div>
              <div className="text-lg font-extrabold text-primary">
                {formatarMoeda(totalConfirmadoCupom)}
              </div>
            </div>

            <form onSubmit={handleFinalizarCompraCupom} className="flex flex-col gap-3.5">
              <div>
                <label className="text-xs font-semibold text-text-muted block mb-1">
                  Nome da compra
                </label>
                <input
                  type="text"
                  value={nomeCompraFinal}
                  onChange={(e) => setNomeCompraFinal(e.target.value)}
                  placeholder="Ex.: Compra Cupom (14/11/2026)"
                  required
                  className="w-full h-11 px-3.5 rounded-xl bg-background border border-border text-sm font-medium focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-text-muted flex items-center gap-1.5 mb-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Data da compra</span>
                </label>
                <input
                  type="date"
                  value={dataCompraFinal}
                  onChange={(e) => setDataCompraFinal(e.target.value)}
                  required
                  className="w-full h-11 px-3.5 rounded-xl bg-background border border-border text-sm font-medium focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-text-muted flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Forma de pagamento</span>
                  </label>
                  <button
                    type="button"
                    onClick={adicionarPagamentoCupom}
                    className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Dividir pagamento</span>
                  </button>
                </div>

                {pagamentosCupom.map((pag, idx) => (
                  <div key={pag.id} className="flex items-center gap-2">
                    <select
                      value={pag.forma_pagamento}
                      onChange={(e) => {
                        const novaForma = e.target.value as FormaPagamento;
                        setPagamentosCupom((prev) =>
                          prev.map((row) =>
                            row.id === pag.id
                              ? { ...row, forma_pagamento: novaForma }
                              : row
                          )
                        );
                      }}
                      className="flex-1 h-11 px-3 rounded-xl bg-background border border-border text-sm font-medium focus:outline-none focus:border-primary"
                    >
                      {FORMAS_PAGAMENTO_CUPOM.map((fp) => (
                        <option key={fp} value={fp}>
                          {fp}
                        </option>
                      ))}
                    </select>

                    <div className="relative w-32 shrink-0">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted">
                        R$
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={pag.valorTexto}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPagamentosCupom((prev) =>
                            prev.map((row) =>
                              row.id === pag.id ? { ...row, valorTexto: val } : row
                            )
                          );
                        }}
                        placeholder="0,00"
                        className="w-full h-11 pl-8 pr-3 rounded-xl bg-background border border-border text-sm font-bold text-text-main focus:outline-none focus:border-primary"
                      />
                    </div>

                    {pagamentosCupom.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setPagamentosCupom((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                        className="w-10 h-11 rounded-xl border border-border text-text-muted hover:text-danger flex items-center justify-center shrink-0 cursor-pointer"
                        aria-label="Remover forma de pagamento"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}

                {Math.abs(somaPagamentosCupom - totalConfirmadoCupom) > 0.05 && (
                  <p className="text-[11px] font-medium text-warning">
                    Soma dos pagamentos ({formatarMoeda(somaPagamentosCupom)}) está diferente do total dos itens ({formatarMoeda(totalConfirmadoCupom)}). Você pode ajustar ou salvar assim mesmo se houve desconto/arredondamento.
                  </p>
                )}
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalFinalizarAberto(false)}
                  disabled={gerandoCarrinho}
                  className="flex-1 h-12 rounded-xl border border-border font-bold text-sm text-text-muted hover:text-text-main cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={gerandoCarrinho}
                  className="flex-[1.6] h-12 rounded-xl bg-primary hover:bg-primary-hover text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-60"
                >
                  {gerandoCarrinho ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Salvando compra...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirmar e salvar</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
