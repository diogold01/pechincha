"use client";

import React, { useState } from "react";
import { AlertCircle, Calendar, Check, CreditCard, Receipt, Store, Tag, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dataHojeISO, dataInputParaISO, parseDecimalBR } from "@/lib/format";
import { CODIGO_BARRAS_AVULSO } from "@/lib/ia-config";
import type { FormaPagamento, Market, Sector } from "@/lib/types";

const FORMAS_PAGAMENTO: FormaPagamento[] = [
  "Pix",
  "Crédito",
  "Débito",
  "Vale-alimentação",
  "Dinheiro",
  "Outro",
];

interface AvulsoCartModalProps {
  groupId: string;
  userId: string | null;
  mercados: Market[];
  setores: Sector[];
  onClose: () => void;
  onSaved: (cartId: string) => Promise<void> | void;
}

/**
 * Modal rápido para lançar uma compra avulsa por valor (sem precisar cadastrar itens no catálogo)
 */
export default function AvulsoCartModal({
  groupId,
  userId,
  mercados,
  setores,
  onClose,
  onSaved,
}: AvulsoCartModalProps) {
  const [descricao, setDescricao] = useState("");
  const [valorTexto, setValorTexto] = useState("");
  const [dataCompra, setDataCompra] = useState(dataHojeISO());
  const [sectorId, setSectorId] = useState("");
  const [marketId, setMarketId] = useState("");
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | "">("Pix");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    const descLimpa = descricao.trim();
    const valorNum = parseDecimalBR(valorTexto);

    if (!descLimpa) {
      setErro("Informe uma descrição para a compra avulsa.");
      return;
    }
    if (valorNum <= 0) {
      setErro("Informe um valor maior que zero.");
      return;
    }

    setSalvando(true);
    setErro(null);

    try {
      const supabase = createClient();
      const finalizadoIso = dataInputParaISO(dataCompra);

      // 1. Cria o carrinho já finalizado
      const { data: novoCart, error: errCart } = await supabase
        .from("carts")
        .insert({
          group_id: groupId,
          nome: descLimpa,
          market_id: marketId || null,
          status: "finalizado",
          data_planejada: dataCompra || dataHojeISO(),
          finalizado_em: finalizadoIso,
          criado_por: userId,
        })
        .select("id")
        .single();

      if (errCart || !novoCart) {
        throw new Error("Não foi possível criar o registro da compra avulsa.");
      }

      // 2. Tenta salvar item avulso direto (sem product_id); se a migração SQL ainda não rodou, usa fallback seguro
      const { error: errItem } = await supabase.from("cart_items").insert({
        cart_id: novoCart.id,
        group_id: groupId,
        product_id: null,
        descricao_avulsa: descLimpa,
        sector_id_avulso: sectorId || null,
        marca: null,
        quantidade: 1,
        preco_estimado: valorNum,
        preco_real: valorNum,
        marcado: true,
        atacado_aplicado: false,
        ordem: 1,
      });

      if (errItem) {
        const { data: prodFallback, error: errProd } = await supabase
          .from("products")
          .insert({
            group_id: groupId,
            nome: descLimpa,
            sector_id: sectorId || null,
            unidade: "un",
            emoji: "🧾",
            codigo_barras: CODIGO_BARRAS_AVULSO,
            ativo: false,
          })
          .select("id")
          .single();

        if (errProd || !prodFallback) {
          await supabase.from("carts").delete().eq("id", novoCart.id);
          throw new Error("Não foi possível registrar o valor da compra avulsa.");
        }

        const { error: errItemFallback } = await supabase
          .from("cart_items")
          .insert({
            cart_id: novoCart.id,
            group_id: groupId,
            product_id: prodFallback.id,
            marca: null,
            quantidade: 1,
            preco_estimado: valorNum,
            preco_real: valorNum,
            marcado: true,
            atacado_aplicado: false,
            ordem: 1,
          });

        if (errItemFallback) {
          await supabase.from("carts").delete().eq("id", novoCart.id);
          throw new Error("Erro ao salvar o item da compra avulsa.");
        }
      }

      // 3. Registra forma de pagamento (opcional)
      if (formaPagamento) {
        await supabase.from("cart_payments").insert({
          cart_id: novoCart.id,
          group_id: groupId,
          forma_pagamento: formaPagamento,
          valor: valorNum,
        });
      }

      await onSaved(novoCart.id);
      onClose();
    } catch (err: any) {
      setErro(err?.message || "Não foi possível salvar a compra avulsa.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md md:max-w-lg max-h-[92dvh] overflow-y-auto bg-card rounded-t-[24px] md:rounded-2xl p-5 pb-7 shadow-2xl animate-in fade-in duration-200 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold leading-tight">
                Lançar compra avulsa
              </h3>
              <p className="text-xs text-text-muted">
                Registre o valor gasto mesmo sem nota ou lista de produtos
              </p>
            </div>
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

        {erro && (
          <div className="bg-budget-red-bg text-budget-red-text px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        <form onSubmit={handleSalvar} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-text-muted">
              Descrição / Nome da compra
            </label>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: Compra sem comprovante, Marmita, Feira..."
              autoFocus
              required
              className="w-full h-12 px-3.5 rounded-xl bg-background border border-border text-sm font-bold text-text-main focus:outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-text-muted">
                Valor total (R$)
              </label>
              <div className="relative">
                <span className="text-xs font-bold text-text-muted absolute left-3.5 top-3.5">
                  R$
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={valorTexto}
                  onChange={(e) =>
                    setValorTexto(e.target.value.replace(/[^0-9.,]/g, ""))
                  }
                  placeholder="0,00"
                  required
                  className="w-full h-12 pl-9 pr-3 rounded-xl bg-background border border-border text-base font-extrabold text-text-main focus:outline-none focus:border-primary"
                />
              </div>
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
                className="w-full h-12 px-3 rounded-xl bg-background border border-border text-sm font-bold text-text-main focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-text-muted flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-primary" />
              <span>Setor / Categoria (opcional)</span>
            </label>
            <select
              value={sectorId}
              onChange={(e) => setSectorId(e.target.value)}
              className="w-full h-12 px-3.5 rounded-xl bg-background border border-border text-sm font-bold text-text-main focus:outline-none focus:border-primary"
            >
              <option value="">🧾 Sem setor (Compra avulsa)</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.emoji} {s.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-text-muted flex items-center gap-1">
                <Store className="w-3.5 h-3.5 text-primary" />
                <span>Mercado / Local (opcional)</span>
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
                <CreditCard className="w-3.5 h-3.5 text-primary" />
                <span>Pagamento (opcional)</span>
              </label>
              <select
                value={formaPagamento}
                onChange={(e) =>
                  setFormaPagamento((e.target.value as FormaPagamento) || "")
                }
                className="w-full h-11 px-3 rounded-xl bg-background border border-border text-xs font-bold text-text-main focus:outline-none focus:border-primary"
              >
                <option value="">Não informar</option>
                {FORMAS_PAGAMENTO.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={salvando}
            className="mt-1 w-full h-12 rounded-btn bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>
              {salvando ? "Salvando..." : "Salvar compra no histórico"}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}
