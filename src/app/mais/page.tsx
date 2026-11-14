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
  QrCode,
  Sparkles,
  Eye,
  EyeOff,
  KeyRound,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BottomNav from "@/components/BottomNav";
import GuestConversionBanner from "@/components/GuestConversionBanner";
import {
  MODELOS_IA_DISPONIVEIS,
  carregarConfigIADoGrupo,
  lerConfigIA,
  limparChaveIANoGrupo,
  mascararChaveIA,
  salvarConfigIANoGrupo,
  temIAConfigurada,
  type ConfigIA,
  type ModeloIA,
} from "@/lib/ia-config";
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

  // Estado da Configuração Opcional de IA (Google AI Studio no aparelho)
  const [configIA, setConfigIA] = useState<ConfigIA>({
    ativada: false,
    apiKey: "",
    modelo: "gemini-3.8-flash",
  });
  const [sheetIAAberto, setSheetIAAberto] = useState(false);
  const [iaAtivadaForm, setIaAtivadaForm] = useState(false);
  const [iaChaveForm, setIaChaveForm] = useState("");
  const [iaModeloForm, setIaModeloForm] = useState<ModeloIA>("gemini-3.8-flash");
  const [mostrarChaveIA, setMostrarChaveIA] = useState(false);
  const [testandoIA, setTestandoIA] = useState(false);
  const [feedbackIA, setFeedbackIA] = useState<{
    tipo: "sucesso" | "erro";
    texto: string;
  } | null>(null);

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

      const cfgGrupo = await carregarConfigIADoGrupo(supabase, gId);
      setConfigIA(cfgGrupo);
    } catch {
      setErro("Erro ao carregar os cadastros.");
    } finally {
      setCarregando(false);
    }
  }, [router]);

  useEffect(() => {
    carregarTudo();
    setConfigIA(lerConfigIA());
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

  // --- Funções da IA Opcional (Google AI Studio) ---
  function abrirConfigIA() {
    const atual = lerConfigIA();
    setConfigIA(atual);
    setIaAtivadaForm(atual.ativada);
    setIaChaveForm(atual.apiKey);
    setIaModeloForm(atual.modelo);
    setMostrarChaveIA(false);
    setFeedbackIA(null);
    setSheetIAAberto(true);
  }

  async function handleTestarChaveIA() {
    const chave = iaChaveForm.trim();
    if (chave.length < 15) {
      setFeedbackIA({
        tipo: "erro",
        texto: "Cole uma chave válida do Google AI Studio antes de testar.",
      });
      return;
    }

    setTestandoIA(true);
    setFeedbackIA(null);
    try {
      const res = await fetch("/api/cupom/ia", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gemini-api-key": chave,
        },
        body: JSON.stringify({
          acao: "testar",
          modelo: iaModeloForm,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setFeedbackIA({
          tipo: "erro",
          texto: json?.erro || "Não foi possível validar a chave no momento.",
        });
        return;
      }

      setFeedbackIA({
        tipo: "sucesso",
        texto: json.mensagem || "Chave funcionando perfeitamente!",
      });
    } catch {
      setFeedbackIA({
        tipo: "erro",
        texto: "Erro de conexão ao testar a chave. Verifique sua internet.",
      });
    } finally {
      setTestandoIA(false);
    }
  }

  async function handleSalvarConfigIA(e: React.FormEvent) {
    e.preventDefault();
    const chave = iaChaveForm.trim();

    if (iaAtivadaForm && chave.length < 15) {
      setFeedbackIA({
        tipo: "erro",
        texto: "Para ativar a IA, cole primeiro sua chave do Google AI Studio.",
      });
      return;
    }

    const supabase = createClient();
    const salva = groupId
      ? await salvarConfigIANoGrupo(supabase, groupId, {
          ativada: iaAtivadaForm,
          apiKey: chave,
          modelo: iaModeloForm,
        })
      : lerConfigIA();
    setConfigIA(salva);
    setSheetIAAberto(false);
  }

  async function handleRemoverChaveIA() {
    if (!groupId) return;
    const supabase = createClient();
    const limpa = await limparChaveIANoGrupo(supabase, groupId);
    setConfigIA(limpa);
    setIaAtivadaForm(false);
    setIaChaveForm("");
    setFeedbackIA({
      tipo: "sucesso",
      texto: "Chave removida da conta da família e deste aparelho.",
    });
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-main pb-28 md:pb-8 md:pl-64">
      <GuestConversionBanner onConverted={carregarTudo} />
      <main className="flex-1 w-full max-w-md md:max-w-4xl lg:max-w-6xl mx-auto px-5 md:px-8 pt-5 md:pt-8 flex flex-col gap-5">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-44 bg-border/70 rounded-card animate-pulse" />
            <div className="h-44 bg-border/70 rounded-card animate-pulse" />
            <div className="h-44 bg-border/70 rounded-card animate-pulse" />
            <div className="h-44 bg-border/70 rounded-card animate-pulse" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
            {/* COLUNA ESQUERDA: Mercados e Setores */}
            <div className="flex flex-col gap-5">
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
          </div>

          {/* COLUNA DIREITA: Configurações, Histórico e Exportação */}
          <div className="flex flex-col gap-5">
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

            {/* 3.5. INTELIGÊNCIA ARTIFICIAL OPCIONAL (GOOGLE AI STUDIO) */}
            <section className="bg-card border border-border rounded-card p-4 sm:p-5 flex flex-col gap-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-extrabold">
                        IA para Cupons
                      </h2>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          temIAConfigurada(configIA)
                            ? "bg-budget-green-bg text-budget-green-text"
                            : "bg-background border border-border text-text-muted"
                        }`}
                      >
                        {temIAConfigurada(configIA) ? "Ativa" : "Opcional"}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted truncate">
                      {temIAConfigurada(configIA)
                        ? `Chave ${mascararChaveIA(configIA.apiKey)} · ${
                            MODELOS_IA_DISPONIVEIS.find((m) => m.id === configIA.modelo)?.nome || configIA.modelo
                          }`
                        : configIA.apiKey
                        ? `Desligada · Chave salva (${mascararChaveIA(configIA.apiKey)})`
                        : "Use sua chave gratuita do Google AI Studio"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={abrirConfigIA}
                  className="h-11 px-3.5 rounded-xl bg-background border border-border font-bold text-xs text-text-main hover:border-primary cursor-pointer shrink-0"
                >
                  Configurar
                </button>
              </div>
            </section>

            {/* 4. ATALHOS, CUPOM E EXPORTAÇÃO */}
            <section className="bg-card border border-border rounded-card p-4 flex flex-col divide-y divide-border shadow-sm">
              <button
                type="button"
                onClick={() => router.push("/mais/cupom")}
                className="flex items-center justify-between py-2.5 px-1 text-left hover:opacity-80 transition-opacity cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center shrink-0">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-text-main flex items-center gap-1.5">
                      <span>Importar Cupom Fiscal</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-primary text-white">Novo</span>
                    </div>
                    <div className="text-xs text-text-muted">
                      Ler QR Code da nota, PDF ou link para gerar carrinho automático
                    </div>
                  </div>
                </div>
                <span className="h-9 px-3 rounded-xl bg-primary-light text-primary-hover font-bold text-xs flex items-center justify-center shrink-0">
                  Importar
                </span>
              </button>
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
          </div>
        </div>
        )}
      </main>

      {/* MODAL / BOTTOM SHEET: MERCADO */}
      {sheetMercadoAberto && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="w-full max-w-md md:max-w-lg bg-card rounded-t-[24px] md:rounded-2xl p-5 flex flex-col gap-4 shadow-2xl animate-in fade-in duration-200 max-h-[92vh] overflow-y-auto">
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

      {/* MODAL / BOTTOM SHEET: SETOR */}
      {sheetSetorAberto && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="w-full max-w-md md:max-w-lg bg-card rounded-t-[24px] md:rounded-2xl p-5 flex flex-col gap-4 shadow-2xl animate-in fade-in duration-200 max-h-[92vh] overflow-y-auto">
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

      {/* MODAL / BOTTOM SHEET: CONFIGURAÇÕES */}
      {sheetConfigAberto && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="w-full max-w-md md:max-w-lg bg-card rounded-t-[24px] md:rounded-2xl p-5 flex flex-col gap-4 shadow-2xl animate-in fade-in duration-200 max-h-[92vh] overflow-y-auto">
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

      {/* MODAL / BOTTOM SHEET: INTELIGÊNCIA ARTIFICIAL (GOOGLE AI STUDIO) */}
      {sheetIAAberto && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="w-full max-w-md md:max-w-lg bg-card rounded-t-[24px] md:rounded-2xl p-5 flex flex-col gap-4 shadow-2xl animate-in fade-in duration-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary-light text-primary flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold leading-tight">
                    Inteligência Artificial (Opcional)
                  </h3>
                  <p className="text-xs text-text-muted">
                    Limpa nomes, separa marcas e sugere setores no cupom
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSheetIAAberto(false)}
                className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-text-muted cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarConfigIA} className="flex flex-col gap-4">
              {/* Interruptor Ligar / Desligar */}
              <div className="bg-background border border-border rounded-2xl p-3.5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-text-main">
                    Ativar IA ao importar cupons
                  </div>
                  <div className="text-xs text-text-muted">
                    Se desligada ou sem cota, usa o identificador grátis local
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={iaAtivadaForm}
                  onClick={() => setIaAtivadaForm((v) => !v)}
                  className={`w-12 h-7 rounded-full transition-colors p-0.5 flex items-center cursor-pointer shrink-0 ${
                    iaAtivadaForm ? "bg-primary justify-end" : "bg-border justify-start"
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-white shadow-sm block" />
                </button>
              </div>

              {/* Guia rápido de chave gratuita */}
              <div className="bg-primary-light/50 border border-primary/20 rounded-2xl p-3.5 text-xs text-text-muted flex flex-col gap-1.5">
                <div className="font-bold text-text-main flex items-center justify-between gap-2 flex-wrap">
                  <span>Como pegar sua chave gratuita:</span>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary font-extrabold hover:underline"
                  >
                    <span>Abrir Google AI Studio</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="leading-relaxed">
                  Acesse com sua conta Google, clique em <strong>Create API key</strong> e cole o código abaixo. A chave fica salva <strong>para toda a sua família/grupo</strong> (sincronizada automaticamente nos seus aparelhos).
                </p>
              </div>

              {/* Campo da Chave */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-muted flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Sua chave da API (Google AI Studio)</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type={mostrarChaveIA ? "text" : "password"}
                    value={iaChaveForm}
                    onChange={(e) => {
                      const val = e.target.value;
                      setIaChaveForm(val);
                      setFeedbackIA(null);
                      if (!iaChaveForm.trim() && val.trim().length >= 15) {
                        setIaAtivadaForm(true);
                      }
                    }}
                    placeholder="Cole aqui (ex.: AIzaSy...)"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full h-12 pl-4 pr-12 rounded-xl bg-background border border-border text-sm font-semibold text-text-main focus:outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarChaveIA((v) => !v)}
                    aria-label={mostrarChaveIA ? "Ocultar chave" : "Mostrar chave"}
                    className="absolute right-2 w-9 h-9 rounded-lg flex items-center justify-center text-text-muted hover:text-text-main cursor-pointer"
                  >
                    {mostrarChaveIA ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Escolha do Modelo */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-muted">
                  Modelo do Gemini
                </label>
                <div className="flex flex-col gap-2">
                  {MODELOS_IA_DISPONIVEIS.map((mod) => (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => setIaModeloForm(mod.id)}
                      className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                        iaModeloForm === mod.id
                          ? "bg-primary-light border-primary text-text-main"
                          : "bg-background border-border text-text-muted hover:text-text-main"
                      }`}
                    >
                      <div className="text-xs font-extrabold">{mod.nome}</div>
                      <div className="text-[11px] opacity-85 mt-0.5">{mod.descricao}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Retorno do Teste ou Validação */}
              {feedbackIA && (
                <div
                  className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-start gap-2 ${
                    feedbackIA.tipo === "sucesso"
                      ? "bg-budget-green-bg text-budget-green-text"
                      : "bg-budget-red-bg text-budget-red-text"
                  }`}
                >
                  {feedbackIA.tipo === "sucesso" ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{feedbackIA.texto}</span>
                </div>
              )}

              {/* Ações */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleTestarChaveIA}
                  disabled={testandoIA}
                  className="h-12 px-4 rounded-btn bg-background border border-border hover:border-primary text-xs font-bold text-text-main flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span>{testandoIA ? "Testando..." : "Testar chave"}</span>
                </button>

                {iaChaveForm.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={handleRemoverChaveIA}
                    className="h-12 px-3.5 rounded-btn border border-budget-red text-budget-red text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                    title="Apagar chave salva deste aparelho"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Remover</span>
                  </button>
                )}

                <button
                  type="submit"
                  className="flex-1 h-12 px-5 rounded-btn bg-primary hover:bg-primary-hover text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
