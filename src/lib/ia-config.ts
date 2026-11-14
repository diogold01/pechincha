import { createClient } from "@/lib/supabase/client";

/**
 * Configurações da Inteligência Artificial opcional (Google AI Studio / Gemini).
 * Sincroniza por grupo familiar (group_settings no Supabase) para funcionar em todos
 * os dispositivos e membros do grupo, mantendo cache local no aparelho (localStorage).
 */

export const MODELOS_IA_DISPONIVEIS = [
  {
    id: "gemini-3.8-flash",
    nome: "Gemini 3.8 Flash (Recomendado)",
    descricao: "Melhor equilíbrio entre rapidez e precisão em nomes e marcas brasileiras.",
  },
  {
    id: "gemini-3.5-flash-lite",
    nome: "Gemini 3.5 Flash Lite",
    descricao: "Opção mais leve e econômica para preservar a cota gratuita.",
  },
] as const;

export type ModeloIA = (typeof MODELOS_IA_DISPONIVEIS)[number]["id"];

export interface ConfigIA {
  ativada: boolean;
  apiKey: string;
  modelo: ModeloIA;
}

export const CODIGO_BARRAS_CONFIG_IA = "__config_ia_grupo__";
export const CODIGO_BARRAS_AVULSO = "__avulso__";

const STORAGE_KEY_IA = "pechincha_ia_config_v1";

const CONFIG_PADRAO: ConfigIA = {
  ativada: false,
  apiKey: "",
  modelo: "gemini-3.8-flash",
};

type SupabaseBrowserClient = ReturnType<typeof createClient>;

/**
 * Garante que o identificador do modelo pertence à lista suportada
 */
export function normalizarModeloIA(modelo?: string | null): ModeloIA {
  const achado = MODELOS_IA_DISPONIVEIS.find((m) => m.id === modelo);
  return achado ? achado.id : CONFIG_PADRAO.modelo;
}

/**
 * Identifica registros internos técnicos na tabela products que não devem aparecer no catálogo
 */
export function ehProdutoInternoSistema(codigoBarras?: string | null): boolean {
  return (
    codigoBarras === CODIGO_BARRAS_CONFIG_IA ||
    codigoBarras === CODIGO_BARRAS_AVULSO
  );
}

/**
 * Lê as preferências de IA salvas no navegador atual
 */
export function lerConfigIA(): ConfigIA {
  if (typeof window === "undefined") {
    return { ...CONFIG_PADRAO };
  }

  try {
    const bruto = window.localStorage.getItem(STORAGE_KEY_IA);
    if (!bruto) return { ...CONFIG_PADRAO };

    const parsed = JSON.parse(bruto) as Partial<ConfigIA>;
    return {
      ativada: Boolean(parsed.ativada),
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "",
      modelo: normalizarModeloIA(parsed.modelo),
    };
  } catch {
    return { ...CONFIG_PADRAO };
  }
}

/**
 * Salva ou atualiza as preferências de IA no navegador atual
 */
export function salvarConfigIA(parcial: Partial<ConfigIA>): ConfigIA {
  const atual = lerConfigIA();
  const proximo: ConfigIA = {
    ativada: parcial.ativada !== undefined ? Boolean(parcial.ativada) : atual.ativada,
    apiKey:
      parcial.apiKey !== undefined ? parcial.apiKey.trim() : atual.apiKey,
    modelo:
      parcial.modelo !== undefined
        ? normalizarModeloIA(parcial.modelo)
        : atual.modelo,
  };

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY_IA, JSON.stringify(proximo));
    } catch {
      // Ignora erro caso armazenamento esteja bloqueado no modo privado
    }
  }

  return proximo;
}

/**
 * Remove a chave salva do aparelho e desativa o recurso
 */
export function limparChaveIA(): ConfigIA {
  return salvarConfigIA({ ativada: false, apiKey: "" });
}

async function lerFallbackConfigEmProducts(
  supabase: SupabaseBrowserClient,
  groupId: string
): Promise<{ id: string; config: ConfigIA } | null> {
  const { data } = await supabase
    .from("products")
    .select("id, nome")
    .eq("group_id", groupId)
    .eq("codigo_barras", CODIGO_BARRAS_CONFIG_IA)
    .limit(1)
    .maybeSingle();

  if (!data?.nome) return null;
  try {
    const parsed = JSON.parse(data.nome) as Partial<ConfigIA>;
    return {
      id: data.id,
      config: {
        ativada: Boolean(parsed.ativada),
        apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "",
        modelo: normalizarModeloIA(parsed.modelo),
      },
    };
  } catch {
    return null;
  }
}

