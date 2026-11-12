/**
 * Configurações locais da Inteligência Artificial opcional (Google AI Studio / Gemini).
 * A chave fica armazenada apenas no aparelho (localStorage) para manter privacidade
 * entre membros e visitantes, sem exigir alterações no banco de dados.
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

const STORAGE_KEY_IA = "pechincha_ia_config_v1";

const CONFIG_PADRAO: ConfigIA = {
  ativada: false,
  apiKey: "",
  modelo: "gemini-3.8-flash",
};

/**
 * Garante que o identificador do modelo pertence à lista suportada
 */
export function normalizarModeloIA(modelo?: string | null): ModeloIA {
  const achado = MODELOS_IA_DISPONIVEIS.find((m) => m.id === modelo);
  return achado ? achado.id : CONFIG_PADRAO.modelo;
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
