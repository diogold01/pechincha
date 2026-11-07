"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X, ArrowRight, User, Mail, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface GuestConversionBannerProps {
  onConverted?: () => void;
}

export default function GuestConversionBanner({ onConverted }: GuestConversionBannerProps) {
  const router = useRouter();
  const [isGuest, setIsGuest] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);

  // Campos do formulário
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    async function checkUser() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (
          user &&
          (user.email === "visitante@pechincha.app" ||
           user.user_metadata?.nome === "Visitante")
        ) {
          setIsGuest(true);
        } else {
          setIsGuest(false);
        }
      } catch {
        setIsGuest(false);
      }
    }
    checkUser();
  }, []);

  if (!isGuest) return null;

  async function handleConverterConta(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    const emailLimpo = email.trim().toLowerCase();
    const nomeLimpo = nome.trim();

    if (!emailLimpo || !senha || !nomeLimpo) {
      setErro("Preencha seu nome, e-mail e senha.");
      return;
    }

    if (senha.length < 6) {
      setErro("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setSalvando(true);
    try {
      const supabase = createClient();

      // 1. Atualiza as credenciais do usuário atual no Supabase Auth
      const { error: updateErr } = await supabase.auth.updateUser({
        email: emailLimpo,
        password: senha,
        data: {
          nome: nomeLimpo,
        },
      });

      if (updateErr) {
        if (updateErr.message.toLowerCase().includes("already registered")) {
          setErro("Este e-mail já possui cadastro. Use outro e-mail ou entre com sua conta.");
        } else {
          setErro(updateErr.message);
        }
        return;
      }

      // 2. Renomeia o grupo demo para Nossa Casa e atualiza o membro para admin
      await supabase.rpc("convert_guest_account", {
        p_new_name: nomeLimpo,
      });

      setSucesso("Conta criada com sucesso! Seus dados foram salvos.");
      setTimeout(() => {
        setIsGuest(false);
        setModalAberto(false);
        if (onConverted) {
          onConverted();
        } else {
          router.refresh();
          window.location.reload();
        }
      }, 1200);
    } catch {
      setErro("Ocorreu um erro ao converter a conta.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      {/* Banner Superior Responsivo */}
      <div className="w-full bg-gradient-to-r from-primary to-primary-hover text-white px-4 py-2.5 sm:px-6 shadow-sm flex items-center justify-between gap-3 text-xs sm:text-sm select-none animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <p className="truncate font-medium">
            <span className="font-bold">Modo Visitante:</span>{" "}
            <span className="hidden sm:inline">
              Gostou do Pechincha? Crie sua conta definitiva para salvar suas compras.
            </span>
            <span className="sm:hidden">
              Salve suas compras e convide sua família.
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setErro(null);
            setSucesso(null);
            setModalAberto(true);
          }}
          className="shrink-0 h-8 px-3 rounded-lg bg-white text-primary hover:bg-white/95 font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
        >
          <span>Criar conta</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Modal / Gaveta Responsiva de Criação de Conta */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-card border border-border w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col gap-4 animate-in slide-in-from-bottom-5 sm:zoom-in-95 max-h-[92dvh] overflow-y-auto">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary-light text-primary flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-text-main">
                    Criar conta definitiva
                  </h2>
                  <p className="text-xs text-text-muted">
                    Seus dados de teste serão salvos na sua conta
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-text-main cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mensagens de Feedback */}
            {erro && (
              <div className="bg-budget-red-bg text-budget-red-text px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            {sucesso && (
              <div className="bg-budget-green-bg text-budget-green-text px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{sucesso}</span>
              </div>
            )}

            {/* Formulário */}
            <form onSubmit={handleConverterConta} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-muted">Seu nome</label>
                <div className="relative flex items-center">
                  <User className="w-4 h-4 text-text-muted absolute left-3.5" />
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: Carlos, Maria..."
                    className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-background border border-border text-sm text-text-main focus:outline-none focus:border-primary"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-muted">Seu e-mail</label>
                <div className="relative flex items-center">
                  <Mail className="w-4 h-4 text-text-muted absolute left-3.5" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seuemail@exemplo.com"
                    autoComplete="email"
                    className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-background border border-border text-sm text-text-main focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-muted">Escolha uma senha</label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-text-muted absolute left-3.5" />
                  <input
                    type="password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    autoComplete="new-password"
                    className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-background border border-border text-sm text-text-main focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
                  className="h-11 rounded-xl bg-background border border-border text-xs font-bold text-text-muted hover:text-text-main cursor-pointer"
                >
                  Continuar testando
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="h-11 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-hover disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <span>{salvando ? "Salvando..." : "Salvar conta"}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