async function salvarFallbackConfigEmProducts(
  supabase: SupabaseBrowserClient,
  groupId: string,
  config: ConfigIA
): Promise<void> {
  const payloadJson = JSON.stringify(config);
  const { data: existente } = await supabase
    .from("products")
    .select("id")
    .eq("group_id", groupId)
    .eq("codigo_barras", CODIGO_BARRAS_CONFIG_IA)
    .limit(1)
    .maybeSingle();

  if (existente?.id) {
    await supabase
      .from("products")
      .update({ nome: payloadJson, ativo: false })
      .eq("id", existente.id);
  } else {
    await supabase.from("products").insert({
      group_id: groupId,
      nome: payloadJson,
      sector_id: null,
      unidade: "un",
      emoji: null,
      codigo_barras: CODIGO_BARRAS_CONFIG_IA,
      ativo: false,
    });
  }
}

/**
 * Carrega a configuração de IA compartilhada do grupo no Supabase (com cache local e fallback resiliente)
 */
export async function carregarConfigIADoGrupo(
  supabase: SupabaseBrowserClient,
  groupId: string
): Promise<ConfigIA> {
  const local = lerConfigIA();

  try {
    const { data, error } = await supabase
      .from("group_settings")
      .select("ia_ativada, ia_api_key, ia_modelo")
      .eq("group_id", groupId)
      .maybeSingle();

    if (!error) {
      const apiKeyBanco =
        typeof data?.ia_api_key === "string" ? data.ia_api_key.trim() : "";

      if (apiKeyBanco) {
        return salvarConfigIA({
          ativada: Boolean(data?.ia_ativada),
          apiKey: apiKeyBanco,
          modelo: normalizarModeloIA(data?.ia_modelo),
        });
      }

      // Verifica se havia configuração salva no fallback antes da migração SQL
      const fallback = await lerFallbackConfigEmProducts(supabase, groupId);
      if (fallback?.config.apiKey) {
        await salvarConfigIANoGrupo(supabase, groupId, fallback.config);
        await supabase.from("products").delete().eq("id", fallback.id);
        return salvarConfigIA(fallback.config);
      }

      // Se o dispositivo atual já tinha uma chave local, sincroniza com o grupo
      if (local.apiKey.trim().length >= 15) {
        await salvarConfigIANoGrupo(supabase, groupId, local);
      }
      return local;
    }

    // Fallback resiliente caso a migração SQL de group_settings ainda não tenha sido aplicada
    const fallback = await lerFallbackConfigEmProducts(supabase, groupId);
    if (fallback?.config.apiKey) {
      return salvarConfigIA(fallback.config);
    }

    if (local.apiKey.trim().length >= 15) {
      await salvarFallbackConfigEmProducts(supabase, groupId, local);
    }
    return local;
  } catch {
    return local;
  }
}

/**
 * Salva a configuração de IA no grupo (Supabase) e no navegador local
 */
export async function salvarConfigIANoGrupo(
  supabase: SupabaseBrowserClient,
  groupId: string,
  parcial: Partial<ConfigIA>
): Promise<ConfigIA> {
  const proximo = salvarConfigIA(parcial);

  try {
    const { error } = await supabase.from("group_settings").upsert(
      {
        group_id: groupId,
        ia_ativada: proximo.ativada,
        ia_api_key: proximo.apiKey || null,
        ia_modelo: proximo.modelo,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "group_id" }
    );

    if (error) {
      await salvarFallbackConfigEmProducts(supabase, groupId, proximo);
    }
  } catch {
    // Cache local já foi atualizado acima
  }

  return proximo;
}

/**
 * Remove a chave da IA do grupo (Supabase) e do navegador atual
 */
export async function limparChaveIANoGrupo(
  supabase: SupabaseBrowserClient,
  groupId: string
): Promise<ConfigIA> {
  const limpa = limparChaveIA();

  try {
    const { error } = await supabase
      .from("group_settings")
      .update({
        ia_ativada: false,
        ia_api_key: null,
        atualizado_em: new Date().toISOString(),
      })
      .eq("group_id", groupId);

    if (error) {
      await supabase
        .from("products")
        .delete()
        .eq("group_id", groupId)
        .eq("codigo_barras", CODIGO_BARRAS_CONFIG_IA);
    } else {
      await supabase
        .from("products")
        .delete()
        .eq("group_id", groupId)
        .eq("codigo_barras", CODIGO_BARRAS_CONFIG_IA);
    }
  } catch {
    // Silencioso caso esteja sem rede
  }

  return limpa;
}

/**
 * Indica se a IA está ligada e possui chave preenchida
 */
export function temIAConfigurada(config?: ConfigIA): boolean {
  const cfg = config || lerConfigIA();
  return Boolean(cfg.ativada && cfg.apiKey.trim().length >= 15);
}

/**
 * Mascara a chave para exibição segura na interface (ex.: AIza•••••9xYz)
 */
export function mascararChaveIA(chave: string): string {
  const limpa = (chave || "").trim();
  if (!limpa) return "";
  if (limpa.length <= 10) return "••••••••";
  return `${limpa.slice(0, 4)}•••••${limpa.slice(-4)}`;
}
