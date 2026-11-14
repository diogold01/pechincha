"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Database,
  Smartphone,
  Share,
  MoreVertical,
  Check,
  AlertCircle,
} from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import SupabaseSetupGuide from "@/components/SupabaseSetupGuide";
import BottomNav from "@/components/BottomNav";
import { formatarDataBR } from "@/lib/format";
import {
  CODIGO_BARRAS_CONFIG_IA,
  ehProdutoInternoSistema,
} from "@/lib/ia-config";
import type {
  Cart,
  CartItem,
  CartPayment,
  Group,
  GroupSettings,
  Market,
  MarketSectorOrder,
  Price,
  Product,
  Sector,
} from "@/lib/types";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function ExportarBackupPage() {
  const router = useRouter();
  const configurado = isSupabaseConfigured();

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [separadorCsv, setSeparadorCsv] = useState<";" | ",">(";");

  const [grupo, setGrupo] = useState<Group | null>(null);
  const [settings, setSettings] = useState<GroupSettings | null>(null);
  const [mercados, setMercados] = useState<Market[]>([]);
  const [setores, setSetores] = useState<Sector[]>([]);
  const [ordemSetores, setOrdemSetores] = useState<MarketSectorOrder[]>([]);
  const [produtos, setProdutos] = useState<Product[]>([]);
  const [precos, setPrecos] = useState<Price[]>([]);
  const [carrinhos, setCarrinhos] = useState<Cart[]>([]);
  const [itensCarrinho, setItensCarrinho] = useState<CartItem[]>([]);
  const [pagamentos, setPagamentos] = useState<CartPayment[]>([]);

  // Evento de instalação direta do PWA (Android/Chrome)
  const [eventoInstalarPwa, setEventoInstalarPwa] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault();
      setEventoInstalarPwa(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const carregarTudo = useCallback(async () => {
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

      const [
        { data: gData },
        { data: stData },
        { data: mktData },
        { data: secData },
        { data: ordData },
        { data: prodData },
        { data: prcData },
        { data: cartsData },
        { data: itemsData },
        { data: payData },
      ] = await Promise.all([
        supabase.from("groups").select("*").eq("id", gId).single(),
        supabase.from("group_settings").select("*").eq("group_id", gId).single(),
        supabase.from("markets").select("*").eq("group_id", gId),
        supabase
          .from("sectors")
          .select("*")
          .eq("group_id", gId)
          .order("ordem", { ascending: true }),
        supabase.from("market_sector_order").select("*").eq("group_id", gId),
        supabase.from("products").select("*").eq("group_id", gId),
        supabase
          .from("prices")
          .select("*")
          .eq("group_id", gId)
          .order("data", { ascending: false }),
        supabase
          .from("carts")
          .select("*")
          .eq("group_id", gId)
          .order("criado_em", { ascending: false }),
        supabase.from("cart_items").select("*").eq("group_id", gId),
        supabase.from("cart_payments").select("*").eq("group_id", gId),
      ]);

      setGrupo((gData as Group) || null);
      setSettings((stData as GroupSettings) || null);
      setMercados((mktData as Market[]) || []);
      setSetores((secData as Sector[]) || []);
      setOrdemSetores((ordData as MarketSectorOrder[]) || []);
      setProdutos(
        ((prodData as Product[]) || []).filter(
          (p) => p.codigo_barras !== CODIGO_BARRAS_CONFIG_IA
        )
      );
      setPrecos((prcData as Price[]) || []);
      setCarrinhos((cartsData as Cart[]) || []);
      setItensCarrinho((itemsData as CartItem[]) || []);
      setPagamentos((payData as CartPayment[]) || []);
    } catch {
      setErro("Não foi possível carregar os dados para exportação.");
    } finally {
      setCarregando(false);
    }
  }, [configurado, router]);

  useEffect(() => {
    carregarTudo();
  }, [carregarTudo]);

  function mostrarFeedback(texto: string) {
    setMensagemSucesso(texto);
    setTimeout(() => setMensagemSucesso(null), 3500);
  }

  function escaparCelulaCsv(valor: unknown, sep: ";" | ","): string {
    if (valor === null || valor === undefined) return "";
    const str = String(valor).replace(/\r?\n/g, " ");
    if (str.includes(sep) || str.includes('"')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function formatarNumeroCsvBR(num: number): string {
    return num.toFixed(2).replace(".", ",");
  }

  function baixarArquivoCsv(
    nomeArquivo: string,
    cabecalhos: string[],
    linhas: unknown[][]
  ) {
    const sep = separadorCsv;
    const linhasTexto = [
      cabecalhos.map((c) => escaparCelulaCsv(c, sep)).join(sep),
      ...linhas.map((linha) =>
        linha.map((cel) => escaparCelulaCsv(cel, sep)).join(sep)
      ),
    ];
    // Adiciona BOM UTF-8 (\uFEFF) para Excel e apps de finanças reconhecerem acentos em português
    const conteudo = "\uFEFF" + linhasTexto.join("\r\n");
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // (a) Exportação CSV de Compras Finalizadas para o App de Finanças
  // Seção 6: "data, mercado, setor, total, formas de pagamento"
  function handleExportarComprasPorSetorCsv() {
    const mapaMercados = new Map(mercados.map((m) => [m.id, m.nome]));
    const mapaSetores = new Map(setores.map((s) => [s.id, s.nome]));
    const mapaProdutos = new Map(produtos.map((p) => [p.id, p]));

    const carrinhosFinalizados = carrinhos.filter(
      (c) => c.status === "finalizado"
    );

    const linhas: unknown[][] = [];

    for (const c of carrinhosFinalizados) {
      const dataStr = formatarDataBR(
        c.finalizado_em || c.data_planejada || c.criado_em
      );
      const nomeMercado =
        (c.market_id && mapaMercados.get(c.market_id)) || "Sem mercado";

      const pags = pagamentos
        .filter((pg) => pg.cart_id === c.id)
        .map(
          (pg) =>
            `${pg.forma_pagamento}: R$ ${formatarNumeroCsvBR(Number(pg.valor))}`
        )
        .join(" | ");

      const itensDoC = itensCarrinho.filter(
        (i) => i.cart_id === c.id && i.marcado !== false
      );

      let totalCompra = 0;
      const subtotalPorSetor = new Map<string, number>();

      for (const item of itensDoC) {
        const unit =
          item.preco_real !== null && item.preco_real !== undefined
            ? Number(item.preco_real)
            : Number(item.preco_estimado || 0);
        const sub = unit * Number(item.quantidade || 0);
        totalCompra += sub;

        const prod = item.product_id ? mapaProdutos.get(item.product_id) : undefined;
        const setorId = item.sector_id_avulso || prod?.sector_id;
        const nomeSetor =
          (setorId && mapaSetores.get(setorId)) || "Avulso / Sem setor";
        subtotalPorSetor.set(
          nomeSetor,
          (subtotalPorSetor.get(nomeSetor) || 0) + sub
        );
      }

      if (subtotalPorSetor.size === 0) {
        linhas.push([
          dataStr,
          c.nome,
          nomeMercado,
          "Geral",
          formatarNumeroCsvBR(0),
          formatarNumeroCsvBR(0),
          pags || "Não informado",
        ]);
      } else {
        for (const [setorNome, valorSetor] of subtotalPorSetor.entries()) {
          linhas.push([
            dataStr,
            c.nome,
            nomeMercado,
            setorNome,
            formatarNumeroCsvBR(valorSetor),
            formatarNumeroCsvBR(totalCompra),
            pags || "Não informado",
          ]);
        }
      }
    }

    baixarArquivoCsv(
      `pechincha_compras_por_setor_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Data",
        "Compra",
        "Mercado",
        "Setor",
        "Total Setor (R$)",
        "Total da Compra (R$)",
        "Formas de Pagamento",
      ],
      linhas
    );
    mostrarFeedback("CSV de compras por setor gerado com sucesso!");
  }

  function handleExportarComprasResumoCsv() {
    const mapaMercados = new Map(mercados.map((m) => [m.id, m.nome]));
    const mapaSetores = new Map(setores.map((s) => [s.id, s.nome]));
    const mapaProdutos = new Map(produtos.map((p) => [p.id, p]));

    const carrinhosFinalizados = carrinhos.filter(
      (c) => c.status === "finalizado"
    );

    const linhas: unknown[][] = carrinhosFinalizados.map((c) => {
      const dataStr = formatarDataBR(
        c.finalizado_em || c.data_planejada || c.criado_em
      );
      const nomeMercado =
        (c.market_id && mapaMercados.get(c.market_id)) || "Sem mercado";

      const pags = pagamentos
        .filter((pg) => pg.cart_id === c.id)
        .map(
          (pg) =>
            `${pg.forma_pagamento} (R$ ${formatarNumeroCsvBR(Number(pg.valor))})`
        )
        .join(" + ");

      const itensDoC = itensCarrinho.filter(
        (i) => i.cart_id === c.id && i.marcado !== false
      );

      let totalCompra = 0;
      const setoresUsados = new Set<string>();

      for (const item of itensDoC) {
        const unit =
          item.preco_real !== null && item.preco_real !== undefined
            ? Number(item.preco_real)
            : Number(item.preco_estimado || 0);
        totalCompra += unit * Number(item.quantidade || 0);
        const prod = item.product_id ? mapaProdutos.get(item.product_id) : undefined;
        const setorId = item.sector_id_avulso || prod?.sector_id;
        const nomeSetor =
          (setorId && mapaSetores.get(setorId)) || "Avulso / Sem setor";
        setoresUsados.add(nomeSetor);
      }

      return [
        dataStr,
        c.nome,
        nomeMercado,
        Array.from(setoresUsados).join(", "),
        itensDoC.length,
        formatarNumeroCsvBR(totalCompra),
        pags || "Não informado",
      ];
    });

    baixarArquivoCsv(
      `pechincha_compras_resumo_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Data",
        "Compra",
        "Mercado",
        "Setores",
        "Qtd Itens",
        "Total (R$)",
        "Formas de Pagamento",
      ],
      linhas
    );
    mostrarFeedback("CSV resumido de compras gerado com sucesso!");
  }

  // (b) Backup Completo das Tabelas em CSV
  function handleExportarTabelaProdutosCsv() {
    const mapaSetores = new Map(setores.map((s) => [s.id, s.nome]));
    baixarArquivoCsv(
      "backup_produtos.csv",
      ["ID", "Nome", "Setor", "Unidade", "Emoji", "Ativo", "Criado Em"],
      produtos
        .filter((p) => !ehProdutoInternoSistema(p.codigo_barras))
        .map((p) => [
        p.id,
        p.nome,
        (p.sector_id && mapaSetores.get(p.sector_id)) || "",
        p.unidade,
        p.emoji || "",
        p.ativo ? "Sim" : "Não",
        p.criado_em,
      ])
    );
    mostrarFeedback("Tabela de produtos exportada!");
  }

  function handleExportarTabelaPrecosCsv() {
    const mapaProdutos = new Map(produtos.map((p) => [p.id, p.nome]));
    const mapaMercados = new Map(mercados.map((m) => [m.id, m.nome]));
    baixarArquivoCsv(
      "backup_historico_precos.csv",
      [
        "ID",
        "Data",
        "Produto",
        "Mercado",
        "Marca",
        "Valor (R$)",
        "Tipo",
        "Qtd Minima Atacado",
      ],
      precos.map((pr) => [
        pr.id,
        formatarDataBR(pr.data),
        mapaProdutos.get(pr.product_id) || pr.product_id,
        mapaMercados.get(pr.market_id) || pr.market_id,
        pr.marca || "",
        formatarNumeroCsvBR(Number(pr.valor)),
        pr.tipo,
        pr.quantidade_minima,
      ])
    );
    mostrarFeedback("Histórico completo de preços exportado!");
  }

  function handleExportarTabelaSetoresMercadosCsv() {
    baixarArquivoCsv(
      "backup_setores.csv",
      ["ID", "Nome", "Emoji", "Orcamento Mensal (R$)", "Ordem"],
      setores.map((s) => [
        s.id,
        s.nome,
        s.emoji,
        s.orcamento_mensal !== null
          ? formatarNumeroCsvBR(Number(s.orcamento_mensal))
          : "",
        s.ordem,
      ])
    );
    baixarArquivoCsv(
      "backup_mercados.csv",
      ["ID", "Nome", "Padrao"],
      mercados.map((m) => [m.id, m.nome, m.padrao ? "Sim" : "Não"])
    );
    mostrarFeedback("Tabelas de setores e mercados exportadas!");
  }

  function handleExportarTodasTabelasCsv() {
    handleExportarComprasPorSetorCsv();
    setTimeout(() => handleExportarTabelaProdutosCsv(), 250);
    setTimeout(() => handleExportarTabelaPrecosCsv(), 500);
    setTimeout(() => handleExportarTabelaSetoresMercadosCsv(), 750);
    mostrarFeedback("Todos os arquivos CSV de backup foram baixados!");
  }

  function handleExportarBackupJsonCompleto() {
    const configuracoesSeguras = settings
      ? {
          ...settings,
          ia_api_key: settings.ia_api_key ? "[OCULTADA NO BACKUP]" : null,
        }
      : null;
    const pacote = {
      exportado_em: new Date().toISOString(),
      grupo,
      configuracoes: configuracoesSeguras,
      mercados,
      setores,
      ordem_setores_mercado: ordemSetores,
      produtos: produtos.filter((p) => !ehProdutoInternoSistema(p.codigo_barras)),
      precos,
      carrinhos,
      itens_carrinho: itensCarrinho,
      pagamentos_carrinho: pagamentos,
    };
    const blob = new Blob([JSON.stringify(pacote, null, 2)], {
      type: "application/json;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `backup_completo_pechincha_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    mostrarFeedback("Backup completo JSON baixado!");
  }

  async function handleInstalarPwaDireto() {
    if (!eventoInstalarPwa) return;
    await eventoInstalarPwa.prompt();
    await eventoInstalarPwa.userChoice;
    setEventoInstalarPwa(null);
  }

  if (!configurado) {
    return <SupabaseSetupGuide />;
  }

  const qtdComprasFinalizadas = carrinhos.filter(
    (c) => c.status === "finalizado"
  ).length;

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-main pb-28 md:pb-8 md:pl-64">
      <main className="flex-1 w-full max-w-md md:max-w-4xl lg:max-w-6xl mx-auto px-5 md:px-8 pt-5 md:pt-8 flex flex-col gap-4">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <Link
            href="/mais"
            className="w-11 h-11 rounded-full bg-card border border-border flex items-center justify-center text-text-main hover:border-primary transition-colors shrink-0"
            aria-label="Voltar para Mais"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="text-[13px] text-text-muted font-medium">
              Finanças, Backup e Instalação
            </div>
            <h1 className="text-[24px] font-extrabold leading-tight">
              Exportar CSV e App
            </h1>
          </div>
        </div>

        {erro && (
          <div className="bg-budget-red-bg text-budget-red-text px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {mensagemSucesso && (
          <div className="bg-primary-light text-primary-hover px-4 py-3 rounded-2xl text-xs font-bold flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{mensagemSucesso}</span>
          </div>
        )}

        {carregando ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-44 w-full bg-border/70 rounded-card animate-pulse" />
            <div className="h-44 w-full bg-border/70 rounded-card animate-pulse" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
            {/* COLUNA ESQUERDA: Exportação e Backups */}
            <div className="flex flex-col gap-5">
              {/* 1. EXPORTAÇÃO PARA APP DE FINANÇAS (CSV) */}
              <section className="bg-card border border-border rounded-card p-4 sm:p-5 flex flex-col gap-3.5 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold">
                    Exportar compras (App de Finanças)
                  </h2>
                  <p className="text-xs text-text-muted">
                    {qtdComprasFinalizadas}{" "}
                    {qtdComprasFinalizadas === 1
                      ? "compra finalizada pronta"
                      : "compras finalizadas prontas"}{" "}
                    para exportar
                  </p>
                </div>
              </div>

              {/* Escolha do separador CSV */}
              <div className="flex items-center justify-between bg-background border border-border rounded-xl px-3 py-2 text-xs">
                <span className="font-semibold text-text-muted">
                  Separador de colunas:
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSeparadorCsv(";")}
                    className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                      separadorCsv === ";"
                        ? "bg-primary text-white"
                        : "bg-card text-text-muted border border-border"
                    }`}
                  >
                    Ponto e vírgula (;)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeparadorCsv(",")}
                    className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                      separadorCsv === ","
                        ? "bg-primary text-white"
                        : "bg-card text-text-muted border border-border"
                    }`}
                  >
                    Vírgula (,)
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleExportarComprasPorSetorCsv}
                  className="w-full h-12 px-4 rounded-btn bg-primary hover:bg-primary-hover text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Baixar CSV detalhado por setor</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportarComprasResumoCsv}
                  className="w-full h-11 px-4 rounded-btn bg-background border border-border hover:border-primary text-text-main font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-primary shrink-0" />
                  <span>Baixar CSV resumido (1 linha por compra)</span>
                </button>
              </div>

              <p className="text-[11px] text-text-muted leading-snug">
                Inclui data (dd/mm/aaaa), mercado, setor, total e formas de
                pagamento utilizadas.
              </p>
            </section>

            {/* 2. BACKUP COMPLETO DAS TABELAS */}
            <section className="bg-card border border-border rounded-card p-4 sm:p-5 flex flex-col gap-3.5 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center shrink-0">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold">
                    Backup completo das tabelas
                  </h2>
                  <p className="text-xs text-text-muted">
                    {produtos.length} produtos · {precos.length} preços ·{" "}
                    {setores.length} setores
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleExportarTodasTabelasCsv}
                className="w-full h-12 px-4 rounded-btn border-2 border-primary text-primary hover:bg-primary-light/50 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Baixar todas as tabelas em CSV</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleExportarTabelaProdutosCsv}
                  className="h-11 px-3 rounded-xl bg-background border border-border hover:border-primary text-xs font-bold text-text-main flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Produtos ({produtos.length})</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportarTabelaPrecosCsv}
                  className="h-11 px-3 rounded-xl bg-background border border-border hover:border-primary text-xs font-bold text-text-main flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Preços ({precos.length})</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportarTabelaSetoresMercadosCsv}
                  className="h-11 px-3 rounded-xl bg-background border border-border hover:border-primary text-xs font-bold text-text-main flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Setores e Mercados</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportarBackupJsonCompleto}
                  className="h-11 px-3 rounded-xl bg-background border border-border hover:border-primary text-xs font-bold text-primary flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Backup Único (.JSON)</span>
                </button>
              </div>
            </section>
          </div>

          {/* COLUNA DIREITA: Guia de Instalação PWA */}
          <div className="flex flex-col gap-5">
            {/* 3. GUIA DE INSTALAÇÃO DO APP NO CELULAR (ANDROID E IPHONE — SEÇÃO 3) */}
            <section className="bg-card border border-border rounded-card p-4 sm:p-5 flex flex-col gap-3.5 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold">
                    Instalar o app no celular (PWA)
                  </h2>
                  <p className="text-xs text-text-muted">
                    Funciona em tela cheia e continua salvo mesmo com sinal ruim
                    no mercado
                  </p>
                </div>
              </div>

              {eventoInstalarPwa && (
                <button
                  type="button"
                  onClick={handleInstalarPwaDireto}
                  className="w-full h-12 rounded-btn bg-primary text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Instalar aplicativo agora</span>
                </button>
              )}

              <div className="flex flex-col gap-2.5">
                {/* Passo a passo Android */}
                <div className="bg-background border border-border rounded-2xl p-3.5 flex flex-col gap-1.5">
                  <div className="text-xs font-extrabold text-text-main flex items-center gap-1.5">
                    <MoreVertical className="w-4 h-4 text-primary shrink-0" />
                    <span>No Android (Google Chrome):</span>
                  </div>
                  <ol className="text-xs text-text-muted pl-4 m-0 space-y-1 list-decimal">
                    <li>
                      Abra o Pechincha pelo navegador <strong>Chrome</strong>.
                    </li>
                    <li>
                      Toque nos <strong>3 pontinhos (⋮)</strong> no canto
                      superior direito.
                    </li>
                    <li>
                      Toque em <strong>&ldquo;Instalar aplicativo&rdquo;</strong>{" "}
                      (ou <strong>&ldquo;Adicionar à tela inicial&rdquo;</strong>
                      ) e confirme.
                    </li>
                  </ol>
                </div>

                {/* Passo a passo iPhone */}
                <div className="bg-background border border-border rounded-2xl p-3.5 flex flex-col gap-1.5">
                  <div className="text-xs font-extrabold text-text-main flex items-center gap-1.5">
                    <Share className="w-4 h-4 text-primary shrink-0" />
                    <span>No iPhone (Safari):</span>
                  </div>
                  <ol className="text-xs text-text-muted pl-4 m-0 space-y-1 list-decimal">
                    <li>
                      Abra o Pechincha pelo navegador <strong>Safari</strong>.
                    </li>
                    <li>
                      Toque no botão <strong>Compartilhar</strong> (ícone de
                      quadrado com seta para cima na barra inferior).
                    </li>
                    <li>
                      Role para baixo e toque em{" "}
                      <strong>&ldquo;Adicionar à Tela de Início&rdquo;</strong>{" "}
                      → <strong>&ldquo;Adicionar&rdquo;</strong>.
                    </li>
                  </ol>
                </div>
              </div>
            </section>
          </div>
        </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
