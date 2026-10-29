"use client";

import React from "react";
import { Database, KeyRound, FileCode2, ShieldCheck } from "lucide-react";

export default function SupabaseSetupGuide() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-background">
      <div className="w-full max-w-md flex flex-col gap-4">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-sm">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-primary tracking-wider uppercase">
              Etapa 2 · Configuração do Banco
            </span>
            <h1 className="text-2xl font-extrabold text-text-main leading-tight">
              Conectar ao Supabase
            </h1>
          </div>
        </div>

        {/* Passo 1 */}
        <div className="bg-card border border-border rounded-card p-5 shadow-sm flex flex-col gap-3">
          <div className="flex items-center gap-2 font-bold text-text-main text-base">
            <KeyRound className="w-5 h-5 text-primary" />
            <span>1. Colar as chaves no arquivo .env.local</span>
          </div>
          <p className="text-sm text-text-muted leading-relaxed">
            Abra o arquivo{" "}
            <code className="bg-background px-1.5 py-0.5 rounded font-mono text-xs text-text-main">
              .env.local
            </code>{" "}
            na pasta do projeto e preencha os dois campos abaixo com os dados do
            seu painel no Supabase (<strong>Project Settings → API</strong>):
          </p>
          <div className="bg-background border border-border rounded-xl p-3 font-mono text-xs text-text-main overflow-x-auto">
            <div>NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co</div>
            <div className="mt-1">NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...</div>
          </div>
        </div>

        {/* Passo 2 */}
        <div className="bg-card border border-border rounded-card p-5 shadow-sm flex flex-col gap-3">
          <div className="flex items-center gap-2 font-bold text-text-main text-base">
            <FileCode2 className="w-5 h-5 text-primary" />
            <span>2. Rodar o script das tabelas e RLS</span>
          </div>
          <p className="text-sm text-text-muted leading-relaxed">
            No painel do Supabase, clique em <strong>SQL Editor</strong> no menu
            lateral, cole todo o conteúdo do arquivo{" "}
            <code className="bg-background px-1.5 py-0.5 rounded font-mono text-xs text-text-main">
              supabase/schema.sql
            </code>{" "}
            e clique em <strong>Run</strong>.
          </p>
        </div>

        {/* Aviso de segurança */}
        <div className="bg-primary-light border border-primary/20 rounded-card p-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-primary-hover font-medium leading-relaxed">
            Assim que você salvar o arquivo <strong>.env.local</strong>,
            recarregue esta página (F5) e a tela de Login e Criação de Grupo
            aparecerá automaticamente!
          </p>
        </div>
      </div>
    </main>
  );
}
