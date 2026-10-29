import React from "react";
import { ShoppingCart, CheckCircle2, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-background">
      <div className="w-full max-w-md flex flex-col gap-5">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-sm">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-text-muted tracking-wider uppercase">
              Etapa 1 concluída
            </span>
            <h1 className="text-2xl font-extrabold text-text-main leading-tight">
              Pechincha
            </h1>
          </div>
        </div>

        {/* Card de Boas-Vindas */}
        <div className="bg-card border border-border rounded-card p-5 sm:p-6 shadow-sm flex flex-col gap-3">
          <div className="flex items-center gap-2 text-budget-green font-bold text-sm">
            <CheckCircle2 className="w-5 h-5" />
            <span>Ambiente configurado com sucesso</span>
          </div>
          <p className="text-sm text-text-muted leading-relaxed">
            O aplicativo web de controle de compras de mercado está no ar com
            Next.js 15, TypeScript e Tailwind CSS.
          </p>
          <div className="border-t border-border pt-3 mt-1 flex flex-col gap-2 text-xs text-text-muted">
            <div className="flex justify-between items-center">
              <span>Padrão visual:</span>
              <span className="font-semibold text-text-main">
                Plus Jakarta Sans & Tailwind
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Próxima etapa:</span>
              <span className="font-semibold text-primary">
                Banco, login e grupos (Supabase)
              </span>
            </div>
          </div>
        </div>

        {/* Card de Ação */}
        <div className="bg-primary text-white rounded-card p-5 shadow-sm flex flex-col gap-3">
          <div className="text-xs font-semibold text-primary-soft">
            Pronto para continuar
          </div>
          <h2 className="text-lg font-bold leading-snug">
            Estrutura base pronta para deploy na Vercel e conexão com Supabase.
          </h2>
          <div className="mt-2 flex items-center justify-between font-bold text-sm bg-white/10 hover:bg-white/20 transition-colors p-3 rounded-btn cursor-pointer">
            <span>Aguardando comando "continue"</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    </main>
  );
}
