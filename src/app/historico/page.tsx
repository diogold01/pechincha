"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Store,
  Calendar,
  CreditCard,
  Trash2,
  AlertCircle,
  ShoppingBag,
} from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import SupabaseSetupGuide from "@/components/SupabaseSetupGuide";
import BottomNav from "@/components/BottomNav";
import { repetirCarrinhoNoBanco } from "@/lib/cart-actions";
import { formatarDataBR, formatarDataCurtaBR, formatarMoeda } from "@/lib/format";
import type {
  Cart,
  CartItem,
  CartPayment,
  Market,
  Product,
  Sector,
} from "@/lib/types";

export default function HistoricoCarrinhosPage() {
  const router = useRouter();
  const configurado = isSupabaseConfigured();

  const [carregando, setCarregando] = useState(true);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [carrinhos, setCarrinhos] = useState<Cart[]>([]);
  const [itens, setItens] = useState<CartItem[]>([]);
  const [pagamentos, setPagamentos] = useState<CartPayment[]>([]);
  const [mercados, setMercados] = useState<Market[]>([]);
  const [setores, setSetores] = useState<Sector[]>([]);
  const [produtos, setProdutos] = useState<Product[]>([]);

  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [copiandoId, setCopiandoId] = useState<string | null>(null);
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = useState<
    string | null
  >(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregarHistorico = useCallback(async () => {
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
        { data: cartsData },
        { data: itemsData },
        { data: payData },
        { data: mktData },
        { data: secData },
        { data: prodData },
      ] = await Promise.all([
        supabase
          .from("carts")
          .select("*")
          .eq("group_id", gId)
          .eq("status", "finalizado")
          .order("finalizado_em", { ascending: false })
          .order("criado_em", { ascending: false }),
        supabase.from("cart_items").select("*").eq("group_id", gId),
        supabase.from("cart_payments").select("*").eq("group_id", gId),
        supabase.from("markets").select("*").eq("group_id", gId),
        supabase
          .from("sectors")
          .select("*")
          .eq("group_id", gId)
          .order("ordem", { ascending: true }),
        supabase.from("products").select("*").eq("group_id", gId),
      ]);

      setCarrinhos((cartsData as Cart[]) || []);
      setItens((itemsData as CartItem[]) || []);
      setPagamentos((payData as CartPayment[]) || []);
      setMercados((mktData as Market[]) || []);
      setSetores((secData as Sector[]) || []);
      setProdutos((prodData as Product[]) || []);
    } catch {
      setErro("Não foi possível carregar o histórico de carrinhos.");
    } finally {
      setCarregando(false);
    }
  }, [configurado, router]);

  useEffect(() => {
    carregarHistorico();
  }, [carregarHistorico]);

  const mapaMercados = useMemo(() => {
    const m = new Map<string, Market>();
    mercados.forEach((x) => m.set(x.id, x));
    return m;
  }, [mercados]);

  const mapaSetores = useMemo(() => {
    const m = new Map<string, Sector>();
    setores.forEach((x) => m.set(x.id, x));
    return m;
  }, [setores]);

  const mapaProdutos = useMemo(() => {
    const m = new Map<string, Product>();
    produtos.forEach((x) => m.set(x.id, x));
    return m;
  }, [produtos]);

  const itensPorCarrinho = useMemo(() => {
    const m = new Map<string, CartItem[]>();
    for (const item of itens) {
      if (item.marcado === false) continue;
      const lista = m.get(item.cart_id) || [];
      lista.push(item);
      m.set(item.cart_id, lista);
    }
    return m;
  }, [itens]);

  const pagamentosPorCarrinho = useMemo(() => {
    const m = new Map<string, CartPayment[]>();
    for (const pg of pagamentos) {
      const lista = m.get(pg.cart_id) || [];
      lista.push(pg);
      m.set(pg.cart_id, lista);
    }
    return m;
  }, [pagamentos]);

  async function handleRepetir(cart: Cart) {
    if (!groupId || copiandoId) return;
    setCopiandoId(cart.id);
    setErro(null);
    try {
      const { novoCartId } = await repetirCarrinhoNoBanco({
        groupId,
        userId,
        cartOrigemId: cart.id,
      });
      router.push(`/compra?id=${novoCartId}`);
    } catch (err) {
      setErro(
        err instanceof Error
          ? err.message
          : "Não foi possível repetir este carrinho."
      );
      setCopiandoId(null);
    }
  }

  async function handleExcluirCarrinho(cartId: string) {
    setExcluindoId(cartId);
    setErro(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("carts").delete().eq("id", cartId);
      if (error) throw error;
      setCarrinhos((antigos) => antigos.filter((c) => c.id !== cartId));
      setConfirmandoExclusaoId(null);
    } catch {
      setErro("Não foi possível excluir o carrinho do histórico.");
    } finally {
      setExcluindoId(null);
    }
  }

  if (!configurado) {
    return <SupabaseSetupGuide />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-main pb-28">
      <main className="flex-1 w-full max-w-md mx-auto px-5 pt-5 flex flex-col gap-4">
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
              Compras finalizadas
            </div>
            <h1 className="text-[24px] font-extrabold leading-tight">
              Histórico de carrinhos
            </h1>
          </div>
        </div>

        {erro && (
          <div className="bg-budget-red-bg text-budget-red-text px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {carregando ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-28 w-full bg-border/70 rounded-card animate-pulse"
              />
            ))}
          </div>
        ) : carrinhos.length === 0 ? (
          <div className="bg-card border border-border rounded-card p-6 text-center flex flex-col items-center gap-3 mt-2">
            <div className="w-12 h-12 rounded-2xl bg-primary-light text-primary flex items-center justify-center">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-extrabold">
                Nenhuma compra finalizada ainda
              </h2>
              <p className="text-xs text-text-muted mt-1 max-w-xs">
                Quando você concluir uma compra no Modo Mercado, ela ficará
                salva aqui com data, mercado, resumo por setor e botão para
                repetir com 1 toque.
              </p>
            </div>
            <Link
              href="/compra"
              className="mt-1 h-11 px-5 rounded-btn bg-primary text-white text-xs font-extrabold flex items-center justify-center"
            >
              Ir para Compra
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {carrinhos.map((cart) => {
              const itensDoCart = itensPorCarrinho.get(cart.id) || [];
              const pagsDoCart = pagamentosPorCarrinho.get(cart.id) || [];
              const mercado = cart.market_id
                ? mapaMercados.get(cart.market_id)
                : null;
              const dataRef =
                cart.finalizado_em || cart.data_planejada || cart.criado_em;

              // Soma total real e agrupa subtotal por setor
              let totalCarrinho = 0;
              const porSetor = new Map<string, number>();

              for (const item of itensDoCart) {
                const unit =
                  item.preco_real !== null && item.preco_real !== undefined
                    ? Number(item.preco_real)
                    : Number(item.preco_estimado || 0);
                const sub = unit * Number(item.quantidade || 0);
                totalCarrinho += sub;

                const prod = mapaProdutos.get(item.product_id);
                const secId = prod?.sector_id || "sem_setor";
                porSetor.set(secId, (porSetor.get(secId) || 0) + sub);
              }

              const setoresResumo = Array.from(porSetor.entries())
                .map(([secId, valor]) => {
                  const sec = mapaSetores.get(secId);
                  return {
                    id: secId,
                    nome: sec ? sec.nome : "Outros",
                    emoji: sec ? sec.emoji : "🛒",
                    valor,
                  };
                })
                .sort((a, b) => b.valor - a.valor);

              const aberto = expandidoId === cart.id;
              const copiando = copiandoId === cart.id;

              return (
                <article
                  key={cart.id}
                  className="bg-card border border-border rounded-[18px] p-4 flex flex-col gap-3 shadow-sm"
                >
                  {/* Linha principal (fiel ao estilo de Últimos carrinhos em 1-inicio.html) */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-extrabold text-text-main truncate">
                        {cart.nome}
                      </div>
                      <div className="text-[12px] text-text-muted mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatarDataCurtaBR(dataRef)}
                        </span>
                        <span>·</span>
                        <span>
                          {itensDoCart.length}{" "}
                          {itensDoCart.length === 1 ? "item" : "itens"}
                        </span>
                        <span>·</span>
                        <span className="font-extrabold text-text-main">
                          {formatarMoeda(totalCarrinho)}
                        </span>
                      </div>
                      {mercado && (
                        <div className="text-[12px] text-text-muted mt-0.5 flex items-center gap-1">
                          <Store className="w-3.5 h-3.5 text-primary" />
                          <span className="font-semibold">{mercado.nome}</span>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={copiando}
                      onClick={() => handleRepetir(cart)}
                      aria-label={`Repetir ${cart.nome}`}
                      className="h-11 px-4 rounded-full bg-primary-light text-primary-hover text-[13px] font-bold flex items-center justify-center gap-1.5 shrink-0 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60"
                    >
                      <RotateCcw
                        className={`w-3.5 h-3.5 ${copiando ? "animate-spin" : ""}`}
                      />
                      <span>{copiando ? "Copiando..." : "Repetir"}</span>
                    </button>
                  </div>

                  {/* Resumo por Setor (Seção 6: data, mercado, setores e total) */}
                  {setoresResumo.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {setoresResumo.map((sr) => (
                        <span
                          key={sr.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-background border border-border text-[11px] font-semibold text-text-main"
                        >
                          <span>{sr.emoji}</span>
                          <span>{sr.nome}:</span>
                          <span className="font-bold">
                            {formatarMoeda(sr.valor)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Formas de pagamento (se informadas no fechamento) */}
                  {pagsDoCart.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-text-muted pt-0.5">
                      <CreditCard className="w-3.5 h-3.5 text-primary shrink-0" />
                      {pagsDoCart.map((pg, idx) => (
                        <span key={pg.id} className="font-semibold">
                          {pg.forma_pagamento} ({formatarMoeda(Number(pg.valor))}
                          ){idx < pagsDoCart.length - 1 ? " · " : ""}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Botão para ver todos os itens do carrinho */}
                  <div className="pt-1 border-t border-border flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandidoId(aberto ? null : cart.id)
                      }
                      className="text-xs font-bold text-primary flex items-center gap-1 py-1 cursor-pointer"
                    >
                      <span>
                        {aberto
                          ? "Ocultar itens da compra"
                          : `Ver todos os ${itensDoCart.length} itens (${formatarDataBR(dataRef)})`}
                      </span>
                      {aberto ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setConfirmandoExclusaoId(
                          confirmandoExclusaoId === cart.id ? null : cart.id
                        )
                      }
                      className="text-xs text-text-muted hover:text-budget-red p-1.5 rounded-lg cursor-pointer"
                      title="Excluir do histórico"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Confirmação de exclusão */}
                  {confirmandoExclusaoId === cart.id && (
                    <div className="bg-budget-red-bg border border-budget-red/30 rounded-xl p-3 flex flex-col gap-2">
                      <p className="text-xs text-budget-red-text font-semibold">
                        Deseja excluir este carrinho do histórico? Os preços já
                        registrados no catálogo de produtos serão mantidos.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmandoExclusaoId(null)}
                          className="flex-1 h-9 rounded-lg bg-card border border-border text-xs font-bold text-text-main cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={excluindoId === cart.id}
                          onClick={() => handleExcluirCarrinho(cart.id)}
                          className="flex-1 h-9 rounded-lg bg-budget-red text-white text-xs font-bold cursor-pointer disabled:opacity-60"
                        >
                          {excluindoId === cart.id
                            ? "Excluindo..."
                            : "Sim, excluir"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Lista expandida de itens */}
                  {aberto && (
                    <div className="bg-background border border-border rounded-xl divide-y divide-border overflow-hidden">
                      {itensDoCart.map((item) => {
                        const prod = mapaProdutos.get(item.product_id);
                        const unit =
                          item.preco_real !== null &&
                          item.preco_real !== undefined
                            ? Number(item.preco_real)
                            : Number(item.preco_estimado || 0);
                        const sub = unit * Number(item.quantidade || 0);
                        return (
                          <div
                            key={item.id}
                            className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-text-main truncate">
                                {prod?.emoji || "📦"}{" "}
                                {prod?.nome || "Produto removido"}
                              </div>
                              <div className="text-[11px] text-text-muted">
                                {Number(item.quantidade)}{" "}
                                {prod?.unidade || "un"} × {formatarMoeda(unit)}
                                {item.marca ? ` · ${item.marca}` : ""}
                              </div>
                            </div>
                            <div className="font-extrabold text-text-main shrink-0">
                              {formatarMoeda(sub)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
