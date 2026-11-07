"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home as HomeIcon,
  ShoppingCart,
  Package,
  PieChart,
  MoreHorizontal,
  History,
  Download,
  Store,
  Sparkles,
} from "lucide-react";

export const ITENS_MENU_PRINCIPAL = [
  { href: "/", label: "Início", icon: HomeIcon, desc: "Resumo do mês e carrinhos" },
  { href: "/compra", label: "Compra", icon: ShoppingCart, desc: "Planejar ou ir ao mercado" },
  { href: "/produtos", label: "Produtos", icon: Package, desc: "Catálogo e histórico de preços" },
  { href: "/orcamento", label: "Orçamento", icon: PieChart, desc: "Limites e gastos por setor" },
  { href: "/mais", label: "Mais", icon: MoreHorizontal, desc: "Mercados e configurações" },
];

export const ITENS_MENU_SECUNDARIO = [
  { href: "/historico", label: "Histórico de compras", icon: History },
  { href: "/exportar", label: "Exportar dados (CSV)", icon: Download },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Navegação lateral desktop"
      className="hidden md:flex fixed top-0 bottom-0 left-0 w-64 bg-card border-r border-border flex-col justify-between z-30 select-none shadow-sm"
    >
      {/* Topo: Logotipo do Pechincha */}
      <div className="p-5 flex flex-col gap-6">
        <Link
          href="/"
          className="flex items-center gap-3 group focus:outline-none"
        >
          <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-white shadow-md shadow-primary/20 group-hover:bg-primary-hover transition-colors">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-extrabold tracking-tight text-text-main flex items-center gap-1.5">
              <span>Pechincha</span>
              <span className="w-2 h-2 rounded-full bg-budget-green" />
            </span>
            <span className="text-[11px] font-semibold text-text-muted -mt-0.5">
              Controle de Compras
            </span>
          </div>
        </Link>

        {/* Menu Principal */}
        <nav className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider px-3 mb-1">
            Menu
          </span>
          {ITENS_MENU_PRINCIPAL.map((item) => {
            const Icon = item.icon;
            const ativo =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all ${
                  ativo
                    ? "bg-primary text-white font-bold shadow-sm shadow-primary/25"
                    : "text-text-muted hover:text-text-main hover:bg-background font-semibold"
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" strokeWidth={ativo ? 2.4 : 2} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Atalhos Rápidos */}
        <nav className="flex flex-col gap-1 pt-2 border-t border-border/70">
          <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider px-3 mb-1">
            Atalhos
          </span>
          {ITENS_MENU_SECUNDARIO.map((item) => {
            const Icon = item.icon;
            const ativo = pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs transition-colors ${
                  ativo
                    ? "bg-primary-light text-primary-hover font-bold"
                    : "text-text-muted hover:text-text-main hover:bg-background font-medium"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={2} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Rodapé da Sidebar: Status de Economia e Versão */}
      <div className="p-4 m-3 rounded-2xl bg-background border border-border/80 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-text-main">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>Controle inteligente</span>
        </div>
        <p className="text-[11px] text-text-muted leading-relaxed">
          Preços calculados por histórico, marcas e atacado em tempo real.
        </p>
      </div>
    </aside>
  );
}
