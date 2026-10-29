"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Users,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  LogIn,
} from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import SupabaseSetupGuide from "@/components/SupabaseSetupGuide";
import type { RegistrationStatus } from "@/lib/types";

export default function ConvitePage() {
  const params = useParams<{ codigo: string }>();
  const router = useRouter();
  const codigo = (params?.codigo || "").toUpperCase().trim();

  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [logado, setLogado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [aceitando, setAceitando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const configurado = isSupabaseConfigured();

  useEffect(() => {
    if (!configurado || !codigo) {
      setCarregando(false);
      return;
    }

    async function carregarConvite() {
      try {
        const supabase = createClient();
        const [{ data: userData }, { data: rpcData, error: rpcError }] =
          await Promise.all([
            supabase.auth.getUser(),
            supabase.rpc("check_registration_status", {
              p_invite_code: codigo,
            }),
          ]);

        setLogado(Boolean(userData?.user));
        if (!rpcError && rpcData) {
          setStatus(rpcData as RegistrationStatus);
        } else {
          setErro("Não foi possível verificar este código de convite.");
        }
      } catch {
        setErro("Erro ao consultar o convite.");
      } finally {
        setCarregando(false);
      }
    }

    carregarConvite();
  }, [configurado, codigo]);

  if (!configurado) {
    return <SupabaseSetupGuide />;
  }

  async function handleAceitarLogado() {
    setErro(null);
    setAceitando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("accept_group_invite", {
        p_codigo: codigo,
      });

      if (error) {
        setErro(error.message);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setErro("Não foi possível aceitar o convite.");
    } finally {
      setAceitando(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-background">
      <div className="w-full max-w-md bg-card border border-border rounded-card p-6 shadow-sm flex flex-col gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary-light text-primary flex items-center justify-center">
          <Users className="w-6 h-6" />
        </div>

        {carregando ? (
          <div className="flex flex-col gap-3">
            <div className="h-6 w-2/3 bg-border/70 rounded animate-pulse" />
            <div className="h-4 w-full bg-border/60 rounded animate-pulse" />
            <div className="h-12 w-full bg-border/60 rounded-btn animate-pulse mt-2" />
          </div>
        ) : status?.invite_valid ? (
          <>
            <div>
              <span className="text-xs font-bold text-primary uppercase tracking-wider">
                Convite recebido · {codigo}
              </span>
              <h1 className="text-xl font-extrabold text-text-main mt-1">
                Entrar em &ldquo;{status.group_name}&rdquo;
              </h1>
              <p className="text-sm text-text-muted mt-1 leading-relaxed">
                Você foi convidado(a) para compartilhar listas de compras,
                histórico de preços e o orçamento do mercado em tempo real.
              </p>
            </div>

            {erro && (
              <div className="bg-budget-red-bg text-budget-red-text px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            {logado ? (
              <button
                type="button"
                onClick={handleAceitarLogado}
                disabled={aceitando}
                className="h-12 rounded-btn bg-primary hover:bg-primary-hover text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {aceitando
                    ? "Entrando no grupo..."
                    : "Aceitar convite e entrar"}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  router.push(`/login?convite=${encodeURIComponent(codigo)}`)
                }
                className="h-12 rounded-btn bg-primary hover:bg-primary-hover text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Criar minha conta e entrar</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </>
        ) : (
          <>
            <div>
              <h1 className="text-lg font-extrabold text-text-main">
                Convite inválido ou já utilizado
              </h1>
              <p className="text-sm text-text-muted mt-1">
                O código <strong>{codigo}</strong> não está mais disponível.
                Peça um novo convite para quem criou o grupo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="h-12 rounded-btn border-2 border-primary text-primary font-bold text-sm flex items-center justify-center"
            >
              Ir para o Login
            </button>
          </>
        )}
      </div>
    </main>
  );
}
