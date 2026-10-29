"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  UserPlus,
  Copy,
  Check,
  LogOut,
  ShieldCheck,
  Trash2,
  Plus,
  ArrowRight,
} from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import SupabaseSetupGuide from "@/components/SupabaseSetupGuide";
import GroupOnboarding from "@/components/GroupOnboarding";
import BottomNav from "@/components/BottomNav";
import type { Cart, Group, GroupInvite, GroupMember, Sector } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const configurado = isSupabaseConfigured();

  const [carregando, setCarregando] = useState(true);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [grupo, setGrupo] = useState<Group | null>(null);
  const [membros, setMembros] = useState<GroupMember[]>([]);
  const [convites, setConvites] = useState<GroupInvite[]>([]);
  const [setores, setSetores] = useState<Sector[]>([]);
  const [carrinhoAtivo, setCarrinhoAtivo] = useState<Cart | null>(null);
  const [qtdItensAtivo, setQtdItensAtivo] = useState<number>(0);

  const [gerandoConvite, setGerandoConvite] = useState(false);
  const [copiadoTexto, setCopiadoTexto] = useState<string | null>(null);
  const [erroConvite, setErroConvite] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    if (!configurado) {
      setCarregando(false);
      return;
    }

    setCarregando(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      setUserEmail(user.email || "");
      setUserName(
        (user.user_metadata?.nome as string) ||
          user.email?.split("@")[0] ||
          "Usuário"
      );

      // Busca o vínculo de grupo do usuário
      const { data: memberRows } = await supabase
        .from("group_members")
        .select("*")
        .eq("user_id", user.id)
        .limit(1);

      if (!memberRows || memberRows.length === 0) {
        setGrupo(null);
        setCarregando(false);
        return;
      }

      const groupId = memberRows[0].group_id;

      // Carrega dados do grupo, membros, convites pendentes e setores em paralelo
      const [
        { data: groupData },
        { data: allMembers },
        { data: invitesData },
        { data: sectorsData },
        { data: activeCartsData },
      ] = await Promise.all([
        supabase.from("groups").select("*").eq("id", groupId).single(),
        supabase
          .from("group_members")
          .select("*")
          .eq("group_id", groupId)
          .order("criado_em", { ascending: true }),
        supabase
          .from("group_invites")
          .select("*")
          .eq("group_id", groupId)
          .is("usado_em", null)
          .order("criado_em", { ascending: false }),
        supabase
          .from("sectors")
          .select("*")
          .eq("group_id", groupId)
          .order("ordem", { ascending: true }),
        supabase
          .from("carts")
          .select("*")
          .eq("group_id", groupId)
          .in("status", ["planejado", "em_compra"])
          .order("criado_em", { ascending: false })
          .limit(1),
      ]);

      setGrupo((groupData as Group) || null);
      setMembros((allMembers as GroupMember[]) || []);
      setConvites((invitesData as GroupInvite[]) || []);
      setSetores((sectorsData as Sector[]) || []);

      const ativo = (activeCartsData as Cart[])?.[0] || null;
      setCarrinhoAtivo(ativo);
      if (ativo) {
        const { count } = await supabase
          .from("cart_items")
          .select("*", { count: "exact", head: true })
          .eq("cart_id", ativo.id);
        setQtdItensAtivo(count || 0);
      } else {
        setQtdItensAtivo(0);
      }
    } catch {
      // Silencioso em caso de falha de rede
    } finally {
      setCarregando(false);
    }
  }, [configurado, router]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  if (!configurado) {
    return <SupabaseSetupGuide />;
  }

  if (carregando) {
    return (
      <main className="flex-1 flex flex-col items-center p-5 bg-background">
        <div className="w-full max-w-md flex flex-col gap-4">
          <div className="h-12 w-48 bg-border/70 rounded-xl animate-pulse" />
          <div className="h-44 w-full bg-border/70 rounded-card animate-pulse" />
          <div className="h-56 w-full bg-border/70 rounded-card animate-pulse" />
        </div>
      </main>
    );
  }

  if (!grupo) {
    return (
      <GroupOnboarding
        userEmail={userEmail}
        userName={userName}
        onGroupReady={carregarDados}
      />
    );
  }

  async function handleGerarConvite() {
    if (!grupo) return;
    setErroConvite(null);
    setGerandoConvite(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("generate_group_invite", {
        p_group_id: grupo.id,
        p_email: null,
      });

      if (error) {
        setErroConvite(error.message);
        return;
      }

      await carregarDados();
    } catch {
      setErroConvite("Não foi possível gerar o convite.");
    } finally {
      setGerandoConvite(false);
    }
  }

  async function handleExcluirConvite(id: string) {
    const supabase = createClient();
    await supabase.from("group_invites").delete().eq("id", id);
    await carregarDados();
  }

  async function copiarParaAreaDeTransferencia(texto: string, tipo: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoTexto(tipo);
      setTimeout(() => setCopiadoTexto(null), 2500);
    } catch {
      // Fallback simples
    }
  }

  async function handleSair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // Formata o mês atual usando o fuso horário configurado no grupo
  let mesAnoFormatado = "";
  try {
    const formatador = new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: grupo.fuso_horario || "America/Cuiaba",
    });
    const texto = formatador.format(new Date());
    mesAnoFormatado = texto.charAt(0).toUpperCase() + texto.slice(1);
  } catch {
    mesAnoFormatado = "Mês atual";
  }

  const conviteAtivo = convites[0] || null;
  const linkConvite =
    typeof window !== "undefined" && conviteAtivo
      ? `${window.location.origin}/convite/${conviteAtivo.codigo}`
      : "";

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-main pb-24">
      <main className="flex-1 w-full max-w-md mx-auto px-5 pt-5 flex flex-col gap-4">
        {/* Topo conforme referência 1-inicio.html */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[13px] text-text-muted font-medium">
              {mesAnoFormatado} · {grupo.nome}
            </div>
            <h1 className="text-[28px] font-extrabold leading-tight">Início</h1>
          </div>
          <button
            type="button"
            onClick={handleSair}
            title="Sair da conta"
            className="h-11 px-3.5 rounded-full bg-card border border-border flex items-center gap-1.5 text-xs font-bold text-text-muted hover:text-text-main cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair</span>
          </button>
        </div>

        {/* Card Continuar Compra (quando houver uma planejada ou em andamento) */}
        {carrinhoAtivo && (
          <Link
            href={`/compra?id=${carrinhoAtivo.id}`}
            className="block bg-primary text-white rounded-card p-4 sm:p-5 shadow-sm"
          >
            <div className="text-xs font-semibold text-primary-soft">
              {carrinhoAtivo.status === "em_compra"
                ? "Compra em andamento"
                : "Carrinho em planejamento"}
            </div>
            <div className="text-xl font-extrabold mt-1">
              {carrinhoAtivo.nome}
            </div>
            <div className="text-[13px] text-primary-soft mt-0.5">
              {qtdItensAtivo} {qtdItensAtivo === 1 ? "item" : "itens"} na lista
            </div>
            <div className="mt-3.5 h-12 rounded-btn bg-white text-primary font-extrabold text-[15px] flex items-center justify-center gap-2">
              <span>Continuar compra</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
        )}

        {/* Botão Nova Compra conforme 1-inicio.html */}
        <Link
          href="/compra?nova=1"
          className="h-12 rounded-btn border-2 border-primary text-primary font-bold text-[15px] bg-card hover:bg-primary-light/40 flex items-center justify-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Nova compra</span>
        </Link>

        {/* Card de Grupo e Convite para a segunda pessoa (Etapa 2) */}
        <section className="bg-card border border-border rounded-card p-4 sm:p-5 flex flex-col gap-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold leading-snug">
                  {grupo.nome}
                </h2>
                <p className="text-xs text-text-muted">
                  {membros.length}{" "}
                  {membros.length === 1
                    ? "pessoa no grupo"
                    : "pessoas compartilhando"}
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-primary-light text-primary-hover text-[11px] font-bold">
              {grupo.fuso_horario}
            </span>
          </div>

          {/* Lista de membros atuais */}
          <div className="flex flex-wrap gap-2 pt-1">
            {membros.map((m, idx) => (
              <div
                key={m.user_id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background border border-border text-xs font-bold"
              >
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span>
                  {m.nome_exibicao || `Membro ${idx + 1}`}{" "}
                  {m.papel === "admin" ? "(Criador)" : ""}
                </span>
              </div>
            ))}
          </div>

          {erroConvite && (
            <div className="text-xs font-semibold text-budget-red-text bg-budget-red-bg px-3 py-2 rounded-xl">
              {erroConvite}
            </div>
          )}

          {/* Convite ativo ou botão de gerar convite */}
          {conviteAtivo ? (
            <div className="bg-background border border-border rounded-2xl p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-muted">
                  Convite ativo para a 2ª pessoa:
                </span>
                <button
                  type="button"
                  onClick={() => handleExcluirConvite(conviteAtivo.id)}
                  className="text-xs text-text-muted hover:text-budget-red flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Cancelar</span>
                </button>
              </div>

              <div className="text-xl font-extrabold tracking-widest text-primary">
                {conviteAtivo.codigo}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    copiarParaAreaDeTransferencia(
                      conviteAtivo.codigo,
                      "codigo"
                    )
                  }
                  className="h-11 rounded-xl bg-card border border-border font-bold text-xs text-text-main flex items-center justify-center gap-1.5 hover:border-primary cursor-pointer"
                >
                  {copiadoTexto === "codigo" ? (
                    <>
                      <Check className="w-4 h-4 text-primary" />
                      <span>Código copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-text-muted" />
                      <span>Copiar código</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    copiarParaAreaDeTransferencia(linkConvite, "link")
                  }
                  className="h-11 rounded-xl bg-primary text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-primary-hover cursor-pointer"
                >
                  {copiadoTexto === "link" ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Link copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar link</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-text-muted leading-snug">
                Envie o link ou o código no WhatsApp. O convite é de uso único.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGerarConvite}
              disabled={gerandoConvite}
              className="h-12 rounded-btn border-2 border-primary text-primary font-bold text-sm bg-card hover:bg-primary-light/50 flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>
                {gerandoConvite
                  ? "Gerando código..."
                  : "Convidar segunda pessoa para o grupo"}
              </span>
            </button>
          )}
        </section>

        {/* Card dos 11 Setores Padrão criados no banco com RLS */}
        <section className="bg-card border border-border rounded-card p-4 sm:p-5 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold">
                Setores padrão criados ({setores.length})
              </h2>
              <p className="text-xs text-text-muted">
                Orçamento inicial vazio (será configurado na aba Orçamento)
              </p>
            </div>
            <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {setores.map((setor) => (
              <div
                key={setor.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background border border-border text-xs font-semibold text-text-main"
              >
                <span>{setor.emoji}</span>
                <span>{setor.nome}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
