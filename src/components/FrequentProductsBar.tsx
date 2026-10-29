"use client";

import React, { useMemo } from "react";
import { Sparkles, Plus, Check } from "lucide-react";
import type { Price, Product, Sector } from "@/lib/types";

interface FrequentProductsBarProps {
  produtos: Product[];
  setores: Sector[];
  precos: Price[];
  contagemFrequenciaCarrinhos: Map<string, number>;
  idsNoCarrinhoAtual: Set<string>;
  onAddProduct: (produto: Product) => void;
}

/**
 * Componente "Costumo comprar" (Seção 6 do PROMPT.md):
 * Exibe no topo do planejamento os produtos mais frequentes dos últimos 3 meses
 * para adicionar ao carrinho com um único toque.
 *
 * NOTA: Este componente foi construído de forma 100% isolada para ser fácil de remover
 * caso você decida não utilizá-lo depois (basta mudar EXIBIR_COSTUMO_COMPRAR = false em src/app/compra/page.tsx).
 */
export default function FrequentProductsBar({
  produtos,
  setores,
  precos,
  contagemFrequenciaCarrinhos,
  idsNoCarrinhoAtual,
  onAddProduct,
}: FrequentProductsBarProps) {
  const mapaSetores = useMemo(() => {
    const map = new Map<string, Sector>();
    setores.forEach((s) => map.set(s.id, s));
    return map;
  }, [setores]);

  const produtosFrequentes = useMemo(() => {
    if (produtos.length === 0) return [];

    // Data limite de 3 meses atrás
    const limite = new Date();
    limite.setMonth(limite.getMonth() - 3);
    const limiteISO = limite.toISOString().split("T")[0];

    // Conta frequência nos preços registrados nos últimos 3 meses + carrinhos dos últimos 3 meses
    const pontos = new Map<string, number>();

    contagemFrequenciaCarrinhos.forEach((qtd, prodId) => {
      pontos.set(prodId, (pontos.get(prodId) || 0) + qtd * 2);
    });

    precos.forEach((pr) => {
      if (pr.data >= limiteISO) {
        pontos.set(pr.product_id, (pontos.get(pr.product_id) || 0) + 1);
      }
    });

    return [...produtos]
      .sort((a, b) => {
        const pA = pontos.get(a.id) || 0;
        const pB = pontos.get(b.id) || 0;
        if (pB !== pA) return pB - pA;
        return a.nome.localeCompare(b.nome);
      })
      .slice(0, 10);
  }, [produtos, precos, contagemFrequenciaCarrinhos]);

  if (produtosFrequentes.length === 0) {
    return null;
  }

  return (
    <section className="bg-card border border-border rounded-card p-3.5 flex flex-col gap-2.5 shadow-sm">
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5 text-xs font-extrabold text-text-main">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>Costumo comprar</span>
        </div>
        <span className="text-[11px] text-text-muted font-medium">
          Toque para adicionar
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {produtosFrequentes.map((prod) => {
          const jaEstaNoCarrinho = idsNoCarrinhoAtual.has(prod.id);
          const setor = prod.sector_id ? mapaSetores.get(prod.sector_id) : null;
          const emoji = prod.emoji || setor?.emoji || "📦";

          return (
            <button
              key={prod.id}
              type="button"
              onClick={() => onAddProduct(prod)}
              className={`h-10 px-3 rounded-full text-xs font-bold shrink-0 border flex items-center gap-1.5 transition-all cursor-pointer ${
                jaEstaNoCarrinho
                  ? "bg-primary-light border-primary text-primary-hover"
                  : "bg-background border-border text-text-main hover:border-primary"
              }`}
            >
              <span>{emoji}</span>
              <span>{prod.nome}</span>
              {jaEstaNoCarrinho ? (
                <Check className="w-3.5 h-3.5 text-primary ml-0.5" />
              ) : (
                <Plus className="w-3.5 h-3.5 text-text-muted ml-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
