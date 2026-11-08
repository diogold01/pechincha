/**
 * Motor de Comparação e Semelhança (Matching) para Cupons Fiscais
 * Cruza itens extraídos de notas fiscais com o catálogo existente do Pechincha.
 */

import type { Product, Sector } from "./types";
import type { ItemCupomFiscal } from "./cupom-parser";

export interface SugestaoMatchProduto {
  itemCupom: ItemCupomFiscal;
  produtoSugerido: Product | null;
  scoreSimilaridade: number; // 0 a 100
  ehMesmoProduto: boolean;
  marcaConfirmada: string;
  setorSugeridoId?: string | null;
  nomeFormatadoNovo: string;
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

/**
 * Limpa termos fiscais e formata um nome agradável para cadastro novo
 * Ex: "ARROZ TIO JOAO TP1 5KG" -> "Arroz Tio João 5kg"
 */
export function formatarNomeParaCadastro(descBruta: string): string {
  let limpo = descBruta
    .replace(/^\d+\s+/, "") // remove códigos no início
    .replace(/\b(?:TP1|TP2|TIPO\s*1|TIPO\s*2|LTDA|ME|EPP)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Capitaliza cada palavra
  return limpo
    .toLowerCase()
    .split(" ")
    .map((p) => {
      // Mantém medidas como "5kg", "1L", "500ml", "2L" formatadas
      if (/^\d+(?:kg|g|l|ml)$/i.test(p)) {
        return p.toLowerCase();
      }
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(" ");
}

/**
 * Tenta inferir o setor correto do mercado com base em palavras-chave comuns
 */
export function inferirSetorPorNome(nome: string, setores: Sector[]): Sector | null {
  const n = normalizarTexto(nome);

  const regras: { regex: RegExp; nomeSetor: string }[] = [
    { regex: /\b(maca|banana|laranja|limao|tomate|batata|cebola|alho|alface|cenoura|fruta|legume|verdura)\b/i, nomeSetor: "Hortifruti" },
    { regex: /\b(carne|patinho|alcatra|contra|coxao|picanha|frango|peito|sobrecoxa|peixe|tilapia|salmao|costela|bife)\b/i, nomeSetor: "Açougue" },
    { regex: /\b(pao|bisnaga|torrada|croissant|bolo|rosca|baguete)\b/i, nomeSetor: "Padaria" },
    { regex: /\b(leite|queijo|mussarela|presunto|iogurte|manteiga|requeijao|parmesao|prato|ricota|nata)\b/i, nomeSetor: "Laticínios" },
    { regex: /\b(arroz|feijao|macarrao|oleo|azeite|farinha|acucar|sal|cafe|molho|extrato|milho|ervilha|sardinha|atum)\b/i, nomeSetor: "Mercearia" },
    { regex: /\b(refrigerante|suco|cerveja|agua|vodka|vinho|energetico|cha|nectar|coca|pepsi)\b/i, nomeSetor: "Bebidas" },
    { regex: /\b(detergente|sabao|amaciante|desinfetante|cloro|agua sanitaria|esponja|vassoura|multiuso|limpador)\b/i, nomeSetor: "Limpeza" },
    { regex: /\b(shampoo|condicionador|sabonete|creme dental|pasta|desodorante|escova|fio dental|hidratante)\b/i, nomeSetor: "Higiene" },
    { regex: /\b(lasanha|pizza|hamburguer|nuggets|batata palito|sorvete|polpa|congelado)\b/i, nomeSetor: "Congelados" },
    { regex: /\b(racao|pet|gato|cachorro|pedigree|whiskas|areia sanit)\b/i, nomeSetor: "Pet" },
  ];

  for (const r of regras) {
    if (r.regex.test(n)) {
      const achado = setores.find((s) => normalizarTexto(s.nome).includes(normalizarTexto(r.nomeSetor)));
      if (achado) return achado;
    }
  }

  // Setor padrão: Mercearia ou Outros
  return (
    setores.find((s) => normalizarTexto(s.nome).includes("mercearia")) ||
    setores.find((s) => normalizarTexto(s.nome).includes("outros")) ||
    setores[0] ||
    null
  );
}

/**
 * Cruza a lista de itens do cupom com os produtos cadastrados no banco
 */
export function correlacionarItensCupom(
  itensCupom: ItemCupomFiscal[],
  produtosCadastrados: Product[],
  setores: Sector[]
): SugestaoMatchProduto[] {
  return itensCupom.map((item) => {
    let melhorProduto: Product | null = null;
    let maiorScore = 0;

    for (const prod of produtosCadastrados) {
      // 1. Se houver código de barras EAN cadastrado igual
      if (item.codigo && prod.codigo_barras && item.codigo === prod.codigo_barras) {
        melhorProduto = prod;
        maiorScore = 100;
        break;
      }

      // 2. Score por similaridade de nome
      const score = calcularScoreSimilaridade(item.descricao, prod.nome);
      if (score > maiorScore) {
        maiorScore = score;
        melhorProduto = prod;
      }
    }

    // Se o score for acima de 65%, consideramos provável correspondência
    const ehMesmo = maiorScore >= 65 && melhorProduto !== null;

    // Setor sugerido
    const setor = inferirSetorPorNome(item.descricao, setores);

    return {
      itemCupom: item,
      produtoSugerido: ehMesmo ? melhorProduto : null,
      scoreSimilaridade: maiorScore,
      ehMesmoProduto: ehMesmo,
      marcaConfirmada: item.marca_extraida || "",
      setorSugeridoId: ehMesmo && melhorProduto ? melhorProduto.sector_id : (setor?.id || null),
      nomeFormatadoNovo: formatarNomeParaCadastro(item.descricao),
    };
  });
}
