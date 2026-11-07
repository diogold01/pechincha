"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Package,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  Store,
  Tag,
  TrendingDown,
  Trash2,
  Pencil,
  AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BottomNav from "@/components/BottomNav";
import {
  calcularEstatisticasPreco,
  dataHojeISO,
  formatarDataBR,
  formatarDataCurtaBR,
  formatarMoeda,
  parseDecimalBR,
} from "@/lib/format";
import type {
  GroupSettings,
  Market,
  Price,
  Product,
  Sector,
} from "@/lib/types";

const UNIDADES_PADRAO = ["un", "kg", "g", "L", "ml", "pacote", "cx", "dz"];

export default function ProdutosPage() {
  const router = useRouter();

  const [carregando, setCarregando] = useState(true);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [settings, setSettings] = useState<GroupSettings | null>(null);
  const [setores, setSetores] = useState<Sector[]>([]);
  const [mercados, setMercados] = useState<Market[]>([]);
  const [produtos, setProdutos] = useState<Product[]>([]);
  const [precos, setPrecos] = useState<Price[]>([]);

  // Busca e Filtros
  const [busca, setBusca] = useState("");
  const [setorFiltroId, setSetorFiltroId] = useState<string>("todos");

  // Produto selecionado para ver detalhes e histórico
  const [produtoDetalheId, setProdutoDetalheId] = useState<string | null>(null);

  // Bottom sheet: Criar/Editar Produto
  const [sheetProdutoAberto, setSheetProdutoAberto] = useState(false);
  const [produtoEditando, setProdutoEditando] = useState<Product | null>(null);
  const [nomeProduto, setNomeProduto] = useState("");
  const [setorProdutoId, setSetorProdutoId] = useState<string>("");
  const [unidadeProduto, setUnidadeProduto] = useState("un");
  const [emojiProduto, setEmojiProduto] = useState("");
  // Preço inicial opcional ao criar produto
  const [precoInicialTexto, setPrecoInicialTexto] = useState("");
  const [marcaInicial, setMarcaInicial] = useState("");
  const [mercadoInicialId, setMercadoInicialId] = useState("");
  const [novoMercadoRapido, setNovoMercadoRapido] = useState("");

  // Bottom sheet: Registrar Novo Preço (estilo 3-preco-do-item.html)
  const [sheetPrecoAberto, setSheetPrecoAberto] = useState(false);
  const [valorPrecoTexto, setValorPrecoTexto] = useState("");
  const [mercadoPrecoId, setMercadoPrecoId] = useState("");
  const [marcaPreco, setMarcaPreco] = useState("");
  const [dataPreco, setDataPreco] = useState(dataHojeISO());
  const [mostrarAtacado, setMostrarAtacado] = useState(false);
  const [ehAtacado, setEhAtacado] = useState(false);
  const [qtdMinimaAtacado, setQtdMinimaAtacado] = useState("6");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
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
        { data: stData },
        { data: secData },
        { data: mktData },
        { data: prodData },
        { data: prcData },
      ] = await Promise.all([
        supabase.from("group_settings").select("*").eq("group_id", gId).single(),
        supabase
          .from("sectors")
          .select("*")
          .eq("group_id", gId)
          .order("ordem", { ascending: true })
          .order("nome", { ascending: true }),
        supabase
          .from("markets")
          .select("*")
          .eq("group_id", gId)
          .order("padrao", { ascending: false })
          .order("nome", { ascending: true }),
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
      ]);

      setSettings((stData as GroupSettings) || null);
      setSetores((secData as Sector[]) || []);
      setMercados((mktData as Market[]) || []);
      setProdutos((prodData as Product[]) || []);
      setPrecos((prcData as Price[]) || []);
    } catch {
      setErro("Erro ao carregar os produtos.");
    } finally {
      setCarregando(false);
    }
  }, [router]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Mapa rápido de setores e mercados
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
    const padrao = mercados.find((m) => m.padrao);
    return padrao?.id || mercados[0]?.id || null;
  }, [settings, mercados]);

  // Lista única de todas as marcas já usadas no grupo (para autocompletar)
  const marcasExistentes = useMemo(() => {
    const set = new Set<string>();
    precos.forEach((p) => {
      if (p.marca && p.marca.trim()) {
        set.add(p.marca.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [precos]);

  // Agrupa preços por produto
  const precosPorProduto = useMemo(() => {
    const map = new Map<string, Price[]>();
    precos.forEach((p) => {
      const lista = map.get(p.product_id) || [];
      lista.push(p);
      map.set(p.product_id, lista);
    });
    return map;
  }, [precos]);

  // Filtra produtos pela busca e pelo setor selecionado
  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (setorFiltroId !== "todos" && p.sector_id !== setorFiltroId) {
        return false;
      }
      if (!termo) return true;
      if (p.nome.toLowerCase().includes(termo)) return true;
      // Também busca pelas marcas registradas no produto
      const listaPrecos = precosPorProduto.get(p.id) || [];
      return listaPrecos.some((pr) =>
        (pr.marca || "").toLowerCase().includes(termo)
      );
    });
  }, [produtos, setorFiltroId, busca, precosPorProduto]);

  const produtoDetalhe = useMemo(
    () => produtos.find((p) => p.id === produtoDetalheId) || null,
    [produtos, produtoDetalheId]
  );

  const estatisticasDetalhe = useMemo(() => {
    if (!produtoDetalhe) return null;
    const lista = precosPorProduto.get(produtoDetalhe.id) || [];
    return calcularEstatisticasPreco(lista, {
      metodo: settings?.metodo_preco || "media",
      mesesMedia: settings?.meses_media || 3,
      marketIdPreferencial: mercadoPadraoId,
    });
  }, [produtoDetalhe, precosPorProduto, settings, mercadoPadraoId]);

  // --- Ações de Produto ---
  function abrirNovoProduto() {
    setErro(null);
    setProdutoEditando(null);
    setNomeProduto(busca.trim());
    setSetorProdutoId(
      setorFiltroId !== "todos" ? setorFiltroId : setores[0]?.id || ""
    );
    setUnidadeProduto("un");
    setEmojiProduto("");
    setPrecoInicialTexto("");
    setMarcaInicial("");
    setMercadoInicialId(mercadoPadraoId || "");
    setNovoMercadoRapido("");
    setSheetProdutoAberto(true);
  }

  function abrirEditarProduto(p: Product) {
    setErro(null);
    setProdutoEditando(p);
    setNomeProduto(p.nome);
    setSetorProdutoId(p.sector_id || "");
    setUnidadeProduto(p.unidade || "un");
    setEmojiProduto(p.emoji || "");
    setSheetProdutoAberto(true);
  }

  async function handleSalvarProduto(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || !nomeProduto.trim()) {
      setErro("Informe o nome do produto.");
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      const supabase = createClient();
      const nomeLimpo = nomeProduto.trim();

      // Garante operação estrita de UPDATE se estiver editando OU se já existir produto com mesmo nome
      const alvoUpdate =
        produtoEditando ||
        produtos.find(
          (p) => p.nome.trim().toLowerCase() === nomeLimpo.toLowerCase()
        ) ||
        null;

      if (alvoUpdate) {
        const { error } = await supabase
          .from("products")
          .update({
            nome: nomeLimpo,
            sector_id: setorProdutoId || null,
            unidade: unidadeProduto,
            emoji: emojiProduto.trim() || null,
            ativo: true,
          })
          .eq("id", alvoUpdate.id);
        if (error) throw error;
      } else {
        const { data: prodCriado, error } = await supabase
          .from("products")
          .insert({
            group_id: groupId,
            nome: nomeLimpo,
            sector_id: setorProdutoId || null,
            unidade: unidadeProduto,
            emoji: emojiProduto.trim() || null,
            ativo: true,
          })
          .select()
          .single();

        if (error) throw error;

        // Se o usuário digitou um preço inicial, salva junto!
        const valorNum = parseDecimalBR(precoInicialTexto);
        if (valorNum > 0 && prodCriado) {
          let mktIdFinal = mercadoInicialId;

          // Se não existia mercado cadastrado e o usuário digitou o nome de um mercado rápido
          if (!mktIdFinal && novoMercadoRapido.trim()) {
            const { data: mktNovo } = await supabase
              .from("markets")
              .insert({
                group_id: groupId,
                nome: novoMercadoRapido.trim(),
                padrao: true,
              })
              .select()
              .single();
            if (mktNovo) {
              mktIdFinal = (mktNovo as Market).id;
              await supabase
                .from("group_settings")
                .update({ mercado_padrao_id: mktIdFinal })
                .eq("group_id", groupId);
            }
          }

          if (mktIdFinal) {
            await supabase.from("prices").insert({
              group_id: groupId,
              product_id: (prodCriado as Product).id,
              market_id: mktIdFinal,
              marca: marcaInicial.trim() || null,
              valor: valorNum,
              tipo: "varejo",
              quantidade_minima: 1,
              data: dataHojeISO(),
              criado_por: userId,
            });
          }
        }
      }

      setProdutoEditando(null);
      setSheetProdutoAberto(false);
      await carregarDados();
    } catch {
      setErro("Não foi possível salvar o produto.");
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluirProduto(p: Product) {
    if (!groupId) return;
    setSalvando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) {
        // Se já estiver em algum carrinho antigo, apenas desativa
        await supabase
          .from("products")
          .update({ ativo: false })
          .eq("id", p.id);
      }
      setSheetProdutoAberto(false);
      setProdutoDetalheId(null);
      await carregarDados();
    } finally {
      setSalvando(false);
    }
  }

  // --- Ações de Preço ---
  function abrirRegistrarPreco(prod: Product) {
    setErro(null);
    setProdutoDetalheId(prod.id);
    const lista = precosPorProduto.get(prod.id) || [];
    const ultimoVarejo = lista.find((x) => x.tipo === "varejo");

    setValorPrecoTexto(
      ultimoVarejo
        ? Number(ultimoVarejo.valor).toFixed(2).replace(".", ",")
        : ""
    );
    setMercadoPrecoId(
      mercadoPadraoId || ultimoVarejo?.market_id || mercados[0]?.id || ""
    );
    setMarcaPreco(ultimoVarejo?.marca || "");
    setDataPreco(dataHojeISO());
    setMostrarAtacado(false);
    setEhAtacado(false);
    setQtdMinimaAtacado("6");
    setSheetPrecoAberto(true);
  }

  async function handleSalvarPreco(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || !produtoDetalhe) return;

    const valorNum = parseDecimalBR(valorPrecoTexto);
    if (valorNum <= 0) {
      setErro("Informe um valor maior que zero.");
      return;
    }

    let mktId = mercadoPrecoId;
    const supabase = createClient();
    setSalvando(true);
    setErro(null);

    try {
      if (!mktId && novoMercadoRapido.trim()) {
        const { data: mktCriado, error: mktErr } = await supabase
          .from("markets")
          .insert({
            group_id: groupId,
            nome: novoMercadoRapido.trim(),
            padrao: mercados.length === 0,
          })
          .select()
          .single();
        if (mktErr) throw mktErr;
        mktId = (mktCriado as Market).id;
      }

      if (!mktId) {
        setErro("Escolha ou cadastre um mercado para registrar o preço.");
        setSalvando(false);
        return;
      }

      const qtdMin = ehAtacado
        ? Math.max(2, parseDecimalBR(qtdMinimaAtacado) || 2)
        : 1;

      const { error } = await supabase.from("prices").insert({
        group_id: groupId,
        product_id: produtoDetalhe.id,
        market_id: mktId,
        marca: marcaPreco.trim() || null,
        valor: valorNum,
        tipo: ehAtacado ? "atacado" : "varejo",
        quantidade_minima: qtdMin,
        data: dataPreco || dataHojeISO(),
        criado_por: userId,
      });

      if (error) throw error;

      setSheetPrecoAberto(false);
      await carregarDados();
    } catch {
      setErro("Não foi possível registrar o preço.");
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluirPreco(precoId: string) {
    const supabase = createClient();
    await supabase.from("prices").delete().eq("id", precoId);
    await carregarDados();
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-main pb-28 md:pb-8 md:pl-64">
      <main className="flex-1 w-full max-w-md md:max-w-4xl lg:max-w-6xl mx-auto px-4 sm:px-5 md:px-8 pt-5 md:pt-8 flex flex-col gap-4">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] text-text-muted font-medium">
              Catálogo e Histórico de Preços
            </div>
            <h1 className="text-[28px] font-extrabold leading-tight">
              Produtos
            </h1>
          </div>
          <button
            type="button"
            onClick={abrirNovoProduto}
            className="h-11 px-4 rounded-btn bg-primary hover:bg-primary-hover text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo produto</span>
          </button>
        </div>

        {/* Barra de Busca Instantânea */}
        <div className="relative flex items-center">
          <Search className="w-5 h-5 text-text-muted absolute left-3.5" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto ou marca..."
            className="w-full h-12 pl-11 pr-10 rounded-2xl bg-card border border-border text-sm font-medium text-text-main focus:outline-none focus:border-primary shadow-sm"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca("")}
              className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted absolute right-2 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filtro Horizontal por Setor */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setSetorFiltroId("todos")}
            className={`h-10 px-4 rounded-full text-xs font-bold shrink-0 border transition-colors cursor-pointer ${
              setorFiltroId === "todos"
                ? "bg-primary text-white border-primary"
                : "bg-card text-text-muted border-border hover:text-text-main"
            }`}
          >
            Todos ({produtos.length})
          </button>
          {setores.map((s) => {
            const ativo = setorFiltroId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSetorFiltroId(s.id)}
                className={`h-10 px-3.5 rounded-full text-xs font-bold shrink-0 border flex items-center gap-1.5 transition-colors cursor-pointer ${
                  ativo
                    ? "bg-primary text-white border-primary"
                    : "bg-card text-text-muted border-border hover:text-text-main"
                }`}
              >
                <span>{s.emoji}</span>
                <span>{s.nome}</span>
              </button>
            );
          })}
        </div>

        {/* Lista de Produtos */}
        {carregando ? (
          <div className="flex flex-col gap-2.5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-16 bg-border/70 rounded-2xl animate-pulse"
              />
            ))}
          </div>
        ) : produtosFiltrados.length === 0 ? (
          <div className="bg-card border border-border rounded-card p-6 text-center flex flex-col items-center gap-3 mt-2">
            <div className="w-12 h-12 rounded-2xl bg-primary-light text-primary flex items-center justify-center">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-extrabold">
                {busca
                  ? `Nenhum produto para "${busca}"`
                  : "Nenhum produto cadastrado"}
              </h2>
              <p className="text-xs text-text-muted mt-1">
                Cadastre seus produtos favoritos para acompanhar a evolução dos
                preços por mercado e marca.
              </p>
            </div>
            <button
              type="button"
              onClick={abrirNovoProduto}
              className="h-11 px-5 rounded-btn bg-primary text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>
                {busca ? `Cadastrar "${busca}"` : "Cadastrar primeiro produto"}
              </span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {produtosFiltrados.map((prod) => {
              const setor = prod.sector_id
                ? mapaSetores.get(prod.sector_id)
                : null;
              const emojiExibido = prod.emoji || setor?.emoji || "📦";
              const listaPrecos = precosPorProduto.get(prod.id) || [];
              const stats = calcularEstatisticasPreco(listaPrecos, {
                metodo: settings?.metodo_preco || "media",
                mesesMedia: settings?.meses_media || 3,
                marketIdPreferencial: mercadoPadraoId,
              });

              return (
                <div
                  key={prod.id}
                  onClick={() => setProdutoDetalheId(prod.id)}
                  className="bg-card border border-border hover:border-primary/50 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm cursor-pointer transition-colors"
                >
                  <div className="w-11 h-11 rounded-xl bg-background flex items-center justify-center text-xl shrink-0">
                    {emojiExibido}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-bold text-text-main truncate">
                      {prod.nome}
                    </div>
                    <div className="text-xs text-text-muted flex items-center gap-1.5 truncate">
                      <span>{setor?.nome || "Sem setor"}</span>
                      <span>·</span>
                      <span>por {prod.unidade}</span>
                      {stats.precosAtacado.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-primary font-semibold">
                            tem atacado
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {stats.estimado !== null ? (
                      <>
                        <div className="text-[15px] font-extrabold text-text-main">
                          {formatarMoeda(stats.estimado)}
                        </div>
                        <div className="text-[11px] font-semibold text-text-muted">
                          {stats.desatualizado
                            ? "desatualizado"
                            : stats.usouOutroMercado
                            ? "outro mercado"
                            : `est. / ${prod.unidade}`}
                        </div>
                      </>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary-light text-primary text-xs font-bold">
                        + Preço
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* PAINEL DETALHE DO PRODUTO E HISTÓRICO DE PREÇOS */}
      {produtoDetalhe && estatisticasDetalhe && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end justify-center">
          <div className="w-full max-w-md max-h-[90vh] bg-background rounded-t-[24px] flex flex-col overflow-hidden shadow-xl">
            {/* Cabeçalho fixo do detalhe */}
            <div className="bg-card border-b border-border px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl">
                  {produtoDetalhe.emoji ||
                    (produtoDetalhe.sector_id
                      ? mapaSetores.get(produtoDetalhe.sector_id)?.emoji
                      : "📦")}
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-extrabold text-text-main truncate">
                    {produtoDetalhe.nome}
                  </h2>
                  <p className="text-xs text-text-muted">
                    {produtoDetalhe.sector_id
                      ? mapaSetores.get(produtoDetalhe.sector_id)?.nome
                      : "Sem setor"}{" "}
                    · Unidade: <strong>{produtoDetalhe.unidade}</strong>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => abrirEditarProduto(produtoDetalhe)}
                  className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-text-muted hover:text-text-main cursor-pointer"
                  title="Editar produto"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setProdutoDetalheId(null)}
                  className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-text-muted hover:text-text-main cursor-pointer"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Corpo rolável do detalhe */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4">
              {/* Botão Principal: Registrar Novo Preço */}
              <button
                type="button"
                onClick={() => abrirRegistrarPreco(produtoDetalhe)}
                className="w-full h-12 rounded-btn bg-primary hover:bg-primary-hover text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm shrink-0 cursor-pointer"
              >
                <Plus className="w-5 h-5" />
                <span>Registrar novo preço</span>
              </button>

              {/* 4 Cards de Estatísticas: Estimado, Último, Menor e Maior */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-card border border-border rounded-2xl p-3.5">
                  <div className="text-[11px] font-bold text-text-muted uppercase">
                    Preço Estimado
                  </div>
                  <div className="text-xl font-extrabold text-primary mt-0.5">
                    {estatisticasDetalhe.estimado !== null
                      ? formatarMoeda(estatisticasDetalhe.estimado)
                      : "—"}
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5">
                    {estatisticasDetalhe.desatualizado
                      ? "Desatualizado (fora do período)"
                      : estatisticasDetalhe.usouOutroMercado
                      ? "Baseado em outro mercado"
                      : `Média (${settings?.meses_media || 3} meses)`}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-2xl p-3.5">
                  <div className="text-[11px] font-bold text-text-muted uppercase">
                    Último Preço
                  </div>
                  <div className="text-xl font-extrabold text-text-main mt-0.5">
                    {estatisticasDetalhe.ultimo !== null
                      ? formatarMoeda(estatisticasDetalhe.ultimo)
                      : "—"}
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5 truncate">
                    {estatisticasDetalhe.ultimoData
                      ? `${formatarDataCurtaBR(estatisticasDetalhe.ultimoData)} · ${
                          mapaMercados.get(
                            estatisticasDetalhe.ultimoMarketId || ""
                          )?.nome || ""
                        }`
                      : "Sem registros"}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-2xl p-3.5">
                  <div className="text-[11px] font-bold text-text-muted uppercase">
                    Menor Preço
                  </div>
                  <div className="text-lg font-extrabold text-text-main mt-0.5">
                    {estatisticasDetalhe.menor !== null
                      ? formatarMoeda(estatisticasDetalhe.menor)
                      : "—"}
                  </div>
                  <div className="text-[11px] text-text-muted truncate">
                    {estatisticasDetalhe.menorMarketId
                      ? mapaMercados.get(estatisticasDetalhe.menorMarketId)
                          ?.nome || ""
                      : "—"}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-2xl p-3.5">
                  <div className="text-[11px] font-bold text-text-muted uppercase">
                    Maior Preço
                  </div>
                  <div className="text-lg font-extrabold text-text-main mt-0.5">
                    {estatisticasDetalhe.maior !== null
                      ? formatarMoeda(estatisticasDetalhe.maior)
                      : "—"}
                  </div>
                  <div className="text-[11px] text-text-muted">No varejo</div>
                </div>
              </div>

              {/* Gráfico Simples de Evolução (SVG) */}
              {estatisticasDetalhe.precosVarejo.length >= 2 && (
                <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2">
                  <div className="text-xs font-extrabold text-text-main">
                    Evolução do preço (varejo)
                  </div>
                  {(() => {
                    const pontos = [
                      ...estatisticasDetalhe.precosVarejo.slice(0, 8),
                    ].reverse();
                    const valores = pontos.map((p) => Number(p.valor));
                    const minV = Math.min(...valores);
                    const maxV = Math.max(...valores);
                    const amplitude = maxV - minV || 1;
                    const largura = 300;
                    const altura = 70;

                    const coords = pontos.map((p, idx) => {
                      const x =
                        pontos.length === 1
                          ? largura / 2
                          : (idx / (pontos.length - 1)) * (largura - 24) + 12;
                      const y =
                        altura -
                        14 -
                        ((Number(p.valor) - minV) / amplitude) * (altura - 28);
                      return { x, y, p };
                    });

                    const pathD = coords
                      .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`)
                      .join(" ");

                    return (
                      <div className="pt-1">
                        <svg
                          viewBox={`0 0 ${largura} ${altura}`}
                          className="w-full h-20 overflow-visible"
                        >
                          <path
                            d={pathD}
                            fill="none"
                            stroke="#3B4CCA"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {coords.map((c, idx) => (
                            <g key={c.p.id || idx}>
                              <circle
                                cx={c.x}
                                cy={c.y}
                                r="4"
                                fill="#FFFFFF"
                                stroke="#3B4CCA"
                                strokeWidth="2.5"
                              />
                            </g>
                          ))}
                        </svg>
                        <div className="flex justify-between text-[10px] text-text-muted font-semibold mt-1">
                          <span>
                            {formatarDataCurtaBR(pontos[0].data)} (
                            {formatarMoeda(pontos[0].valor)})
                          </span>
                          <span>
                            {formatarDataCurtaBR(
                              pontos[pontos.length - 1].data
                            )}{" "}
                            ({formatarMoeda(pontos[pontos.length - 1].valor)})
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Comparação entre Mercados: Onde está mais barato */}
              {estatisticasDetalhe.menorPorMercado.length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-text-main">
                    <Store className="w-4 h-4 text-primary" />
                    <span>Comparativo entre mercados</span>
                  </div>
                  <div className="flex flex-col divide-y divide-border">
                    {estatisticasDetalhe.menorPorMercado.map((item, idx) => {
                      const mkt = mapaMercados.get(item.market_id);
                      const maisBarato =
                        idx === 0 &&
                        estatisticasDetalhe.menorPorMercado.length > 1;
                      return (
                        <div
                          key={item.market_id}
                          className="py-2 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-text-main">
                              {mkt?.nome || "Mercado"}
                            </span>
                            {maisBarato && (
                              <span className="px-2 py-0.5 rounded-full bg-primary-light text-primary font-extrabold text-[10px] flex items-center gap-1">
                                <TrendingDown className="w-3 h-3" />
                                Mais barato
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="font-extrabold text-text-main">
                              {formatarMoeda(item.ultimoValor)}
                            </span>
                            <span className="text-text-muted ml-1.5 text-[11px]">
                              (méd. {formatarMoeda(item.mediaValor)})
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Comparação entre Marcas */}
              {estatisticasDetalhe.menorPorMarca.length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-text-main">
                    <Tag className="w-4 h-4 text-primary" />
                    <span>Comparativo por marca</span>
                  </div>
                  <div className="flex flex-col divide-y divide-border">
                    {estatisticasDetalhe.menorPorMarca.map((item) => (
                      <div
                        key={item.marca}
                        className="py-2 flex items-center justify-between text-xs"
                      >
                        <span className="font-bold text-text-main">
                          {item.marca}
                        </span>
                        <div>
                          <span className="font-extrabold text-text-main">
                            {formatarMoeda(item.ultimoValor)}
                          </span>
                          <span className="text-text-muted ml-1.5 text-[11px]">
                            (menor {formatarMoeda(item.menorValor)})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preços de Atacado Separados (Seção 6) */}
              {estatisticasDetalhe.precosAtacado.length > 0 && (
                <div className="bg-primary-light/60 border border-primary/20 rounded-2xl p-4 flex flex-col gap-2">
                  <div className="text-xs font-extrabold text-primary-hover">
                    Preços de Atacado (não entram na média do varejo)
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {estatisticasDetalhe.precosAtacado
                      .slice(0, 5)
                      .map((at) => (
                        <div
                          key={at.id}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-text-main font-semibold">
                            Mín. {Number(at.quantidade_minima)}{" "}
                            {produtoDetalhe.unidade} ·{" "}
                            {mapaMercados.get(at.market_id)?.nome || "Mercado"}
                            {at.marca ? ` · ${at.marca}` : ""}
                          </span>
                          <span className="font-extrabold text-primary-hover">
                            {formatarMoeda(at.valor)}/{produtoDetalhe.unidade}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Histórico Completo de Lançamentos */}
              <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2.5">
                <div className="text-xs font-extrabold text-text-main">
                  Histórico de lançamentos (
                  {estatisticasDetalhe.precosVarejo.length +
                    estatisticasDetalhe.precosAtacado.length}
                  )
                </div>

                {estatisticasDetalhe.precosVarejo.length === 0 &&
                estatisticasDetalhe.precosAtacado.length === 0 ? (
                  <p className="text-xs text-text-muted">
                    Nenhum preço registrado ainda para este produto.
                  </p>
                ) : (
                  <div className="flex flex-col divide-y divide-border">
                    {(precosPorProduto.get(produtoDetalhe.id) || []).map(
                      (pr) => {
                        const mkt = mapaMercados.get(pr.market_id);
                        return (
                          <div
                            key={pr.id}
                            className="py-2.5 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-text-main truncate">
                                {mkt?.nome || "Mercado"}
                                {pr.marca ? ` · ${pr.marca}` : ""}
                              </div>
                              <div className="text-[11px] text-text-muted">
                                {formatarDataBR(pr.data)}
                                {pr.tipo === "atacado"
                                  ? ` · Atacado (mín. ${Number(
                                      pr.quantidade_minima
                                    )} ${produtoDetalhe.unidade})`
                                  : " · Varejo"}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-extrabold text-sm text-text-main">
                                {formatarMoeda(pr.valor)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleExcluirPreco(pr.id)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-budget-red cursor-pointer"
                                title="Excluir este registro"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM SHEET: CRIAR / EDITAR PRODUTO */}
      {sheetProdutoAberto && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
          <div className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-card rounded-t-[24px] p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">
                {produtoEditando ? "Editar produto" : "Novo produto"}
              </h3>
              <button
                type="button"
                onClick={() => setSheetProdutoAberto(false)}
                className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-text-muted cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {erro && (
              <div className="bg-budget-red-bg text-budget-red-text px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            <form onSubmit={handleSalvarProduto} className="flex flex-col gap-3.5">
              <div className="flex gap-2.5">
                <div className="w-20 flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-muted">
                    Emoji
                  </label>
                  <input
                    type="text"
                    value={emojiProduto}
                    onChange={(e) => setEmojiProduto(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder={
                      (setorProdutoId &&
                        mapaSetores.get(setorProdutoId)?.emoji) ||
                      "📦"
                    }
                    className="w-full h-12 text-center rounded-xl bg-background border border-border text-lg focus:outline-none focus:border-primary focus:placeholder-transparent"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-muted">
                    Nome do produto
                  </label>
                  <input
                    type="text"
                    value={nomeProduto}
                    onChange={(e) => setNomeProduto(e.target.value)}
                    placeholder="Ex: Contra-filé, Banana prata..."
                    autoFocus
                    className="w-full h-12 px-4 rounded-xl bg-background border border-border text-sm font-semibold text-text-main focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-muted">
                    Setor
                  </label>
                  <select
                    value={setorProdutoId}
                    onChange={(e) => setSetorProdutoId(e.target.value)}
                    className="w-full h-12 px-3 rounded-xl bg-background border border-border text-sm font-semibold text-text-main focus:outline-none focus:border-primary"
                  >
                    <option value="">Sem setor</option>
                    {setores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.emoji} {s.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-muted">
                    Unidade
                  </label>
                  <select
                    value={unidadeProduto}
                    onChange={(e) => setUnidadeProduto(e.target.value)}
                    className="w-full h-12 px-3 rounded-xl bg-background border border-border text-sm font-semibold text-text-main focus:outline-none focus:border-primary"
                  >
                    {UNIDADES_PADRAO.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Preço inicial opcional apenas ao criar um produto novo */}
              {!produtoEditando && (
                <div className="bg-background border border-border rounded-2xl p-3.5 flex flex-col gap-3 mt-1">
                  <div className="text-xs font-bold text-text-muted">
                    Preço inicial (opcional — deixe em branco se não souber
                    agora)
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-text-muted">
                        Valor (R$)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={precoInicialTexto}
                        onChange={(e) => setPrecoInicialTexto(e.target.value)}
                        placeholder="Ex: 12,90"
                        className="w-full h-11 px-3 rounded-xl bg-card border border-border text-sm font-extrabold text-text-main focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-text-muted">
                        Marca (opcional)
                      </label>
                      <input
                        type="text"
                        list="marcas-historico"
                        value={marcaInicial}
                        onChange={(e) => setMarcaInicial(e.target.value)}
                        placeholder="Ex: Friboi, Italac"
                        className="w-full h-11 px-3 rounded-xl bg-card border border-border text-sm font-medium text-text-main focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  {mercados.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-text-muted">
                        Mercado
                      </label>
                      <select
                        value={mercadoInicialId}
                        onChange={(e) => setMercadoInicialId(e.target.value)}
                        className="w-full h-11 px-3 rounded-xl bg-card border border-border text-sm font-semibold text-text-main"
                      >
                        {mercados.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nome} {m.padrao ? "(Padrão)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-text-muted">
                        Qual o nome do mercado? (será salvo como padrão)
                      </label>
                      <input
                        type="text"
                        value={novoMercadoRapido}
                        onChange={(e) => setNovoMercadoRapido(e.target.value)}
                        placeholder="Ex: Mercado Bom Preço"
                        className="w-full h-11 px-3 rounded-xl bg-card border border-border text-sm font-semibold text-text-main"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2.5 pt-2">
                {produtoEditando && (
                  <button
                    type="button"
                    onClick={() => handleExcluirProduto(produtoEditando)}
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
                  <span>{salvando ? "Salvando..." : "Salvar produto"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BOTTOM SHEET: REGISTRAR NOVO PREÇO (Seguindo 3-preco-do-item.html) */}
      {sheetPrecoAberto && produtoDetalhe && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end justify-center">
          <div className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-card rounded-t-[24px] p-5 flex flex-col gap-3.5">
            <div className="w-10 h-1.5 rounded-full bg-border mx-auto" />

            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-extrabold text-text-main">
                  {produtoDetalhe.nome}
                </h3>
                <p className="text-xs text-text-muted">
                  Registrar preço por {produtoDetalhe.unidade}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSheetPrecoAberto(false)}
                className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-text-muted cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {erro && (
              <div className="bg-budget-red-bg text-budget-red-text px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            <form onSubmit={handleSalvarPreco} className="flex flex-col gap-3.5">
              {/* Campo de preço em destaque conforme 3-preco-do-item.html */}
              <div className="bg-background border-2 border-primary rounded-2xl p-3.5">
                <div className="text-xs font-semibold text-text-muted">
                  Preço por {produtoDetalhe.unidade}
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-bold text-text-muted">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={valorPrecoTexto}
                    onChange={(e) => setValorPrecoTexto(e.target.value)}
                    placeholder="0,00"
                    autoFocus
                    className="w-full bg-transparent text-3xl font-extrabold text-text-main focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Mercado e Data */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-muted">
                    Mercado
                  </label>
                  {mercados.length > 0 ? (
                    <select
                      value={mercadoPrecoId}
                      onChange={(e) => setMercadoPrecoId(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl bg-background border border-border text-xs font-bold text-text-main"
                    >
                      {mercados.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome} {m.padrao ? "★" : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={novoMercadoRapido}
                      onChange={(e) => setNovoMercadoRapido(e.target.value)}
                      placeholder="Nome do mercado"
                      className="w-full h-11 px-3 rounded-xl bg-background border border-border text-xs font-bold text-text-main"
                      required
                    />
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-muted">
                    Data
                  </label>
                  <input
                    type="date"
                    value={dataPreco}
                    onChange={(e) => setDataPreco(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-background border border-border text-xs font-bold text-text-main"
                  />
                </div>
              </div>

              {/* Marca com chips de autocompletar conforme 3-preco-do-item.html */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-muted">
                  Marca (opcional)
                </label>
                <input
                  type="text"
                  list="marcas-historico"
                  value={marcaPreco}
                  onChange={(e) => setMarcaPreco(e.target.value)}
                  placeholder="Digite ou toque em uma marca abaixo"
                  className="w-full h-11 px-3.5 rounded-xl bg-background border border-border text-sm font-semibold text-text-main focus:outline-none focus:border-primary"
                />
                {marcasExistentes.length > 0 && (
                  <div className="flex gap-1.5 overflow-x-auto pt-0.5 pb-1">
                    {marcasExistentes.slice(0, 8).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() =>
                          setMarcaPreco(marcaPreco === m ? "" : m)
                        }
                        className={`h-8 px-3 rounded-full text-xs font-bold shrink-0 border cursor-pointer ${
                          marcaPreco.toLowerCase() === m.toLowerCase()
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

              {/* Atacado discreto (Seção 6: escondido por padrão em "Mais opções (atacado)") */}
              <div className="border border-border rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMostrarAtacado(!mostrarAtacado)}
                  className="w-full h-11 px-3.5 bg-background flex items-center justify-between text-xs font-bold text-text-muted cursor-pointer"
                >
                  <span>
                    Mais opções (atacado){" "}
                    {ehAtacado ? "· Ativado" : "· opcional"}
                  </span>
                  {mostrarAtacado ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>

                {mostrarAtacado && (
                  <div className="p-3.5 bg-card border-t border-border flex flex-col gap-3">
                    <label className="flex items-center gap-2.5 text-xs font-bold text-text-main cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ehAtacado}
                        onChange={(e) => setEhAtacado(e.target.checked)}
                        className="w-4 h-4 accent-primary"
                      />
                      <span>
                        Este é um preço de atacado (não entra na média do
                        varejo)
                      </span>
                    </label>

                    {ehAtacado && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-text-muted font-semibold">
                          Quantidade mínima ({produtoDetalhe.unidade}):
                        </span>
                        <input
                          type="number"
                          min={2}
                          step="1"
                          value={qtdMinimaAtacado}
                          onChange={(e) => setQtdMinimaAtacado(e.target.value)}
                          className="w-24 h-10 px-3 rounded-xl bg-background border border-border text-sm font-extrabold text-center text-text-main"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={salvando}
                className="h-12 rounded-btn bg-primary hover:bg-primary-hover text-white font-extrabold text-[15px] flex items-center justify-center gap-2 mt-1 cursor-pointer"
              >
                <Check className="w-5 h-5" />
                <span>{salvando ? "Salvando..." : "Confirmar preço"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Datalist global de marcas para autocompletar */}
      <datalist id="marcas-historico">
        {marcasExistentes.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <BottomNav />
    </div>
  );
}
