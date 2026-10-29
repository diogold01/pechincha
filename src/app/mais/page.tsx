"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Store,
  Layers,
  Settings,
  Plus,
  Star,
  Pencil,
  Trash2,
  X,
  Check,
  AlertCircle,
  History,
  Download,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BottomNav from "@/components/BottomNav";
import type { Group, GroupSettings, Market, MetodoPreco, Sector } from "@/lib/types";

const EMOJIS_SUGERIDOS = [
  "🥬", "🥩", "🍞", "🧀", "🥫", "🥤", "🧽", "🧴",
  "🧊", "🐾", "🛒", "🍎", "🥚", "🍫", "🍺", "☕",
  "👶", "💊", "🏠", "🎉",
];

export default function MaisPage() {
  const router = useRouter();

  const [carregando, setCarregando] = useState(true);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<Group | null>(null);
  const [settings, setSettings] = useState<GroupSettings | null>(null);
  const [mercados, setMercados] = useState<Market[]>([]);
  const [setores, setSetores] = useState<Sector[]>([]);

  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Estado do Bottom Sheet de Mercado
  const [sheetMercadoAberto, setSheetMercadoAberto] = useState(false);
  const [mercadoEditando, setMercadoEditando] = useState<Market | null>(null);
  const [nomeMercado, setNomeMercado] = useState("");
  const [mercadoPadraoFlag, setMercadoPadraoFlag] = useState(false);

  // Estado do Bottom Sheet de Setor
  const [sheetSetorAberto, setSheetSetorAberto] = useState(false);
  const [setorEditando, setSetorEditando] = useState<Sector | null>(null);
  const [nomeSetor, setNomeSetor] = useState("");
  const [emojiSetor, setEmojiSetor] = useState("🛒");

  // Estado do Bottom Sheet de Configurações
  const [sheetConfigAberto, setSheetConfigAberto] = useState(false);
  const [metodoPreco, setMetodoPreco] = useState<MetodoPreco>("media");
  const [mesesMedia, setMesesMedia] = useState<number>(3);
  const [fusoGrupo, setFusoGrupo] = useState<string>("America/Cuiaba");

  const carregarTudo = useCallback(async () => {
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

      const { data: memberRows } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id)
        .limit(1);

      if (!memberRows || memberRows.length === 0) {
        router.replace("/");
        return;
      }

      const gId = memberRows[0].group_id;
      setGroupId(gId);

      const [
        { data: gData },
        { data: sData },
        { data: mData },
        { data: secData },
      ] = await Promise.all([
        supabase.from("groups").select("*").eq("id", gId).single(),
        supabase.from("group_settings").select("*").eq("group_id", gId).single(),
        supabase
          .from("markets")
          .select("*")
          .eq("group_id", gId)
          .order("padrao", { ascending: false })
          .order("nome", { ascending: true }),
        supabase
          .from("sectors")
          .select("*")
          .eq("group_id", gId)
          .order("ordem", { ascending: true })
          .order("nome", { ascending: true }),
      ]);

      if (gData) {
        const g = gData as Group;
        setGrupo(g);
        setFusoGrupo(g.fuso_horario || "America/Cuiaba");
      }
      if (sData) {
        const st = sData as GroupSettings;
        setSettings(st);
        setMetodoPreco(st.metodo_preco || "media");
        setMesesMedia(st.meses_media || 3);
      }
      setMercados((mData as Market[]) || []);
      setSetores((secData as Sector[]) || []);
    } catch {
      setErro("Erro ao carregar os cadastros.");
    } finally {
      setCarregando(false);
    }
  }, [router]);

  useEffect(() => {
    carregarTudo();
  }, [carregarTudo]);

  // --- Funções de Mercado ---
  function abrirNovoMercado() {
    setErro(null);
    setMercadoEditando(null);
    setNomeMercado("");
    setMercadoPadraoFlag(mercados.length === 0);
    setSheetMercadoAberto(true);
  }

  function abrirEditarMercado(m: Market) {
    setErro(null);
    setMercadoEditando(m);
    setNomeMercado(m.nome);
    setMercadoPadraoFlag(m.padrao);
    setSheetMercadoAberto(true);
  }

  async function handleSalvarMercado(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || !nomeMercado.trim()) {
      setErro("Digite o nome do mercado.");
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      const supabase = createClient();
      const tornarPadrao = mercadoPadraoFlag || mercados.length === 0;

      if (tornarPadrao) {
        await supabase
          .from("markets")
          .update({ padrao: false })
          .eq("group_id", groupId);
      }

      let mercadoSalvoId = mercadoEditando?.id || null;

      if (mercadoEditando) {
        const { error } = await supabase
          .from("markets")
          .update({
            nome: nomeMercado.trim(),
            padrao: tornarPadrao,
          })
          .eq("id", mercadoEditando.id);
        if (error) throw error;
      } else {
        const { data: novo, error } = await supabase
          .from("markets")
          .insert({
            group_id: groupId,
            nome: nomeMercado.trim(),
            padrao: tornarPadrao,
          })
          .select()
          .single();
        if (error) throw error;
        mercadoSalvoId = (novo as Market).id;
      }

      if (tornarPadrao && mercadoSalvoId) {
        await supabase
          .from("group_settings")
          .update({
            mercado_padrao_id: mercadoSalvoId,
            atualizado_em: new Date().toISOString(),
          })
          .eq("group_id", groupId);
      }

      setSheetMercadoAberto(false);
      await carregarTudo();
    } catch {
      setErro("Não foi possível salvar o mercado.");
    } finally {
      setSalvando(false);
    }
  }

  async function handleTornarPadraoDireto(m: Market) {
    if (!groupId) return;
    const supabase = createClient();
    await supabase
      .from("markets")
      .update({ padrao: false })
      .eq("group_id", groupId);
    await supabase.from("markets").update({ padrao: true }).eq("id", m.id);
    await supabase
      .from("group_settings")
      .update({
        mercado_padrao_id: m.id,
        atualizado_em: new Date().toISOString(),
      })
      .eq("group_id", groupId);
    await carregarTudo();
  }

  async function handleExcluirMercado(m: Market) {
    if (!groupId) return;
    setSalvando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("markets").delete().eq("id", m.id);
      if (error) {
        setErro(
          "Não foi possível excluir este mercado pois ele possui preços registrados."
        );
        return;
      }
      setSheetMercadoAberto(false);
      await carregarTudo();
    } finally {
      setSalvando(false);
    }
  }

  // --- Funções de Setor ---
  function abrirNovoSetor() {
    setErro(null);
    setSetorEditando(null);
    setNomeSetor("");
    setEmojiSetor("🛒");
    setSheetSetorAberto(true);
  }

  function abrirEditarSetor(s: Sector) {
    setErro(null);
    setSetorEditando(s);
    setNomeSetor(s.nome);
    setEmojiSetor(s.emoji || "🛒");
    setSheetSetorAberto(true);
  }

  async function handleSalvarSetor(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || !nomeSetor.trim()) {
      setErro("Digite o nome do setor.");
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      const supabase = createClient();
      if (setorEditando) {
        const { error } = await supabase
          .from("sectors")
          .update({
            nome: nomeSetor.trim(),
            emoji: emojiSetor.trim() || "🛒",
          })
          .eq("id", setorEditando.id);
        if (error) throw error;
      } else {
        const maiorOrdem =
          setores.length > 0
            ? Math.max(...setores.map((s) => s.ordem || 0))
            : 0;
        const { error } = await supabase.from("sectors").insert({
          group_id: groupId,
          nome: nomeSetor.trim(),
          emoji: emojiSetor.trim() || "🛒",
          orcamento_mensal: null,
          ordem: maiorOrdem + 1,
        });
        if (error) throw error;
      }

      setSheetSetorAberto(false);
      await carregarTudo();
    } catch {
      setErro("Não foi possível salvar o setor.");
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluirSetor(s: Sector) {
    if (!groupId) return;
    setSalvando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("sectors").delete().eq("id", s.id);
      if (error) {
        setErro("Não foi possível excluir o setor.");
        return;
      }
      setSheetSetorAberto(false);
      await carregarTudo();
    } finally {
      setSalvando(false);
    }
  }

  // --- Funções de Configurações ---
  async function handleSalvarConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId) return;
    setSalvando(true);
    setErro(null);
    try {
      const supabase = createClient();
      const mesesValido = Math.max(1, Math.min(24, Number(mesesMedia) || 3));

      await Promise.all([
        supabase
          .from("group_settings")
          .update({
            metodo_preco: metodoPreco,
            meses_media: mesesValido,
            atualizado_em: new Date().toISOString(),
          })
          .eq("group_id", groupId),
        supabase
          .from("groups")
          .update({
            fuso_horario: fusoGrupo.trim() || "America/Cuiaba",
          })
          .eq("id", groupId),
      ]);

      setSheetConfigAberto(false);
      await carregarTudo();
    } catch {
      setErro("Não foi possível salvar as configurações.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-main pb-28">
      <main className="flex-1 w-full max-w-md mx-auto px-5 pt-5 flex flex-col gap-5">
        <div>
          <div className="text-[13px] text-text-muted font-medium">
            {grupo?.nome || "Cadastros e Ajustes"}
          </div>
          <h1 className="text-[28px] font-extrabold leading-tight">Mais</h1>
        </div>

        {erro && (
          <div className="bg-budget-red-bg text-budget-red-text px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {carregando ? (
          <div className="flex flex-col gap-4">
            <div className="h-40 bg-border/70 rounded-card animate-pulse" />
            <div className="h-56 bg-border/70 rounded-card animate-pulse" />
          </div>
        ) : (
          <>
            {/* 1. MERCADOS */}
            <section className="bg-card border border-border rounded-card p-4 sm:p-5 flex flex-col gap-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center">
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold">Mercados</h2>
                    <p className="text-xs text-text-muted">
                      Um mercado é o padrão para novos carrinhos
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={abrirNovoMercado}
                  className="h-11 px-3.5 rounded-xl bg-primary text-white font-bold text-xs flex items-center gap-1.5 hover:bg-primary-hover cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo</span>
                </button>
              </div>

              {mercados.length === 0 ? (
                <div className="bg-background border border-dashed border-border rounded-2xl p-4 text-center">
                  <p className="text-xs text-text-muted font-medium">
                    Nenhum mercado cadastrado ainda. Cadastre o mercado onde
                    vocês mais compram!
                  </p>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-border border border-border rounded-2xl overflow-hidden bg-background">
                  {mercados.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between px-3.5 py-3 bg-card"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => handleTornarPadraoDireto(m)}
                          title={
                            m.padrao
                              ? "Mercado padrão"
                              : "Tornar este o mercado padrão"
                          }
                          className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                            m.padrao
                              ? "bg-primary-light text-primary"
                              : "bg-background text-text-muted hover:text-primary"
                          }`}
                        >
                          <Star
                            className="w-4 h-4"
                            fill={m.padrao ? "currentColor" : "none"}
                          />
                        </button>
                        <div className="truncate">
                          <div className="text-sm font-bold text-text-main truncate">
                            {m.nome}
                          </div>
                          {m.padrao && (
                            <span className="text-[11px] font-bold text-primary">
                              Mercado padrão
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => abrirEditarMercado(m)}
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-text-muted hover:text-text-main hover:bg-background cursor-pointer"
                        aria-label={`Editar ${m.nome}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 2. SETORES */}
            <section className="bg-card border border-border rounded-card p-4 sm:p-5 flex flex-col gap-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold">
                      Setores ({setores.length})
                    </h2>
                    <p className="text-xs text-text-muted">
                      Toque em um setor para editar nome ou emoji
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={abrirNovoSetor}
                  className="h-11 px-3.5 rounded-xl bg-primary text-white font-bold text-xs flex items-center gap-1.5 hover:bg-primary-hover cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {setores.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => abrirEditarSetor(s)}
                    className="h-11 px-3.5 rounded-full bg-background border border-border hover:border-primary flex items-center gap-2 text-xs font-bold text-text-main transition-colors cursor-pointer"
                  >
                    <span className="text-base leading-none">{s.emoji}</span>
                    <span>{s.nome}</span>
                    <Pencil className="w-3 h-3 text-text-muted ml-0.5" />
                  </button>
                ))}
              </div>
            </section>

            {/* 3. CONFIGURAÇÕES DE PREÇO E FUSO */}
            <section className="bg-card border border-border rounded-card p-4 sm:p-5 flex flex-col gap-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center">
                    <Settings className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold">Configurações</h2>
                    <p className="text-xs text-text-muted">
                      Cálculo do preço estimado:{" "}
                      <strong className="text-text-main">
                        {settings?.metodo_preco === "ultimo"
                          ? "Último preço"
                          : settings?.metodo_preco === "menor"
                          ? "Menor preço"
                          : `Média (${settings?.meses_media || 3} meses)`}
                      </strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSheetConfigAberto(true)}
                  className="h-11 px-3.5 rounded-xl bg-background border border-border font-bold text-xs text-text-main hover:border-primary cursor-pointer"
                >
                  Ajustar
                </button>
              </div>
            </section>

            {/* 4. HISTÓRICO E EXPORTAÇÃO */}
            <section className="bg-card border border-border rounded-card p-4 flex flex-col divide-y divide-border shadow-sm">
              <button
                type="button"
                onClick={() => router.push("/historico")}
                className="flex items-center justify-between py-2.5 px-1 text-left hover:opacity-80 transition-opacity cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center shrink-0">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-text-main">
                      Histórico de carrinhos
                    </div>
                    <div className="text-xs text-text-muted">
                      Ver compras anteriores, gastos por setor e repetir lista
                    </div>
                  </div>
                </div>
                <span className="h-9 px-3 rounded-xl bg-primary-light text-primary-hover font-bold text-xs flex items-center justify-center shrink-0">
                  Abrir
                </span>
              </button>
              <button
                type="button"
                onClick={() => router.push("/exportar")}
                className="flex items-center justify-between py-2.5 px-1 text-left hover:opacity-80 transition-opacity cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center shrink-0">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-text-main">
                      Exportar CSV, Backup e App
                    </div>
                    <div className="text-xs text-text-muted">
                      Planilha para finanças, backup completo e instalar no
                      celular
                    </div>
                  </div>
                </div>
                <span className="h-9 px-3 rounded-xl bg-primary-light text-primary-hover font-bold text-xs flex items-center justify-center shrink-0">
                  Abrir
                </span>
              </button>
            </section>
          </>
        )}
      </main>

      {/* BOTTOM SHEET: MERCADO */}
      {sheetMercadoAberto && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
          <div className="w-full max-w-md bg-card rounded-t-[24px] p-5 flex flex-col gap-4 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">
                {mercadoEditando ? "Editar mercado" : "Novo mercado"}
              </h3>
              <button
                type="button"
                onClick={() => setSheetMercadoAberto(false)}
                className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-text-muted cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarMercado} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-muted">
                  Nome do mercado
                </label>
                <input
                  type="text"
                  value={nomeMercado}
                  onChange={(e) => setNomeMercado(e.target.value)}
                  placeholder="Ex: Assaí, Comper, Big Lar..."
                  autoFocus
                  className="w-full h-12 px-4 rounded-xl bg-background border border-border text-sm font-semibold text-text-main focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <label className="flex items-center gap-3 p-3.5 rounded-xl bg-background border border-border cursor-pointer">
                <input
                  type="checkbox"
                  checked={mercadoPadraoFlag}
                  onChange={(e) => setMercadoPadraoFlag(e.target.checked)}
                  className="w-5 h-5 accent-primary rounded"
                />
                <div className="text-xs">
                  <div className="font-bold text-text-main">
                    Definir como mercado padrão
                  </div>
                  <div className="text-text-muted">
                    Será selecionado automaticamente ao criar novos carrinhos e
                    preços
                  </div>
                </div>
              </label>

              <div className="flex gap-2.5 pt-1">
                {mercadoEditando && (
                  <button
                    type="button"
                    onClick={() => handleExcluirMercado(mercadoEditando)}
                    disabled={salvando}
                    className="h-12 px-4 rounded-btn border border-budget-red text-budget-red font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Excluir</span>
                  </button>
                )}
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 h-12 rounded-btn bg-primary hover:bg-primary-hover text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{salvando ? "Salvando..." : "Salvar mercado"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BOTTOM SHEET: SETOR */}
      {sheetSetorAberto && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
          <div className="w-full max-w-md bg-card rounded-t-[24px] p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">
                {setorEditando ? "Editar setor" : "Novo setor"}
              </h3>
              <button
                type="button"
                onClick={() => setSheetSetorAberto(false)}
                className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-text-muted cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarSetor} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-muted">
                  Escolha um emoji ou digite
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {EMOJIS_SUGERIDOS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setEmojiSetor(em)}
                      className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center border cursor-pointer ${
                        emojiSetor === em
                          ? "bg-primary-light border-primary"
                          : "bg-background border-border"
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2.5">
                <div className="w-20 flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-muted">
                    Emoji
                  </label>
                  <input
                    type="text"
                    value={emojiSetor}
                    onChange={(e) => setEmojiSetor(e.target.value)}
                    onFocus={(e) => setEmojiSetor("")}
                    placeholder="🛒"
                    className="w-full h-12 text-center rounded-xl bg-background border border-border text-lg focus:outline-none focus:border-primary focus:placeholder-transparent"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-muted">
                    Nome do setor
                  </label>
                  <input
                    type="text"
                    value={nomeSetor}
                    onChange={(e) => setNomeSetor(e.target.value)}
                    placeholder="Ex: Bebidas, Feira..."
                    className="w-full h-12 px-4 rounded-xl bg-background border border-border text-sm font-semibold text-text-main focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-1">
                {setorEditando && (
                  <button
                    type="button"
                    onClick={() => handleExcluirSetor(setorEditando)}
                    disabled={salvando}
                    className="h-12 px-4 rounded-btn border border-budget-red text-budget-red font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Excluir</span>
                  </button>
                )}
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 h-12 rounded-btn bg-primary hover:bg-primary-hover text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{salvando ? "Salvando..." : "Salvar setor"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BOTTOM SHEET: CONFIGURAÇÕES */}
      {sheetConfigAberto && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
          <div className="w-full max-w-md bg-card rounded-t-[24px] p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">
                Configurações de Estimativa
              </h3>
              <button
                type="button"
                onClick={() => setSheetConfigAberto(false)}
                className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-text-muted cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarConfig} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-muted">
                  Método padrão para calcular preço estimado
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: "media", label: "Média" },
                      { id: "ultimo", label: "Último preço" },
                      { id: "menor", label: "Menor preço" },
                    ] as const
                  ).map((op) => (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => setMetodoPreco(op.id)}
                      className={`h-11 rounded-xl font-bold text-xs border cursor-pointer ${
                        metodoPreco === op.id
                          ? "bg-primary-light border-primary text-primary"
                          : "bg-background border-border text-text-muted"
                      }`}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-muted">
                  Período considerado (últimos N meses)
                </label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={mesesMedia}
                  onChange={(e) => setMesesMedia(Number(e.target.value))}
                  className="w-full h-12 px-4 rounded-xl bg-background border border-border text-sm font-bold text-text-main focus:outline-none focus:border-primary"
                />
                <span className="text-[11px] text-text-muted">
                  Padrão: 3 meses. Se não houver preço no período, o app usa o
                  último conhecido e avisa que está desatualizado.
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-muted">
                  Fuso horário do grupo
                </label>
                <input
                  type="text"
                  value={fusoGrupo}
                  onChange={(e) => setFusoGrupo(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl bg-background border border-border text-sm font-semibold text-text-main focus:outline-none focus:border-primary"
                />
              </div>

              <button
                type="submit"
                disabled={salvando}
                className="h-12 rounded-btn bg-primary hover:bg-primary-hover text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{salvando ? "Salvando..." : "Salvar configurações"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
