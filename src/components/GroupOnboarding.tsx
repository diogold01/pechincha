"use client";

import React, { useEffect, useState } from "react";
import {
  Users,
  Globe,
  Ticket,
  ArrowRight,
  AlertCircle,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface GroupOnboardingProps {
  userEmail: string;
  userName?: string;
  onGroupReady: () => void;
}

const FUSOS_BRASIL = [
  { value: "America/Cuiaba", label: "America/Cuiaba (MT, MS — UTC-4)" },
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo (Brasília, SP, RJ, Sul, NE — UTC-3)" },
  { value: "America/Manaus", label: "America/Manaus (AM, RO, RR — UTC-4)" },
  { value: "America/Rio_Branco", label: "America/Rio_Branco (AC — UTC-5)" },
  { value: "America/Noronha", label: "America/Noronha (Fernando de Noronha — UTC-2)" },
];

export default function GroupOnboarding({
  userEmail,
  userName,
  onGroupReady,
}: GroupOnboardingProps) {
  const [aba, setAba] = useState<"criar" | "convite">("criar");
  const [nomeGrupo, setNomeGrupo] = useState("Nossa Casa");
  const [fusoHorario, setFusoHorario] = useState("America/Cuiaba");
  const [codigoConvite, setCodigoConvite] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Detecta automaticamente o fuso horário do celular/navegador (padrão America/Cuiaba)
  useEffect(() => {
    try {
      const detectado = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detectado && detectado.trim().length > 0) {
        setFusoHorario(detectado);
      }
    } catch {
      setFusoHorario("America/Cuiaba");
    }
  }, []);

  async function handleCriarGrupo(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!nomeGrupo.trim()) {
      setErro("Digite um nome para o grupo (ex: Nossa Casa).");
      return;
    }

    setCarregando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("create_group_with_defaults", {
        p_nome: nomeGrupo.trim(),
        p_fuso_horario: fusoHorario || "America/Cuiaba",
        p_nome_exibicao: userName || userEmail.split("@")[0],
      });

      if (error) {
        setErro(error.message);
        return;
      }

      onGroupReady();
    } catch {
      setErro("Erro inesperado ao criar o grupo.");
    } finally {
      setCarregando(false);
    }
  }

  async function handleEntrarPorConvite(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!codigoConvite.trim()) {
      setErro("Digite o código de convite.");
      return;
    }

    setCarregando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("accept_group_invite", {
        p_codigo: codigoConvite.trim().toUpperCase(),
        p_nome_exibicao: userName || userEmail.split("@")[0],
      });

      if (error) {
        setErro(error.message);
        return;
      }

      onGroupReady();
    } catch {
      setErro("Erro inesperado ao validar o convite.");
    } finally {
      setCarregando(false);
    }
  }

  async function handleSair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const fusoNaLista = FUSOS_BRASIL.some((f) => f.value === fusoHorario);

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-background">
      <div className="w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary text-white flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-text-muted">
                Conectado como {userEmail}
              </span>
              <h1 className="text-xl font-extrabold text-text-main">
                Configurar seu Grupo
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSair}
            aria-label="Sair da conta"
            className="w-11 h-11 rounded-full bg-card border border-border flex items-center justify-center text-text-muted hover:text-text-main"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-card border border-border rounded-card p-5 sm:p-6 shadow-sm flex flex-col gap-4">
          <div className="grid grid-cols-2 bg-background p-1 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => {
                setAba("criar");
                setErro(null);
              }}
              className={`h-11 rounded-lg font-bold text-sm transition-colors ${
                aba === "criar"
                  ? "bg-card text-primary shadow-sm"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              Criar grupo
            </button>
            <button
              type="button"
              onClick={() => {
                setAba("convite");
                setErro(null);
              }}
              className={`h-11 rounded-lg font-bold text-sm transition-colors ${
                aba === "convite"
                  ? "bg-card text-primary shadow-sm"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              Tenho um convite
            </button>
          </div>

          {erro && (
            <div className="bg-budget-red-bg text-budget-red-text px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {aba === "criar" ? (
            <form onSubmit={handleCriarGrupo} className="flex flex-col gap-4">
              <p className="text-xs text-text-muted leading-relaxed">
                Crie o grupo compartilhado da casa. Os 11 setores padrão do
                mercado já serão criados automaticamente para vocês.
              </p>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-muted">
                  Nome do grupo (casal / família)
                </label>
                <input
                  type="text"
                  value={nomeGrupo}
                  onChange={(e) => setNomeGrupo(e.target.value)}
                  placeholder="Ex: Casa Diogo & Amor"
                  className="w-full h-12 px-4 rounded-xl bg-background border border-border text-sm font-semibold text-text-main focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-muted flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-primary" />
                  <span>Fuso horário (detectado automaticamente)</span>
                </label>
                <select
                  value={fusoHorario}
                  onChange={(e) => setFusoHorario(e.target.value)}
                  className="w-full h-12 px-3.5 rounded-xl bg-background border border-border text-sm text-text-main focus:outline-none focus:border-primary"
                >
                  {!fusoNaLista && (
                    <option value={fusoHorario}>
                      {fusoHorario} (Detectado pelo celular)
                    </option>
                  )}
                  {FUSOS_BRASIL.map((fuso) => (
                    <option key={fuso.value} value={fuso.value}>
                      {fuso.label}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-text-muted">
                  Usado para definir o mês vigente no cálculo do orçamento.
                </span>
              </div>

              <button
                type="submit"
                disabled={carregando}
                className="h-12 rounded-btn bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>
                  {carregando
                    ? "Criando grupo e setores..."
                    : "Criar grupo e começar"}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <form
              onSubmit={handleEntrarPorConvite}
              className="flex flex-col gap-4"
            >
              <p className="text-xs text-text-muted leading-relaxed">
                Digite o código de convite gerado pela outra pessoa para acessar
                exatamente os mesmos produtos, listas e orçamento.
              </p>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-muted">
                  Código do convite
                </label>
                <div className="relative flex items-center">
                  <Ticket className="w-4 h-4 text-text-muted absolute left-3.5" />
                  <input
                    type="text"
                    value={codigoConvite}
                    onChange={(e) =>
                      setCodigoConvite(e.target.value.toUpperCase())
                    }
                    placeholder="Ex: PECH-4K9M"
                    className="w-full h-12 pl-10 pr-4 rounded-xl bg-background border border-border text-sm font-bold tracking-wider uppercase text-text-main focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={carregando}
                className="h-12 rounded-btn bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>
                  {carregando ? "Entrando no grupo..." : "Entrar no grupo"}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
