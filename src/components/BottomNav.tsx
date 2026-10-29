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
} from "lucide-react";

const ITENS_MENU = [
  { href: "/", label: "Início", icon: HomeIcon },
  { href: "/compra", label: "Compra", icon: ShoppingCart },
  { href: "/produtos", label: "Produtos", icon: Package },
  { href: "/orcamento", label: "Orçamento", icon: PieChart },
  { href: "/mais", label: "Mais", icon: MoreHorizontal },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed bottom-0 left-0 right-0 h-20 bg-card border-t border-border flex items-center justify-center z-30"
    >
      <div className="w-full max-w-md flex h-full">
        {ITENS_MENU.map((item) => {
          const Icon = item.icon;
          const ativo =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 text-[11px] transition-colors ${
                ativo
                  ? "font-bold text-primary"
                  : "font-semibold text-text-muted hover:text-text-main"
              }`}
            >
              <Icon className="w-6 h-6" strokeWidth={ativo ? 2.3 : 1.9} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
