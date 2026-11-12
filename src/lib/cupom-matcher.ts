/**
 * Motor de Comparação e Semelhança (Matching) para Cupons Fiscais
 * Cruza itens extraídos de notas fiscais com o catálogo existente do Pechincha.
 */

import type { Product, Sector } from "./types";
import { extrairMarcaDoTexto, type ItemCupomFiscal } from "./cupom-parser";

export interface ResultadoIAItem {
  indice: number;
  nome_limpo: string;
  marca: string;
  setor: string;
}

export interface OpcoesCorrelacaoCupom {
  marcasDoHistorico?: string[];
  analiseIA?: ResultadoIAItem[];
}

export interface SugestaoMatchProduto {
  itemCupom: ItemCupomFiscal;
  produtoSugerido: Product | null;
  scoreSimilaridade: number; // 0 a 100
  ehMesmoProduto: boolean;
  ehAtacado: boolean;
  marcaConfirmada: string;
  setorSugeridoId?: string | null;
  nomeFormatadoNovo: string;
  precoDigitadoTexto?: string;
  origemSugestao?: "ia" | "local";
}

/**
 * Remove acentos, pontuações e converte para minúsculas
 */
export function normalizarTexto(txt: string): string {
  return (txt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calcula a distância de Levenshtein entre duas strings
 */
function calcularLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + custo
      );
    }
  }

  return dp[m][n];
}

/**
 * Calcula score de similaridade (0 a 100) combinando Levenshtein e sobreposição de palavras
 */
export function calcularScoreSimilaridade(str1: string, str2: string): number {
  const s1 = normalizarTexto(str1);
  const s2 = normalizarTexto(str2);

  if (!s1 || !s2) return 0;
  if (s1 === s2) return 100;

  // 1. Similaridade por Levenshtein
  const maxLen = Math.max(s1.length, s2.length);
  const dist = calcularLevenshtein(s1, s2);
  const scoreLev = Math.max(0, (1 - dist / maxLen) * 100);

  // 2. Similaridade por palavras (Token Jaccard)
  const palavras1 = new Set(s1.split(" ").filter((p) => p.length > 1));
  const palavras2 = new Set(s2.split(" ").filter((p) => p.length > 1));

  if (palavras1.size === 0 || palavras2.size === 0) return Math.round(scoreLev);

  let intersecao = 0;
  for (const p of palavras1) {
    if (palavras2.has(p)) intersecao++;
  }

  const uniao = new Set([...palavras1, ...palavras2]).size;
  const scoreTokens = (intersecao / uniao) * 100;

  // Média ponderada (60% tokens, 40% Levenshtein)
  return Math.round(scoreTokens * 0.6 + scoreLev * 0.4);
}

function removerMarcaDoTexto(texto: string, marca?: string): string {
  if (!marca || !marca.trim()) return texto;
  const tokensMarca = normalizarTexto(marca).split(" ").filter(Boolean);
  if (tokensMarca.length === 0) return texto;

  const palavrasOriginais = texto.split(/\s+/).filter(Boolean);
  const palavrasNorm = palavrasOriginais.map((p) => normalizarTexto(p));

  for (let i = 0; i <= palavrasNorm.length - tokensMarca.length; i++) {
    let casou = true;
    for (let j = 0; j < tokensMarca.length; j++) {
      if (palavrasNorm[i + j] !== tokensMarca[j]) {
        casou = false;
        break;
      }
    }
    if (casou) {
      const restantes = [
        ...palavrasOriginais.slice(0, i),
        ...palavrasOriginais.slice(i + tokensMarca.length),
      ];
      // Só remove a marca se sobrar ao menos uma palavra descritiva além de peso/unidade
      const temConteudo = restantes.some(
        (p) => !/^(?:\d+(?:[.,]\d+)?(?:kg|g|gr|l|lt|ml|un|und)?|kg|un|und)$/i.test(p)
      );
      if (temConteudo) {
        return restantes.join(" ");
      }
    }
  }

  return texto;
}

/**
 * Limpa termos fiscais e formata um nome agradável para cadastro novo
 * Ex: "ARROZ TIO JOAO TP1 5KG" -> "Arroz 5kg" (quando a marca Tio João for separada)
 */
