import type { MetodoPreco, Price } from "./types";

// Limites de cor do orçamento (Seção 6 — reservados exclusivamente ao orçamento)
export const LIMITE_ORCAMENTO_ALERTA = 0.8; // 80% -> amarelo
export const LIMITE_ORCAMENTO_ESTOURO = 1.0; // 100% -> vermelho

/**
 * Formata um número para moeda brasileira: R$ 1.234,56
 */
export function formatarMoeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) {
    return "R$ 0,00";
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(valor));
}

/**
 * Formata uma data YYYY-MM-DD ou ISO para dd/mm/aaaa
 */
export function formatarDataBR(dataStr: string | null | undefined): string {
  if (!dataStr) return "";
  const limpa = dataStr.split("T")[0];
  const partes = limpa.split("-");
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  try {
    return new Intl.DateTimeFormat("pt-BR").format(new Date(dataStr));
  } catch {
    return dataStr;
  }
}

/**
 * Formata data curta dd/mm (ex: 14/10)
 */
export function formatarDataCurtaBR(dataStr: string | null | undefined): string {
  const completa = formatarDataBR(dataStr);
  const partes = completa.split("/");
  if (partes.length >= 2) {
    return `${partes[0]}/${partes[1]}`;
  }
  return completa;
}

/**
 * Converte texto digitado com vírgula ou ponto para número positivo
 */
