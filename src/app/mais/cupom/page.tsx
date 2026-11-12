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
  ShoppingBag,
  Store,
  Tag,
  Trash2,
  Plus,
  RefreshCw,
  Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BottomNav from "@/components/BottomNav";
import QrCodeScanner from "@/components/QrCodeScanner";
import { formatarMoeda, parseDecimalBR } from "@/lib/format";
import type { DadosCupomFiscal, ItemCupomFiscal } from "@/lib/cupom-parser";
import {
  correlacionarItensCupom,
  type SugestaoMatchProduto,
} from "@/lib/cupom-matcher";
import type { Market, Product, Sector } from "@/lib/types";

export default function ImportarCupomPage() {
  const router = useRouter();

  // Estados de dados
  const [groupId, setGroupId] = useState<string | null>(null);
  const [produtos, setProdutos] = useState<Product[]>([]);
  const [setores, setSetores] = useState<Sector[]>([]);
  const [mercados, setMercados] = useState<Market[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);

  // Estados do Fluxo de Importação
  // 1: Entrada (Câmera / PDF / Link) | 2: Tabela Comparativa | 3: Criando Carrinho
  const [passo, setPasso] = useState<1 | 2>(1);
  const [abaEntrada, setAbaEntrada] = useState<"camera" | "pdf" | "link">("camera");

  // Inputs da Entrada
  const [urlCupom, setUrlCupom] = useState("");
  const [textoManual, setTextoManual] = useState("");
  const [arquivoPdf, setArquivoPdf] = useState<File | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Dados do Cupom e Matching
  const [dadosCupom, setDadosCupom] = useState<DadosCupomFiscal | null>(null);
  const [itensRevisao, setItensRevisao] = useState<SugestaoMatchProduto[]>([]);
  const [mercadoSelecionadoId, setMercadoSelecionadoId] = useState<string>("");
  const [novoMercadoNome, setNovoMercadoNome] = useState("");
  const [gerandoCarrinho, setGerandoCarrinho] = useState(false);

  // Carrega produtos, setores e mercados do grupo
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

        const [{ data: prods }, { data: secs }, { data: mercs }] =
          await Promise.all([
            supabase.from("products").select("*").eq("group_id", gId),
            supabase.from("sectors").select("*").eq("group_id", gId).order("ordem"),
            supabase.from("markets").select("*").eq("group_id", gId),
          ]);

        setProdutos(prods || []);
        setSetores(secs || []);
        setMercados(mercs || []);
      } catch {
        setErro("Erro ao carregar dados do grupo.");
      } finally {
        setCarregandoDados(false);
      }
    }

    carregarContexto();
  }, [router]);

  // Processa a resposta do parser e avança para a tabela comparativa
  function aplicarDadosCupom(dados: DadosCupomFiscal) {
    if (!dados.itens || dados.itens.length === 0) {
      setErro("Nenhum produto foi detectado neste cupom. Tente enviar o PDF ou colar o link.");
      return;
    }

    setDadosCupom(dados);

    // Roda o motor de comparação inteligente (Etapa 2)
    const matches = correlacionarItensCupom(dados.itens, produtos, setores);
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
    setErro(null);

    try {
      const res = await fetch("/api/cupom/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: textoDecodificado }),
      });

      const json = await interpretarRespostaApi(res);
      aplicarDadosCupom(json.dados);
    } catch (err: any) {
      setErro(err.message || "Não foi possível consultar este cupom na SEFAZ.");
    } finally {
      setProcessando(false);
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
    setErro(null);

    try {
      const formData = new FormData();
      formData.append("file", arquivoPdf);

      const res = await fetch("/api/cupom/parse", {
        method: "POST",
        body: formData,
      });

      const json = await interpretarRespostaApi(res);
      aplicarDadosCupom(json.dados);
    } catch (err: any) {
      setErro(err.message || "Erro ao ler o arquivo PDF.");
    } finally {
      setProcessando(false);
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
      aplicarDadosCupom(json.dados);
    } catch (err: any) {
      setErro(err.message || "Erro ao processar dados.");
    } finally {
      setProcessando(false);
    }
  }

  // Ações da Tabela Comparativa (Etapa 3)
  function alternarTipoProduto(index: number, ehMesmo: boolean) {
    setItensRevisao((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ehMesmoProduto: ehMesmo } : item))
    );
  }

  function atualizarMarcaItem(index: number, marca: string) {
    setItensRevisao((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, marcaConfirmada: marca } : item))
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

  // Geração do Carrinho no Banco (Etapa 4)
  async function handleGerarCarrinhoFinal() {
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

      // 2. Processa cada item (cadastra novo se necessário e atualiza histórico)
      const itensValidos = itensRevisao.filter((i) => !i.itemCupom.descartar);

      if (itensValidos.length === 0) {
        throw new Error("Nenhum item selecionado para o carrinho.");
      }

      // Cria o carrinho
      const nomeCarrinho = `Compra Cupom ${dadosCupom?.data_emissao ? `(${dadosCupom.data_emissao.split(" ")[0]})` : ""}`;
      const { data: novoCart, error: errCart } = await supabase
        .from("carts")
        .insert({
          group_id: groupId,
          market_id: mId || null,
          criado_por: user.id,
          nome: nomeCarrinho.trim(),
          status: "planejado",
        })
        .select("id")
        .single();

      if (errCart) throw errCart;
      const cartId = novoCart.id;

      // Cadastra novos produtos e itens do carrinho
      for (let i = 0; i < itensValidos.length; i++) {
        const itemRev = itensValidos[i];
        let produtoId = itemRev.produtoSugerido?.id;

        // Se for novo produto (ou usuário optou por cadastrar como novo), busca ou insere
        if (!itemRev.ehMesmoProduto || !produtoId) {
          const setorId = itemRev.setorSugeridoId || setores[0]?.id || null;
          const nomeFinal = (itemRev.nomeFormatadoNovo || itemRev.itemCupom.descricao).trim();

          // 1. Verifica se já existe um produto com este nome no grupo para evitar duplicações
          const { data: prodExistente } = await supabase
            .from("products")
            .select("id")
            .eq("group_id", groupId)
            .ilike("nome", nomeFinal)
            .limit(1)
            .maybeSingle();

          if (prodExistente) {
            produtoId = prodExistente.id;
          } else {
            // 2. Insere novo produto (usando estritamente as colunas válidas da tabela products)
            const { data: prodCriado, error: errProd } = await supabase
              .from("products")
              .insert({
                group_id: groupId,
                sector_id: setorId,
                nome: nomeFinal,
                unidade: itemRev.itemCupom.unidade || "un",
              })
              .select("id")
              .single();

            if (errProd) {
              console.error("Erro ao cadastrar produto:", errProd);
              throw new Error(`Erro ao cadastrar produto "${nomeFinal}": ${errProd.message}`);
            }

            if (prodCriado) {
              produtoId = prodCriado.id;
            }
          }
        }

        if (produtoId) {
          const precoUnitario =
            itemRev.itemCupom.valor_unitario > 0 ? itemRev.itemCupom.valor_unitario : null;

          // 3. Insere no carrinho (cart_items: cart_id, group_id, product_id, quantidade, preco_estimado, preco_real, marca, marcado, ordem)
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
              marcado: true, // Já vem conferido da nota
              ordem: i,
            })
            .select("id")
            .single();

          if (errCartItem) {
            console.error("Erro ao inserir item no carrinho:", errCartItem);
            throw new Error(`Erro ao adicionar "${itemRev.itemCupom.descricao}" ao carrinho: ${errCartItem.message}`);
          }

          // 4. Grava histórico de preço na tabela prices (prices: group_id, product_id, market_id, valor, marca, tipo, cart_item_id)
          if (mId && precoUnitario && precoUnitario > 0) {
            await supabase.from("prices").insert({
              group_id: groupId,
              product_id: produtoId,
              market_id: mId,
              valor: precoUnitario,
              marca: itemRev.marcaConfirmada.trim() || null,
              tipo: itemRev.ehAtacado ? "atacado" : "varejo",
              cart_item_id: cartItemCriado?.id || null,
            });
          }
        }
      }

      // Redireciona diretamente para a compra com o carrinho pronto!
      router.push(`/compra?id=${cartId}`);
    } catch (err: any) {
      setErro(err.message || "Falha ao gerar o carrinho.");
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
                  ativo={abaEntrada === "camera" && passo === 1 && !processando}
                  onScan={handleScanQrCode}
                />

                {processando && (
                  <div className="flex items-center gap-2 text-xs font-bold text-primary animate-pulse">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Consultando cupom na SEFAZ...</span>
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
                  disabled={!arquivoPdf || processando}
                  className="h-12 rounded-2xl bg-primary text-white font-extrabold text-sm hover:bg-primary-hover disabled:opacity-50 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  {processando ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Extraindo itens do PDF...</span>
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
                  disabled={(!urlCupom.trim() && !textoManual.trim()) || processando}
                  className="h-12 rounded-2xl bg-primary text-white font-extrabold text-sm hover:bg-primary-hover disabled:opacity-50 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  {processando ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Consultando dados...</span>
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
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-text-muted">
                {itensRevisao.filter((i) => !i.itemCupom.descartar).length} itens no cupom para conferência
              </span>
              <button
                type="button"
                onClick={() => setPasso(1)}
                className="text-xs text-primary font-bold hover:underline cursor-pointer"
              >
                Escanear outro cupom
              </button>
            </div>

            {/* Lista dos Itens com Comparação Inteligente */}
            <div className="flex flex-col gap-3.5">
              {itensRevisao.map((rev, index) => {
                const descartado = rev.itemCupom.descartar;

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
                        {/* Seletor: É o mesmo produto ou Cadastrar Novo? */}
                        {rev.produtoSugerido ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => alternarTipoProduto(index, true)}
                              className={`h-9 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                rev.ehMesmoProduto
                                  ? "bg-primary text-white shadow-2xs"
                                  : "bg-background border border-border text-text-muted hover:text-text-main"
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>É o mesmo: {rev.produtoSugerido.nome}</span>
                              <span className="ml-1 text-[10px] opacity-80 bg-white/20 px-1.5 py-0.2 rounded-full">
                                {rev.scoreSimilaridade}% match
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => alternarTipoProduto(index, false)}
                              className={`h-9 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                !rev.ehMesmoProduto
                                  ? "bg-primary text-white shadow-2xs"
                                  : "bg-background border border-border text-text-muted hover:text-text-main"
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Cadastrar como produto separado</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-light text-primary text-xs font-bold border border-primary/20">
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Novo produto (será cadastrado automaticamente no catálogo)</span>
                            </span>
                          </div>
                        )}

                        {/* Campos de Ajuste do Item */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 bg-background/60 p-3 rounded-2xl border border-border">
                          {/* Nome Novo (se for cadastrar) */}
                          {!rev.ehMesmoProduto && (
                            <div className="sm:col-span-6 flex flex-col gap-1">
                              <label className="text-[11px] font-bold text-text-muted">
                                Nome no catálogo
                              </label>
                              <input
                                type="text"
                                value={rev.nomeFormatadoNovo}
                                onChange={(e) => atualizarNomeNovo(index, e.target.value)}
                                className="h-9 px-3 rounded-lg bg-card border border-border text-xs text-text-main focus:outline-none focus:border-primary"
                                placeholder="Nome formatado"
                              />
                            </div>
                          )}

                          {/* Marca (Editável) */}
                          <div className={`flex flex-col gap-1 ${rev.ehMesmoProduto ? "sm:col-span-12" : "sm:col-span-6"}`}>
                            <label className="text-[11px] font-bold text-text-muted flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              <span>Marca ou Sabor</span>
                            </label>
                            <input
                              type="text"
                              value={rev.marcaConfirmada}
                              onChange={(e) => atualizarMarcaItem(index, e.target.value)}
                              placeholder="Ex: Tio João, Italac, Sadia..."
                              className="h-9 px-3 rounded-lg bg-card border border-border text-xs text-text-main focus:outline-none focus:border-primary w-full"
                            />
                          </div>

                          {/* Setor (se for novo produto) */}
                          {!rev.ehMesmoProduto && (
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
                          )}

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

            {/* Barra Inferior Fixa de Conclusão / Geração do Carrinho */}
            <div className="fixed bottom-16 md:bottom-0 left-0 right-0 md:pl-64 bg-card/95 backdrop-blur-md border-t border-border p-3 sm:p-4 z-30 shadow-lg">
              <div className="max-w-md md:max-w-4xl lg:max-w-5xl mx-auto flex items-center justify-between gap-3">
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-semibold text-text-muted truncate">
                    {itensRevisao.filter((i) => !i.itemCupom.descartar).length}{" "}
                    {itensRevisao.filter((i) => !i.itemCupom.descartar).length === 1
                      ? "item confirmado"
                      : "itens confirmados"}
                  </span>
                  <span className="text-base sm:text-lg font-extrabold text-text-main whitespace-nowrap">
                    {formatarMoeda(
                      itensRevisao
                        .filter((i) => !i.itemCupom.descartar)
                        .reduce((acc, curr) => acc + (curr.itemCupom.valor_total || 0), 0)
                    )}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleGerarCarrinhoFinal}
                  disabled={gerandoCarrinho}
                  className="h-12 px-5 sm:px-8 rounded-2xl bg-primary text-white font-extrabold text-sm sm:text-base hover:bg-primary-hover shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 shrink-0"
                >
                  {gerandoCarrinho ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Gerando...</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="w-4 h-4" />
                      <span>Gerar Carrinho</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