export function formatarNomeParaCadastro(
  descBruta: string,
  marcaRemover?: string
): string {
  let limpo = (descBruta || "")
    .replace(/^\d+\s+/, "") // remove códigos no início
    .replace(/\b(?:TP1|TP2|TIPO\s*1|TIPO\s*2|LTDA|ME|EPP)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  limpo = removerMarcaDoTexto(limpo, marcaRemover);

  // Remove unidade solta ao final (ex.: "CHUCHU KG" -> "Chuchu"), mantendo medidas como "5kg"
  const semUnidadeFinal = limpo.replace(/\s+(?:kg|un|und)\.?$/i, "").trim();
  if (semUnidadeFinal.length > 1) {
    limpo = semUnidadeFinal;
  }

  const preposicoes = new Set(["de", "da", "do", "das", "dos", "e", "com", "em"]);

  return limpo
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((p, idx) => {
      if (/^\d+(?:[.,]\d+)?(?:kg|g|l|ml)$/i.test(p)) {
        return p.endsWith("l") && !p.endsWith("ml")
          ? p.slice(0, -1) + "L"
          : p.toLowerCase();
      }
      if (idx > 0 && preposicoes.has(p)) {
        return p;
      }
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(" ");
}

const REGRAS_SETORES: { regex: RegExp; apelidosSetor: string[] }[] = [
  {
    regex:
      /\b(maca|banana|nanica|prata|laranja|limao|taiti|tahiti|tomate|batata|binge|cebola|alho|alface|cenoura|fruta|legume|verdura|chuchu|uva|coco|manga|mamao|abacaxi|melancia|melao|pera|morango|abobrinha|abobora|moranga|pepino|beterraba|mandioca|aipim|macaxeira|inhame|couve|rucula|espinafre|brocolis|repolho|pimentao|quiabo|vagem|berinjela|gengibre|maracuja|goiaba|caqui|kiwi|abacate|tangerina|mexerica|ponkan|bergamota|salsinha|cebolinha|cheiro verde|coentro)\b/i,
    apelidosSetor: [
      "hortifruti",
      "horti fruti",
      "horti",
      "hortalica",
      "feira",
      "fruta",
      "verdura",
      "legume",
      "sacolao",
    ],
  },
  {
    regex:
      /\b(carne|patinho|alcatra|contra|coxao|picanha|frango|peito|sobrecoxa|peixe|tilapia|salmao|costela|bife|coxinha|asa|filezinho|ling|linguica|suina|bov|peixinho|acem|paleta|moida|costelinha|bacon|pernil|file|maminha|cupim|fraldinha)\b/i,
    apelidosSetor: ["acougue", "carne", "peixaria"],
  },
  {
    regex:
      /\b(pao|frances|bisnaga|bisnaguinha|torrada|croissant|bolo|rosca|baguete|panetone|chocotone|broa|sonho|brioche)\b/i,
    apelidosSetor: ["padaria", "panificadora", "paes"],
  },
  {
    regex:
      /\b(leite|queijo|mussarela|mucarela|presunto|mortadela|salame|peito de peru|iogurte|iog|danone|manteiga|margarina|requeijao|parmesao|prato|ricota|nata|creme de leite)\b/i,
    apelidosSetor: ["laticinio", "frios"],
  },
  {
    regex:
      /\b(arroz|feijao|macarrao|espaguete|parafuso|oleo|azeite|farinha|acucar|sal|cafe|molho|shoyu|ketchup|mostarda|maionese|extrato|milho|ervilha|sardinha|atum|oregano|camomila|manjericao|vinagre|tempero|condimento|fermento|biscoito|bolacha|achocolatado|leite condensado|aveia|granola|pipoca)\b/i,
    apelidosSetor: ["mercearia", "alimento", "despensa"],
  },
  {
    regex:
      /\b(refrigerante|suco|cerveja|agua|vodka|vinho|energetico|cha|nectar|coca|pepsi|guarana|refresco)\b/i,
    apelidosSetor: ["bebida"],
  },
  {
    regex:
      /\b(detergente|sabao|amaciante|desinfetante|cloro|agua sanitaria|esponja|vassoura|multiuso|limpador|alcool|alvejante|saco de lixo|papel toalha)\b/i,
    apelidosSetor: ["limpeza", "lavanderia"],
  },
  {
    regex:
      /\b(shampoo|condicionador|sabonete|creme dental|pasta de dente|desodorante|escova|fio dental|hidratante|papel higienico|fralda|absorvente|aparelho barbear)\b/i,
    apelidosSetor: ["higiene", "perfumaria"],
  },
  {
    regex:
      /\b(lasanha|pizza|hamburguer|nuggets|batata palito|sorvete|polpa|congelado|acai|pao de queijo)\b/i,
    apelidosSetor: ["congelado", "sorvete"],
  },
  {
    regex: /\b(racao|pet|gato|cachorro|pedigree|whiskas|areia sanit)\b/i,
    apelidosSetor: ["pet", "animais"],
  },
];

function encontrarSetorEspecifico(nome: string, setores: Sector[]): Sector | null {
  const n = normalizarTexto(nome);
  if (!n) return null;

  for (const r of REGRAS_SETORES) {
    if (r.regex.test(n)) {
      const achado = setores.find((s) => {
        const nomeSetorNorm = normalizarTexto(s.nome);
        return r.apelidosSetor.some((apelido) => nomeSetorNorm.includes(apelido));
      });
      if (achado) return achado;
    }
  }

  return null;
}

function obterSetorFallback(setores: Sector[]): Sector | null {
  return (
    setores.find((s) => normalizarTexto(s.nome).includes("mercearia")) ||
    setores.find((s) => normalizarTexto(s.nome).includes("outros")) ||
    setores[0] ||
    null
  );
}

/**
 * Tenta inferir o setor correto do mercado com base em palavras-chave comuns
 */
export function inferirSetorPorNome(nome: string, setores: Sector[]): Sector | null {
  return encontrarSetorEspecifico(nome, setores) || obterSetorFallback(setores);
}

/**
 * Resolve o setor final combinando a sugestão textual da IA com a inferência local por palavras-chave
 */
export function resolverSetorSugerido(
  setorIA: string | undefined,
  nomesParaFallback: string[],
  setores: Sector[]
): Sector | null {
  const normIA = normalizarTexto(setorIA || "");
  if (normIA) {
    const matchExato = setores.find((s) => normalizarTexto(s.nome) === normIA);
    if (matchExato) return matchExato;

    if (normIA.length >= 3) {
      const matchInclusao = setores.find((s) => {
        const normSetor = normalizarTexto(s.nome);
        return normSetor.includes(normIA) || normIA.includes(normSetor);
      });
      if (matchInclusao) return matchInclusao;
    }
  }

  for (const nome of nomesParaFallback) {
    const especifico = encontrarSetorEspecifico(nome, setores);
    if (especifico) return especifico;
  }

  return obterSetorFallback(setores);
}

/**
 * Cruza a lista de itens do cupom com os produtos cadastrados no banco,
 * aceitando opcionalmente o resultado da IA e marcas do histórico do grupo.
 */
export function correlacionarItensCupom(
  itensCupom: ItemCupomFiscal[],
  produtosCadastrados: Product[],
  setores: Sector[],
  opcoes?: OpcoesCorrelacaoCupom | string[]
): SugestaoMatchProduto[] {
  const marcasDoHistorico = Array.isArray(opcoes)
    ? opcoes
    : opcoes?.marcasDoHistorico || [];
  const analiseIA = Array.isArray(opcoes) ? [] : opcoes?.analiseIA || [];

  const analisePorIndice = new Map<number, ResultadoIAItem>();
  for (const reg of analiseIA) {
    if (typeof reg?.indice === "number") {
      analisePorIndice.set(reg.indice, reg);
    }
  }

  return itensCupom.map((item, idx) => {
    const itemIA = analisePorIndice.get(idx);

    // 1. Marca e nome limpo (IA tem prioridade; Plano B usa histórico do grupo + lista ampliada)
    const marcaLocal =
      extrairMarcaDoTexto(item.descricao, marcasDoHistorico) ||
      item.marca_extraida ||
      "";
    const marcaFinal = itemIA
      ? (itemIA.marca || "").trim()
      : marcaLocal;

    const nomeLimpoFinal =
      itemIA?.nome_limpo && itemIA.nome_limpo.trim().length > 1
        ? itemIA.nome_limpo.trim()
        : formatarNomeParaCadastro(item.descricao, marcaFinal);

    // 2. Compara catálogo usando tanto a descrição original da nota quanto o nome limpo
    let melhorProduto: Product | null = null;
    let maiorScore = 0;

    for (const prod of produtosCadastrados) {
      if (item.codigo && prod.codigo_barras && item.codigo === prod.codigo_barras) {
        melhorProduto = prod;
        maiorScore = 100;
        break;
      }

      const scoreOriginal = calcularScoreSimilaridade(item.descricao, prod.nome);
      const scoreLimpo =
        nomeLimpoFinal && nomeLimpoFinal !== item.descricao
          ? calcularScoreSimilaridade(nomeLimpoFinal, prod.nome)
          : 0;
      const score = Math.max(scoreOriginal, scoreLimpo);

      if (score > maiorScore) {
        maiorScore = score;
        melhorProduto = prod;
      }
    }

    const ehMesmo = maiorScore >= 65 && melhorProduto !== null;

    // 3. Resolve o setor (mantém o setor atual se já existe no catálogo)
    const setorResolvido = resolverSetorSugerido(
      itemIA?.setor,
      [nomeLimpoFinal, item.descricao],
      setores
    );

    return {
      itemCupom: item,
      produtoSugerido: ehMesmo ? melhorProduto : null,
      scoreSimilaridade: maiorScore,
      ehMesmoProduto: ehMesmo,
      ehAtacado: Boolean(item.eh_atacado),
      marcaConfirmada: marcaFinal,
      setorSugeridoId:
        ehMesmo && melhorProduto
          ? melhorProduto.sector_id
          : setorResolvido?.id || null,
      nomeFormatadoNovo: nomeLimpoFinal,
      precoDigitadoTexto:
        item.valor_unitario > 0
          ? item.valor_unitario.toFixed(2).replace(".", ",")
          : "",
      origemSugestao: itemIA ? "ia" : "local",
    };
  });
}