export function parseDecimalBR(texto: string): number {
  if (!texto) return 0;
  const limpo = texto
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = Number.parseFloat(limpo);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Retorna a data de hoje no formato YYYY-MM-DD
 */
export function dataHojeISO(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export interface EstatisticasProduto {
  estimado: number | null;
  mediaPeriodo: number | null;
  ultimo: number | null;
  ultimoData: string | null;
  ultimoMarketId: string | null;
  menor: number | null;
  menorMarketId: string | null;
  maior: number | null;
  desatualizado: boolean;
  usouOutroMercado: boolean;
  usouProdutoGeralSemMarca: boolean;
  precosVarejo: Price[];
  precosAtacado: Price[];
  menorPorMercado: {
    market_id: string;
    ultimoValor: number;
    mediaValor: number;
    menorValor: number;
    dataUltimo: string;
  }[];
  menorPorMarca: {
    marca: string;
    ultimoValor: number;
    mediaValor: number;
    menorValor: number;
  }[];
}

/**
 * Calcula todas as métricas de preço de um produto seguindo as regras da Seção 6:
 * - Preços de atacado NÃO entram na média nem nas estatísticas do varejo (ficam separados).
 * - Filtra pelos últimos N meses (padrão 3). Se não houver no período, usa o último conhecido e marca `desatualizado = true`.
 * - Prioriza preços do mercado selecionado/padrão e da marca escolhida, avisando discretamente quando usa geral.
 */
export function calcularEstatisticasPreco(
  todosPrecosDoProduto: Price[],
  opcoes?: {
    metodo?: MetodoPreco;
    mesesMedia?: number;
    marketIdPreferencial?: string | null;
    marcaPreferencial?: string | null;
  }
): EstatisticasProduto {
  const metodo = opcoes?.metodo || "media";
  const mesesMedia = opcoes?.mesesMedia || 3;
  const marketIdPref = opcoes?.marketIdPreferencial || null;
  const marcaPref = opcoes?.marcaPreferencial?.trim().toLowerCase() || null;

  // Ordena do mais recente para o mais antigo
  const ordenados = [...todosPrecosDoProduto].sort((a, b) => {
    if (b.data !== a.data) return b.data.localeCompare(a.data);
    return b.criado_em.localeCompare(a.criado_em);
  });

  // Separa varejo e atacado (Seção 6: atacado nunca entra na média de varejo)
  const precosVarejo = ordenados.filter((p) => p.tipo === "varejo");
  const precosAtacado = ordenados.filter((p) => p.tipo === "atacado");

  if (precosVarejo.length === 0) {
    return {
      estimado: null,
      mediaPeriodo: null,
      ultimo: null,
      ultimoData: null,
      ultimoMarketId: null,
      menor: null,
      menorMarketId: null,
      maior: null,
      desatualizado: false,
      usouOutroMercado: false,
      usouProdutoGeralSemMarca: false,
      precosVarejo: [],
      precosAtacado,
      menorPorMercado: [],
      menorPorMarca: [],
    };
  }

  // Estatísticas globais de varejo do produto (último, menor e maior de todo o histórico)
  const ultimoRegistro = precosVarejo[0];
  let menorRegistro = precosVarejo[0];
  let maiorValor = Number(precosVarejo[0].valor);

  for (const p of precosVarejo) {
    const val = Number(p.valor);
    if (val < Number(menorRegistro.valor)) {
      menorRegistro = p;
    }
    if (val > maiorValor) {
      maiorValor = val;
    }
  }

  // Data limite dos últimos N meses
  const dataLimite = new Date();
  dataLimite.setMonth(dataLimite.getMonth() - mesesMedia);
  const dataLimiteISO = dataLimite.toISOString().split("T")[0];

  // Filtra por marca se houver marca escolhida
  let baseCalculo = precosVarejo;
  let usouProdutoGeralSemMarca = false;

  if (marcaPref) {
    const daMarca = baseCalculo.filter(
      (p) => (p.marca || "").trim().toLowerCase() === marcaPref
    );
    if (daMarca.length > 0) {
      baseCalculo = daMarca;
    } else {
      usouProdutoGeralSemMarca = true;
    }
  }

  // Prioriza o mesmo mercado se informado
  let usouOutroMercado = false;
  if (marketIdPref) {
    const doMercado = baseCalculo.filter((p) => p.market_id === marketIdPref);
    if (doMercado.length > 0) {
      baseCalculo = doMercado;
    } else {
      usouOutroMercado = true;
    }
  }

  // Filtra pelos últimos N meses
  const noPeriodo = baseCalculo.filter((p) => p.data >= dataLimiteISO);
  let desatualizado = false;
  const listaFinal = noPeriodo.length > 0 ? noPeriodo : baseCalculo;

  if (noPeriodo.length === 0) {
    desatualizado = true;
  }

  const soma = listaFinal.reduce((acc, p) => acc + Number(p.valor), 0);
  const mediaPeriodo = soma / listaFinal.length;
  const ultimoDaLista = Number(listaFinal[0].valor);
  const menorDaLista = Math.min(...listaFinal.map((p) => Number(p.valor)));

  let estimado = mediaPeriodo;
  if (desatualizado) {
    // Se não houver preço no período, usa o último conhecido e marca como desatualizado
    estimado = Number(baseCalculo[0].valor);
  } else if (metodo === "ultimo") {
    estimado = ultimoDaLista;
  } else if (metodo === "menor") {
    estimado = menorDaLista;
  }

  // Agrupamento por mercado para comparação ("onde está mais barato")
  const mapaMercado = new Map<string, Price[]>();
  for (const p of precosVarejo) {
    const atual = mapaMercado.get(p.market_id) || [];
    atual.push(p);
    mapaMercado.set(p.market_id, atual);
  }

  const menorPorMercado = Array.from(mapaMercado.entries())
    .map(([mId, lista]) => {
      const somaM = lista.reduce((a, b) => a + Number(b.valor), 0);
      return {
        market_id: mId,
        ultimoValor: Number(lista[0].valor),
        mediaValor: somaM / lista.length,
        menorValor: Math.min(...lista.map((x) => Number(x.valor))),
        dataUltimo: lista[0].data,
      };
    })
    .sort((a, b) => a.ultimoValor - b.ultimoValor);

  // Agrupamento por marca para comparação entre marcas
  const mapaMarca = new Map<string, Price[]>();
  for (const p of precosVarejo) {
    const nomeMarca = p.marca?.trim();
    if (!nomeMarca) continue;
    const chave = nomeMarca.toLowerCase();
    const atual = mapaMarca.get(chave) || [];
    atual.push(p);
    mapaMarca.set(chave, atual);
  }

  const menorPorMarca = Array.from(mapaMarca.values())
    .map((lista) => {
      const somaMarca = lista.reduce((a, b) => a + Number(b.valor), 0);
      return {
        marca: lista[0].marca!.trim(),
        ultimoValor: Number(lista[0].valor),
        mediaValor: somaMarca / lista.length,
        menorValor: Math.min(...lista.map((x) => Number(x.valor))),
      };
    })
    .sort((a, b) => a.ultimoValor - b.ultimoValor);

  return {
    estimado,
    mediaPeriodo,
    ultimo: Number(ultimoRegistro.valor),
    ultimoData: ultimoRegistro.data,
    ultimoMarketId: ultimoRegistro.market_id,
    menor: Number(menorRegistro.valor),
    menorMarketId: menorRegistro.market_id,
    maior: maiorValor,
    desatualizado,
    usouOutroMercado,
    usouProdutoGeralSemMarca,
    precosVarejo,
    precosAtacado,
    menorPorMercado,
    menorPorMarca,
  };
}

export interface EstimativaItemCarrinho {
  precoUnitarioEstimado: number | null;
  precoVarejoReferencia: number | null;
  subtotalEstimado: number;
  atacadoAplicado: boolean;
  quantidadeMinimaAtacado: number | null;
  economiaAtacadoTotal: number;
  desatualizado: boolean;
  usouOutroMercado: boolean;
  usouProdutoGeralSemMarca: boolean;
  dicaAtacadoDisponivel: {
    quantidadeMinima: number;
    precoAtacado: number;
  } | null;
}

/**
 * Calcula o preço estimado de um item dentro do carrinho (Seção 6):
 * - Respeita o método do grupo (média dos últimos N meses, último ou menor), mercado do carrinho e marca escolhida.
 * - Se a quantidade atingir a quantidade mínima de atacado, aplica o preço de atacado e calcula a economia.
 */
export function calcularEstimativaItemCarrinho(
  precosDoProduto: Price[],
  quantidade: number,
  opcoes?: {
    metodo?: MetodoPreco;
    mesesMedia?: number;
    marketIdCarrinho?: string | null;
    marcaItem?: string | null;
  }
): EstimativaItemCarrinho {
  const stats = calcularEstatisticasPreco(precosDoProduto, {
    metodo: opcoes?.metodo || "media",
    mesesMedia: opcoes?.mesesMedia || 3,
    marketIdPreferencial: opcoes?.marketIdCarrinho || null,
    marcaPreferencial: opcoes?.marcaItem || null,
  });

  const precoVarejo = stats.estimado;
  const marketId = opcoes?.marketIdCarrinho || null;
  const marcaLimpa = opcoes?.marcaItem?.trim().toLowerCase() || null;

  // Filtra preços de atacado priorizando o mercado do carrinho e a marca (se houver)
  let candidatosAtacado = stats.precosAtacado;
  if (marcaLimpa) {
    const daMarca = candidatosAtacado.filter(
      (p) => (p.marca || "").trim().toLowerCase() === marcaLimpa
    );
    if (daMarca.length > 0) candidatosAtacado = daMarca;
  }
  if (marketId) {
    const doMercado = candidatosAtacado.filter((p) => p.market_id === marketId);
    if (doMercado.length > 0) candidatosAtacado = doMercado;
  }

  // Registro de atacado mais recente
  const melhorAtacado = candidatosAtacado[0] || null;
  let dicaAtacadoDisponivel: {
    quantidadeMinima: number;
    precoAtacado: number;
  } | null = null;

  if (melhorAtacado) {
    const qtdMin = Number(melhorAtacado.quantidade_minima) || 2;
    const valAtacado = Number(melhorAtacado.valor);
    dicaAtacadoDisponivel = {
      quantidadeMinima: qtdMin,
      precoAtacado: valAtacado,
    };

    // Verifica se a quantidade atingiu o mínimo do atacado
    if (
      quantidade >= qtdMin &&
      (precoVarejo === null || valAtacado < precoVarejo)
    ) {
      const economiaTotal =
        precoVarejo !== null && precoVarejo > valAtacado
          ? (precoVarejo - valAtacado) * quantidade
          : 0;

      return {
        precoUnitarioEstimado: valAtacado,
        precoVarejoReferencia: precoVarejo,
        subtotalEstimado: valAtacado * quantidade,
        atacadoAplicado: true,
        quantidadeMinimaAtacado: qtdMin,
        economiaAtacadoTotal: economiaTotal,
        desatualizado: stats.desatualizado,
        usouOutroMercado: stats.usouOutroMercado,
        usouProdutoGeralSemMarca: stats.usouProdutoGeralSemMarca,
        dicaAtacadoDisponivel,
      };
    }
  }

  const unitarioFinal = precoVarejo;
  return {
    precoUnitarioEstimado: unitarioFinal,
    precoVarejoReferencia: precoVarejo,
    subtotalEstimado: unitarioFinal !== null ? unitarioFinal * quantidade : 0,
    atacadoAplicado: false,
    quantidadeMinimaAtacado: null,
    economiaAtacadoTotal: 0,
    desatualizado: stats.desatualizado,
    usouOutroMercado: stats.usouOutroMercado,
    usouProdutoGeralSemMarca: stats.usouProdutoGeralSemMarca,
    dicaAtacadoDisponivel,
  };
}

/**
 * Verifica se uma data/hora ISO pertence ao mês atual no fuso horário do grupo
 */
export function pertenceAoMesAtualNoFuso(
  dataIsoOuDate: string | null | undefined,
  fusoHorario: string = "America/Cuiaba"
): boolean {
  if (!dataIsoOuDate) return false;
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      timeZone: fusoHorario || "America/Cuiaba",
    });
    const mesAtual = fmt.format(new Date()); // Ex: "2026-10"
    const dataAlvo = new Date(dataIsoOuDate);
    if (Number.isNaN(dataAlvo.getTime())) return false;
    const mesAlvo = fmt.format(dataAlvo);
    return mesAtual === mesAlvo;
  } catch {
    const hoje = new Date();
    const d = new Date(dataIsoOuDate);
    return (
      d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth()
    );
  }
}
