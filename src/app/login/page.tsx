"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ShoppingCart,
  Lock,
  Mail,
  User,
  Ticket,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import SupabaseSetupGuide from "@/components/SupabaseSetupGuide";
import type { RegistrationStatus } from "@/lib/types";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conviteUrl = searchParams.get("convite")?.toUpperCase().trim() || "";

  const [modo, setModo] = useState<"entrar" | "criar">(
    conviteUrl ? "criar" : "entrar"
  );
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [codigoConvite, setCodigoConvite] = useState(conviteUrl);

  const [regStatus, setRegStatus] = useState<RegistrationStatus | null>(null);
  const [carregandoStatus, setCarregandoStatus] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const configurado = isSupabaseConfigured();

  // Verifica no banco se já existe algum grupo e se o código de convite é válido
  useEffect(() => {
    if (!configurado) {
      setCarregandoStatus(false);
      return;
    }

    let ativo = true;
    async function verificarStatus() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc(
          "check_registration_status",
          {
            p_invite_code: codigoConvite.trim() || null,
          }
        );

        if (!ativo) return;
        if (!error && data) {
          setRegStatus(data as RegistrationStatus);
        }
      } catch {
        // Silencioso caso a tabela ainda não tenha sido criada no Supabase
      } finally {
        if (ativo) setCarregandoStatus(false);
      }
    }

    const timer = setTimeout(verificarStatus, 250);
    return () => {
      ativo = false;
      clearTimeout(timer);
    };
  }, [configurado, codigoConvite]);

  if (!configurado) {
    return <SupabaseSetupGuide />;
  }

  function traduzirErroAuth(msg: string): string {
    const lower = msg.toLowerCase();
    if (lower.includes("invalid login credentials")) {
      return "E-mail ou senha incorretos. Confira os dados digitados.";
    }
    if (lower.includes("email not confirmed")) {
      return "Seu e-mail aguarda confirmação. Dica: desative 'Confirm email' em Authentication → Providers → Email no Supabase.";
    }
    if (lower.includes("user already registered")) {
      return "Este e-mail já possui cadastro. Use a aba 'Entrar'.";
    }
    if (lower.includes("password should be at least")) {
      return "A senha deve ter pelo menos 6 caracteres.";
    }
    if (lower.includes("rate limit")) {
      return "Muitas tentativas seguidas. Aguarde alguns instantes e tente novamente.";
    }
    return msg;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    const emailLimpo = email.trim().toLowerCase();
    if (!emailLimpo || !senha) {
      setErro("Preencha seu e-mail e sua senha.");
      return;
    }

    if (senha.length < 6) {
      setErro("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    const supabase = createClient();
    setEnviando(true);

    try {
      if (modo === "entrar") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: emailLimpo,
          password: senha,
        });

        if (signInError) {
          setErro(traduzirErroAuth(signInError.message));
          return;
        }

        // Se entrou com um código de convite na URL, já vincula ao grupo
        if (codigoConvite.trim()) {
          await supabase.rpc("accept_group_invite", {
            p_codigo: codigoConvite.trim(),
            p_nome_exibicao: nome.trim() || null,
          });
        }

        router.push("/");
        router.refresh();
        return;
      }

      // Modo: Criar conta
      // Verifica se já existe grupo no sistema; se sim, exige convite válido
      const { data: statusAtual, error: rpcError } = await supabase.rpc(
        "check_registration_status",
        {
          p_invite_code: codigoConvite.trim() || null,
        }
      );

      if (rpcError) {
        setErro(
          "Não foi possível verificar o banco de dados. Confira se você já executou o arquivo supabase/schema.sql no SQL Editor do Supabase."
        );
        return;
      }

      const status = statusAtual as RegistrationStatus;
      if (status.needs_invite && !status.invite_valid) {
        setErro(
          "O cadastro é fechado para convidados. Informe um código de convite válido enviado por quem criou o grupo."
        );
        return;
      }

      if (
        status.restricted_email &&
        status.restricted_email.toLowerCase() !== emailLimpo
      ) {
        setErro(
          `Este convite foi gerado especificamente para o e-mail ${status.restricted_email}.`
        );
        return;
      }

      const { data: signUpData, error: signUpError } =
        await supabase.auth.signUp({
          email: emailLimpo,
          password: senha,
          options: {
            data: {
              nome: nome.trim() || emailLimpo.split("@")[0],
            },
          },
        });

      if (signUpError) {
        setErro(traduzirErroAuth(signUpError.message));
        return;
      }

      // Se a sessão foi iniciada imediatamente (Confirm Email desativado no Supabase)
      if (signUpData.session) {
        if (status.needs_invite && codigoConvite.trim()) {
          const { error: acceptError } = await supabase.rpc(
            "accept_group_invite",
            {
              p_codigo: codigoConvite.trim(),
              p_nome_exibicao: nome.trim() || emailLimpo.split("@")[0],
            }
          );

          if (acceptError) {
            setErro(acceptError.message);
            return;
          }
        }

        router.push("/");
        router.refresh();
      } else {
        setSucesso(
          "Conta criada! Se o seu Supabase pedir confirmação por e-mail, clique no link enviado para sua caixa de entrada (ou desative 'Confirm email' em Authentication → Providers → Email no Supabase)."
        );
        setModo("entrar");
      }
    } catch {
      setErro("Ocorreu um erro inesperado ao comunicar com o servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-background">
      <div className="w-full max-w-md flex flex-col gap-5">
        {/* Marca */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-sm">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-text-muted">
              Controle de compras do casal
            </span>
            <h1 className="text-2xl font-extrabold text-text-main leading-tight">
              Pechincha
            </h1>
          </div>
        </div>

        {/* Cartão Principal */}
        <div className="bg-card border border-border rounded-card p-5 sm:p-6 shadow-sm flex flex-col gap-4">
          {/* Seletor de Abas */}
          <div className="grid grid-cols-2 bg-background p-1 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => {
                setModo("entrar");
                setErro(null);
              }}
              className={`h-11 rounded-lg font-bold text-sm transition-colors ${
                modo === "entrar"
                  ? "bg-card text-primary shadow-sm"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setModo("criar");
                setErro(null);
              }}
              className={`h-11 rounded-lg font-bold text-sm transition-colors ${
                modo === "criar"
                  ? "bg-card text-primary shadow-sm"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              Criar conta
            </button>
          </div>

          {/* Avisos de status do convite no modo Criar Conta */}
          {modo === "criar" && !carregandoStatus && regStatus && (
            <div>
              {!regStatus.needs_invite ? (
                <div className="bg-primary-light text-primary-hover px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Primeiro acesso liberado! Após criar sua conta, você dará um
                    nome ao grupo da casa.
                  </span>
                </div>
              ) : regStatus.invite_valid ? (
                <div className="bg-budget-green-bg text-budget-green-text px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Convite válido para entrar no grupo &ldquo;
                    {regStatus.group_name}&rdquo;!
                  </span>
                </div>
              ) : (
                <div className="bg-background border border-border text-text-muted px-3.5 py-2.5 rounded-xl text-xs font-medium">
                  Cadastro exclusivo por convite. Digite abaixo o código gerado
                  por quem criou o grupo.
                </div>
              )}
            </div>
          )}

          {/* Mensagens de erro ou sucesso */}
          {erro && (
            <div className="bg-budget-red-bg text-budget-red-text px-3.5 py-3 rounded-xl text-xs font-semibold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          )}

          {sucesso && (
            <div className="bg-budget-green-bg text-budget-green-text px-3.5 py-3 rounded-xl text-xs font-semibold flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{sucesso}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {modo === "criar" && regStatus?.needs_invite && (
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
            )}

            {modo === "criar" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-muted">
                  Seu nome
                </label>
                <div className="relative flex items-center">
                  <User className="w-4 h-4 text-text-muted absolute left-3.5" />
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Como prefere ser chamado(a)"
                    className="w-full h-12 pl-10 pr-4 rounded-xl bg-background border border-border text-sm text-text-main focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-muted">
                E-mail
              </label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 text-text-muted absolute left-3.5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  autoComplete="email"
                  className="w-full h-12 pl-10 pr-4 rounded-xl bg-background border border-border text-sm text-text-main focus:outline-none focus:border-primary"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-muted">Senha</label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-text-muted absolute left-3.5" />
                <input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                  autoComplete={
                    modo === "entrar" ? "current-password" : "new-password"
                  }
                  className="w-full h-12 pl-10 pr-4 rounded-xl bg-background border border-border text-sm text-text-main focus:outline-none focus:border-primary"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="mt-2 h-12 rounded-btn bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>
                {enviando
                  ? "Aguarde..."
                  : modo === "entrar"
                  ? "Entrar no Pechincha"
                  : "Criar minha conta"}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex-1 flex items-center justify-center p-6 bg-background">
          <div className="w-full max-w-md h-80 rounded-card bg-border/60 animate-pulse" />
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
