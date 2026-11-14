"use client";

import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  Check,
  CreditCard,
  Plus,
  Search,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  dataHojeISO,
  dataInputParaISO,
  extrairDataInput,
  formatarMoeda,
  parseDecimalBR,
} from "@/lib/format";
import {
  CODIGO_BARRAS_AVULSO,
  ehProdutoInternoSistema,
} from "@/lib/ia-config";
import type {
  Cart,
  CartItem,
  CartPayment,
  FormaPagamento,
  Market,
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

interface ItemEdicaoRow {
  localKey: string;
  existingId: string | null;
  productId: string | null;
  produtoFallbackSistema: boolean;
  descricao: string;
  unidade: string;
  sectorId: string;
  qtdTexto: string;
  precoTexto: string;
  marca: string;
  atacado: boolean;
}

interface PagamentoRow {
  localKey: string;
  forma_pagamento: FormaPagamento;
  valorTexto: string;
}

interface EditFinalizedCartModalProps {
  cart: Cart;
  itens: CartItem[];
  pagamentos: CartPayment[];
  mercados: Market[];
  setores: Sector[];
  produtos: Product[];
  groupId: string;
  userId: string | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

/**
 * Modal completo para editar compras já finalizadas no Histórico
 * (nome, mercado, data, setor dos produtos, preços, quantidades, itens e pagamentos).
 */
export default function EditFinalizedCartModal({
  cart,
  itens,
  pagamentos,
  mercados,
  setores,
  produtos,
  groupId,
  userId,
  onClose,
  onSaved,
}: EditFinalizedCartModalProps) {
  const mapaProdutos = useMemo(() => {
    const m = new Map<string, Product>();
    produtos.forEach((p) => m.set(p.id, p));
    return m;
  }, [produtos]);

  const mapaSetores = useMemo(() => {
    const m = new Map<string, Sector>();
    setores.forEach((s) => m.set(s.id, s));
    return m;
  }, [setores]);

  const [nomeCart, setNomeCart] = useState(cart.nome);
  const [marketId, setMarketId] = useState(cart.market_id || "");
  const [dataCompra, setDataCompra] = useState(
    extrairDataInput(cart.finalizado_em || cart.data_planejada || cart.criado_em)
  );

  const [rows, setRows] = useState<ItemEdicaoRow[]>(() =>
    itens.map((item) => {
      const prod = item.product_id ? mapaProdutos.get(item.product_id) : undefined;
      const ehFallbackAvulso = prod?.codigo_barras === CODIGO_BARRAS_AVULSO;
      const unit =
        item.preco_real !== null && item.preco_real !== undefined
          ? Number(item.preco_real)
          : Number(item.preco_estimado || 0);
      return {
        localKey: item.id,
        existingId: item.id,
        productId: item.product_id,
        produtoFallbackSistema: ehFallbackAvulso,
        descricao: item.descricao_avulsa || prod?.nome || "Produto",
        unidade: prod?.unidade || "un",
        sectorId: item.sector_id_avulso || prod?.sector_id || "",
        qtdTexto: String(Number(item.quantidade || 1)).replace(".", ","),
        precoTexto: unit > 0 ? unit.toFixed(2).replace(".", ",") : "0,00",
        marca: item.marca || "",
        atacado: Boolean(item.atacado_aplicado),
      };
    })
  );

  const [pags, setPags] = useState<PagamentoRow[]>(() =>
    pagamentos.map((pg) => ({
      localKey: pg.id,
      forma_pagamento: pg.forma_pagamento,
      valorTexto: Number(pg.valor).toFixed(2).replace(".", ","),
    }))
  );

  // Painel de adicionar novo item ao carrinho finalizado
  const [mostrandoAdicionar, setMostrandoAdicionar] = useState<
    null | "catalogo" | "avulso"
  >(null);
  const [buscaCatalogo, setBuscaCatalogo] = useState("");
  const [novoAvulsoDesc, setNovoAvulsoDesc] = useState("");
  const [novoAvulsoSetorId, setNovoAvulsoSetorId] = useState("");
  const [novoAvulsoQtd, setNovoAvulsoQtd] = useState("1");
  const [novoAvulsoPreco, setNovoAvulsoPreco] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const totalEditado = useMemo(() => {
    return rows.reduce((acc, r) => {
      const q = parseDecimalBR(r.qtdTexto);
      const p = parseDecimalBR(r.precoTexto);
      return acc + Math.max(0, q) * Math.max(0, p);
    }, 0);
  }, [rows]);

  const somaPagamentos = useMemo(() => {
    return pags.reduce((acc, p) => acc + Math.max(0, parseDecimalBR(p.valorTexto)), 0);
  }, [pags]);

  const produtosCatalogoFiltrados = useMemo(() => {
    const termo = buscaCatalogo.trim().toLowerCase();
    return produtos
      .filter((p) => p.ativo && !ehProdutoInternoSistema(p.codigo_barras))
      .filter((p) => !termo || p.nome.toLowerCase().includes(termo))
      .slice(0, 20);
  }, [produtos, buscaCatalogo]);

  function atualizarRow(localKey: string, parcial: Partial<ItemEdicaoRow>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.localKey === localKey) {
          return { ...r, ...parcial };
        }
        // Mantém o mesmo setor sincronizado se houver outra linha do mesmo produto de catálogo
        if (
          parcial.sectorId !== undefined &&
          r.productId &&
          !r.produtoFallbackSistema
        ) {
          const alvo = prev.find((x) => x.localKey === localKey);
          if (alvo?.productId && r.productId === alvo.productId) {
            return { ...r, sectorId: parcial.sectorId };
          }
        }
        return r;
      })
    );
  }

  function adicionarItemCatalogo(prod: Product) {
    setRows((prev) => [
      ...prev,
      {
        localKey: `new-cat-${Date.now()}-${Math.random()}`,
        existingId: null,
        productId: prod.id,
        produtoFallbackSistema: false,
        descricao: prod.nome,
        unidade: prod.unidade || "un",
        sectorId: prod.sector_id || "",
        qtdTexto: "1",
        precoTexto: "0,00",
        marca: "",
        atacado: false,
      },
    ]);
    setMostrandoAdicionar(null);
    setBuscaCatalogo("");
  }

  function adicionarItemAvulsoLista() {
    const desc = novoAvulsoDesc.trim();
    if (!desc) {
      setErro("Informe a descrição do item avulso.");
      return;
    }
    const q = parseDecimalBR(novoAvulsoQtd) || 1;
    const p = parseDecimalBR(novoAvulsoPreco);
    setRows((prev) => [
      ...prev,
      {
        localKey: `new-avu-${Date.now()}-${Math.random()}`,
        existingId: null,
        productId: null,
        produtoFallbackSistema: false,
        descricao: desc,
        unidade: "un",
        sectorId: novoAvulsoSetorId,
        qtdTexto: String(q).replace(".", ","),
        precoTexto: p > 0 ? p.toFixed(2).replace(".", ",") : "0,00",
        marca: "",
        atacado: false,
      },
    ]);
    setMostrandoAdicionar(null);
    setNovoAvulsoDesc("");
    setNovoAvulsoSetorId("");
    setNovoAvulsoQtd("1");
    setNovoAvulsoPreco("");
    setErro(null);
  }

  function ajustarPagamentoParaTotal() {
    const textoTotal = totalEditado.toFixed(2).replace(".", ",");
    if (pags.length === 0) {
      setPags([
        {
          localKey: `pag-${Date.now()}`,
          forma_pagamento: "Pix",
          valorTexto: textoTotal,
        },
      ]);
      return;
    }
    if (pags.length === 1) {
      setPags((prev) => [{ ...prev[0], valorTexto: textoTotal }]);
      return;
    }
    const somaAnteriores = pags
      .slice(0, -1)
      .reduce((acc, p) => acc + Math.max(0, parseDecimalBR(p.valorTexto)), 0);
    const restante = Math.max(0, totalEditado - somaAnteriores);
    setPags((prev) =>
      prev.map((pg, idx) =>
        idx === prev.length - 1
          ? { ...pg, valorTexto: restante.toFixed(2).replace(".", ",") }
          : pg
      )
    );
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    const nomeLimpo = nomeCart.trim();
    if (!nomeLimpo) {
      setErro("Informe o nome da compra.");
      return;
    }
    if (rows.length === 0) {
      setErro("A compra precisa ter pelo menos 1 item.");
      return;
    }

    for (const r of rows) {
      if (!r.productId && !r.descricao.trim()) {
        setErro("Todos os itens avulsos precisam de descrição.");
        return;
      }
      if (parseDecimalBR(r.qtdTexto) <= 0) {
        setErro(`A quantidade de "${r.descricao}" precisa ser maior que zero.`);
        return;
      }
      if (parseDecimalBR(r.precoTexto) < 0) {
        setErro(`O preço de "${r.descricao}" não pode ser negativo.`);
        return;
      }
    }

    setSalvando(true);
    setErro(null);

    try {
      const supabase = createClient();
      const dataStr = dataCompra || dataHojeISO();
      const finalizadoIso = dataInputParaISO(dataStr);

      // 1. Atualiza cabeçalho do carrinho
      const { error: errCart } = await supabase
        .from("carts")
        .update({
          nome: nomeLimpo,
          market_id: marketId || null,
          data_planejada: dataStr,
          finalizado_em: finalizadoIso,
        })
        .eq("id", cart.id)
        .eq("group_id", groupId);

      if (errCart) throw errCart;

      // 2. Atualiza setores dos produtos do catálogo que foram alterados (regra confirmada: atualiza o produto no catálogo)
      const setoresCatalogoParaAtualizar = new Map<string, string | null>();
      for (const r of rows) {
        if (r.productId && !r.produtoFallbackSistema) {
          const prodOrig = mapaProdutos.get(r.productId);
          const novoSec = r.sectorId || null;
          if (prodOrig && (prodOrig.sector_id || null) !== novoSec) {
            setoresCatalogoParaAtualizar.set(r.productId, novoSec);
          }
        }
      }

      for (const [prodId, novoSec] of setoresCatalogoParaAtualizar.entries()) {
        const { error: errProd } = await supabase
          .from("products")
          .update({ sector_id: novoSec })
          .eq("id", prodId)
          .eq("group_id", groupId);
        if (errProd) throw errProd;
      }

      // 3. Remove itens que foram excluídos pelo usuário no modal
      const idsMantidos = new Set(
        rows.map((r) => r.existingId).filter((id): id is string => Boolean(id))
      );
      const idsRemovidos = itens
        .map((i) => i.id)
        .filter((id) => !idsMantidos.has(id));

      for (const remId of idsRemovidos) {
        await supabase.from("prices").delete().eq("cart_item_id", remId);
        await supabase.from("cart_items").delete().eq("id", remId);
      }

      // 4. Atualiza ou insere itens e sincroniza preços vinculados (cart_item_id)
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const qtd = parseDecimalBR(r.qtdTexto);
        const preco = parseDecimalBR(r.precoTexto);
        const marcaLimpa = r.marca.trim() || null;

        if (r.existingId) {
          const payloadUpdate: Record<string, unknown> = {
            quantidade: qtd,
            marca: marcaLimpa,
            preco_real: preco,
            preco_estimado: preco,
            atacado_aplicado: r.atacado,
            marcado: true,
            ordem: i + 1,
          };

          if (!r.productId) {
            payloadUpdate.descricao_avulsa = r.descricao.trim();
            payloadUpdate.sector_id_avulso = r.sectorId || null;
          } else if (r.produtoFallbackSistema) {
            await supabase
              .from("products")
              .update({
                nome: r.descricao.trim(),
                sector_id: r.sectorId || null,
              })
              .eq("id", r.productId)
              .eq("group_id", groupId);
          }

          const { error: errUpdItem } = await supabase
            .from("cart_items")
            .update(payloadUpdate)
            .eq("id", r.existingId);
          if (errUpdItem) throw errUpdItem;

          // Sincroniza registro em prices quando o produto pertence ao catálogo
          if (r.productId && !r.produtoFallbackSistema) {
            const { data: precoExistente } = await supabase
              .from("prices")
              .select("id")
              .eq("cart_item_id", r.existingId)
              .maybeSingle();

            if (marketId && preco > 0) {
              if (precoExistente?.id) {
                await supabase
                  .from("prices")
                  .update({
                    market_id: marketId,
                    marca: marcaLimpa,
                    valor: preco,
                    tipo: r.atacado ? "atacado" : "varejo",
                    data: dataStr,
                  })
                  .eq("id", precoExistente.id);
              } else {
                await supabase.from("prices").insert({
                  group_id: groupId,
                  product_id: r.productId,
                  market_id: marketId,
                  marca: marcaLimpa,
                  valor: preco,
                  tipo: r.atacado ? "atacado" : "varejo",
                  quantidade_minima: 1,
                  data: dataStr,
                  criado_por: userId,
                  cart_item_id: r.existingId,
                });
              }
            } else if (precoExistente?.id) {
              await supabase.from("prices").delete().eq("id", precoExistente.id);
            }
          }
        } else if (r.productId) {
          // Novo item do catálogo adicionado ao carrinho finalizado
          const { data: novoItem, error: errInsItem } = await supabase
            .from("cart_items")
            .insert({
              cart_id: cart.id,
              group_id: groupId,
              product_id: r.productId,
              marca: marcaLimpa,
              quantidade: qtd,
              preco_estimado: preco,
              preco_real: preco,
              marcado: true,
              atacado_aplicado: r.atacado,
              ordem: i + 1,
            })
            .select("id")
            .single();

          if (errInsItem) throw errInsItem;

          if (marketId && preco > 0 && novoItem?.id) {
            await supabase.from("prices").insert({
              group_id: groupId,
              product_id: r.productId,
              market_id: marketId,
              marca: marcaLimpa,
              valor: preco,
              tipo: r.atacado ? "atacado" : "varejo",
              quantidade_minima: 1,
              data: dataStr,
              criado_por: userId,
              cart_item_id: novoItem.id,
            });
          }
        } else {
          // Novo item avulso adicionado ao carrinho finalizado (com fallback se a migração SQL estiver pendente)
          const { error: errInsAvulso } = await supabase
            .from("cart_items")
            .insert({
              cart_id: cart.id,
              group_id: groupId,
              product_id: null,
              descricao_avulsa: r.descricao.trim(),
              sector_id_avulso: r.sectorId || null,
              marca: marcaLimpa,
              quantidade: qtd,
              preco_estimado: preco,
              preco_real: preco,
              marcado: true,
              atacado_aplicado: false,
              ordem: i + 1,
            });

          if (errInsAvulso) {
            const { data: prodFallback, error: errProdFb } = await supabase
              .from("products")
              .insert({
                group_id: groupId,
                nome: r.descricao.trim(),
                sector_id: r.sectorId || null,
                unidade: "un",
                emoji: "🧾",
                codigo_barras: CODIGO_BARRAS_AVULSO,
                ativo: false,
              })
              .select("id")
              .single();

            if (errProdFb || !prodFallback) throw errInsAvulso;

            await supabase.from("cart_items").insert({
              cart_id: cart.id,
              group_id: groupId,
              product_id: prodFallback.id,
              marca: marcaLimpa,
              quantidade: qtd,
              preco_estimado: preco,
              preco_real: preco,
              marcado: true,
              atacado_aplicado: false,
              ordem: i + 1,
            });
          }
        }
      }

      // 5. Atualiza formas de pagamento
      await supabase.from("cart_payments").delete().eq("cart_id", cart.id);

      const pagamentosValidos = pags
        .map((pg) => ({
          cart_id: cart.id,
          group_id: groupId,
          forma_pagamento: pg.forma_pagamento,
          valor: parseDecimalBR(pg.valorTexto),
        }))
        .filter((pg) => pg.valor > 0);

      if (pagamentosValidos.length > 0) {
        await supabase.from("cart_payments").insert(pagamentosValidos);
      }

      await onSaved();
      onClose();
    } catch (err: any) {
      setErro(
        err?.message || "Não foi possível salvar as alterações da compra."
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md md:max-w-2xl max-h-[92dvh] bg-card rounded-t-[24px] md:rounded-2xl shadow-2xl animate-in fade-in duration-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho fixo do modal */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold leading-tight truncate">
              Editar compra finalizada
            </h3>
            <p className="text-xs text-text-muted">
              Ajuste setores, valores, data, mercado ou pagamentos
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-text-muted hover:text-text-main cursor-pointer shrink-0"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSalvar}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 flex flex-col gap-5"
        >
          {erro && (
            <div className="bg-budget-red-bg text-budget-red-text px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {/* Dados gerais da compra */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-3 flex flex-col gap-1">
              <label className="text-xs font-bold text-text-muted">
                Nome da compra
              </label>
              <input
                type="text"
                value={nomeCart}
                onChange={(e) => setNomeCart(e.target.value)}
                required
                className="w-full h-11 px-3.5 rounded-xl bg-background border border-border text-sm font-bold text-text-main focus:outline-none focus:border-primary"
              />
            </div>

            <div className="sm:col-span-2 flex flex-col gap-1">
              <label className="text-xs font-bold text-text-muted flex items-center gap-1">
                <Store className="w-3.5 h-3.5 text-primary" />
                <span>Mercado</span>
              </label>
              <select
                value={marketId}
                onChange={(e) => setMarketId(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-background border border-border text-xs font-bold text-text-main focus:outline-none focus:border-primary"
              >
                <option value="">Sem mercado específico</option>
                {mercados.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-text-muted flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span>Data</span>
              </label>
              <input
                type="date"
                value={dataCompra}
                onChange={(e) => setDataCompra(e.target.value)}
                required
                className="w-full h-11 px-3 rounded-xl bg-background border border-border text-xs font-bold text-text-main focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Lista de Itens */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs font-extrabold uppercase tracking-wide text-text-muted">
                Itens ({rows.length}) · Total:{" "}
                <span className="text-text-main">
                  {formatarMoeda(totalEditado)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setMostrandoAdicionar((prev) =>
                      prev === "catalogo" ? null : "catalogo"
                    )
                  }
                  className="h-8 px-2.5 rounded-lg bg-primary-light text-primary-hover text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Produto</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMostrandoAdicionar((prev) =>
                      prev === "avulso" ? null : "avulso"
                    )
                  }
                  className="h-8 px-2.5 rounded-lg bg-background border border-border hover:border-primary text-text-main text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Item avulso</span>
                </button>
              </div>
            </div>

            {/* Painel inline: adicionar produto do catálogo */}
            {mostrandoAdicionar === "catalogo" && (
              <div className="bg-background border border-primary/40 rounded-2xl p-3 flex flex-col gap-2">
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-text-muted absolute left-3" />
                  <input
                    type="text"
                    value={buscaCatalogo}
                    onChange={(e) => setBuscaCatalogo(e.target.value)}
                    placeholder="Buscar produto no catálogo..."
                    autoFocus
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-card border border-border text-xs font-semibold text-text-main focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-border rounded-xl border border-border bg-card">
                  {produtosCatalogoFiltrados.map((p) => {
                    const sec = p.sector_id ? mapaSetores.get(p.sector_id) : null;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => adicionarItemCatalogo(p)}
                        className="w-full px-3 py-2 text-left text-xs hover:bg-primary-light/40 flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="font-bold truncate">
                          {p.emoji || sec?.emoji || "📦"} {p.nome}
                        </span>
                        <span className="text-[11px] text-text-muted shrink-0">
                          {sec ? sec.nome : "Sem setor"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Painel inline: adicionar item avulso */}
            {mostrandoAdicionar === "avulso" && (
              <div className="bg-background border border-primary/40 rounded-2xl p-3 flex flex-col gap-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={novoAvulsoDesc}
                    onChange={(e) => setNovoAvulsoDesc(e.target.value)}
                    placeholder="Descrição do item avulso"
                    className="h-10 px-3 rounded-xl bg-card border border-border text-xs font-bold text-text-main"
                  />
                  <select
                    value={novoAvulsoSetorId}
                    onChange={(e) => setNovoAvulsoSetorId(e.target.value)}
                    className="h-10 px-2.5 rounded-xl bg-card border border-border text-xs font-semibold text-text-main"
                  >
                    <option value="">Sem setor</option>
                    {setores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.emoji} {s.nome}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={novoAvulsoQtd}
                    onChange={(e) =>
                      setNovoAvulsoQtd(e.target.value.replace(/[^0-9.,]/g, ""))
                    }
                    placeholder="Qtd (ex: 1)"
                    className="h-10 px-3 rounded-xl bg-card border border-border text-xs font-bold text-text-main"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={novoAvulsoPreco}
                    onChange={(e) =>
                      setNovoAvulsoPreco(e.target.value.replace(/[^0-9.,]/g, ""))
                    }
                    placeholder="Preço unit. (ex: 15,00)"
                    className="h-10 px-3 rounded-xl bg-card border border-border text-xs font-bold text-text-main"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setMostrandoAdicionar(null)}
                    className="h-9 px-3 rounded-lg bg-card border border-border text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={adicionarItemAvulsoLista}
                    className="h-9 px-3.5 rounded-lg bg-primary text-white text-xs font-bold cursor-pointer"
                  >
                    Adicionar item
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              {rows.map((row) => {
                const prod = row.productId ? mapaProdutos.get(row.productId) : null;
                const sec = row.sectorId ? mapaSetores.get(row.sectorId) : null;
                const emoji =
                  (prod && !row.produtoFallbackSistema ? prod.emoji : null) ||
                  sec?.emoji ||
                  (!row.productId || row.produtoFallbackSistema ? "🧾" : "📦");
                const sub =
                  Math.max(0, parseDecimalBR(row.qtdTexto)) *
                  Math.max(0, parseDecimalBR(row.precoTexto));

                return (
                  <div
                    key={row.localKey}
                    className="bg-background border border-border rounded-2xl p-3 flex flex-col gap-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-base shrink-0">{emoji}</span>
                        {!row.productId || row.produtoFallbackSistema ? (
                          <input
                            type="text"
                            value={row.descricao}
                            onChange={(e) =>
                              atualizarRow(row.localKey, {
                                descricao: e.target.value,
                              })
                            }
                            className="w-full h-9 px-2.5 rounded-lg bg-card border border-border text-xs font-bold text-text-main"
                          />
                        ) : (
                          <span className="text-sm font-extrabold text-text-main truncate">
                            {row.descricao}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-extrabold text-text-main">
                          {formatarMoeda(sub)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setRows((prev) =>
                              prev.filter((x) => x.localKey !== row.localKey)
                            )
                          }
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-budget-red cursor-pointer"
                          title="Remover item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="col-span-2 flex flex-col gap-0.5">
                        <label className="text-[10px] font-bold text-text-muted">
                          Setor{" "}
                          {row.productId && !row.produtoFallbackSistema
                            ? "(atualiza no catálogo)"
                            : "(avulso)"}
                        </label>
                        <select
                          value={row.sectorId}
                          onChange={(e) =>
                            atualizarRow(row.localKey, {
                              sectorId: e.target.value,
                            })
                          }
                          className="h-9 px-2.5 rounded-lg bg-card border border-border text-xs font-bold text-text-main"
                        >
                          <option value="">Sem setor</option>
                          {setores.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.emoji} {s.nome}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] font-bold text-text-muted">
                          Qtd ({row.unidade})
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.qtdTexto}
                          onChange={(e) =>
                            atualizarRow(row.localKey, {
                              qtdTexto: e.target.value.replace(/[^0-9.,]/g, ""),
                            })
                          }
                          className="h-9 px-2.5 rounded-lg bg-card border border-border text-xs font-extrabold text-text-main"
                        />
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] font-bold text-text-muted">
                          Preço unit. (R$)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.precoTexto}
                          onChange={(e) =>
                            atualizarRow(row.localKey, {
                              precoTexto: e.target.value.replace(/[^0-9.,]/g, ""),
                            })
                          }
                          className="h-9 px-2.5 rounded-lg bg-card border border-border text-xs font-extrabold text-text-main"
                        />
                      </div>

                      <div className="col-span-2 sm:col-span-4 flex items-center gap-2">
                        <input
                          type="text"
                          value={row.marca}
                          onChange={(e) =>
                            atualizarRow(row.localKey, {
                              marca: e.target.value,
                            })
                          }
                          placeholder="Marca / observação (opcional)"
                          className="flex-1 h-8 px-2.5 rounded-lg bg-card border border-border text-[11px] font-semibold text-text-main"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Formas de pagamento */}
          <div className="flex flex-col gap-2.5 pt-1 border-t border-border">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-extrabold text-text-main flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-primary" />
                <span>Formas de pagamento</span>
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={ajustarPagamentoParaTotal}
                  className="text-[11px] font-bold text-text-muted hover:text-primary cursor-pointer"
                >
                  Ajustar p/ {formatarMoeda(totalEditado)}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPags((prev) => [
                      ...prev,
                      {
                        localKey: `pag-${Date.now()}-${Math.random()}`,
                        forma_pagamento: "Pix",
                        valorTexto:
                          prev.length === 0
                            ? totalEditado.toFixed(2).replace(".", ",")
                            : "0,00",
                      },
                    ])
                  }
                  className="text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  + Adicionar forma
                </button>
              </div>
            </div>

            {pags.length === 0 ? (
              <p className="text-xs text-text-muted">
                Nenhuma forma de pagamento registrada. Toque em &quot;+ Adicionar forma&quot; se desejar informar.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {pags.map((pg, idx) => (
                  <div key={pg.localKey} className="flex items-center gap-2">
                    <select
                      value={pg.forma_pagamento}
                      onChange={(e) => {
                        const novaForma = e.target.value as FormaPagamento;
                        setPags((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, forma_pagamento: novaForma } : x
                          )
                        );
                      }}
                      className="flex-1 h-10 px-3 rounded-xl bg-background border border-border text-xs font-bold text-text-main"
                    >
                      {FORMAS_PAGAMENTO.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>

                    <div className="relative w-32">
                      <span className="text-xs font-bold text-text-muted absolute left-3 top-2.5">
                        R$
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={pg.valorTexto}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9.,]/g, "");
                          setPags((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, valorTexto: v } : x
                            )
                          );
                        }}
                        className="w-full h-10 pl-8 pr-2.5 rounded-xl bg-background border border-border text-xs font-extrabold text-right text-text-main"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setPags((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="w-9 h-10 rounded-xl flex items-center justify-center text-text-muted hover:text-budget-red cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {Math.abs(somaPagamentos - totalEditado) >= 0.01 && (
                  <div className="text-[11px] font-semibold text-budget-yellow-text bg-budget-yellow-bg px-3 py-2 rounded-xl">
                    Soma dos pagamentos: <strong>{formatarMoeda(somaPagamentos)}</strong>{" "}
                    (diferença de{" "}
                    <strong>
                      {formatarMoeda(Math.abs(somaPagamentos - totalEditado))}
                    </strong>{" "}
                    em relação ao total da compra).
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={salvando}
            className="w-full h-12 rounded-btn bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Check className="w-4 h-4" />
            <span>
              {salvando ? "Salvando alterações..." : "Salvar alterações"}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}
