/**
 * Parser para Cupons Fiscais Eletrônicos (NFC-e / SAT / Danfe)
 * Processa dados obtidos via QR Code (SEFAZ), arquivos PDF e texto colado.
 */

export interface ItemCupomFiscal {
  id_temp: string;
  descricao: string;
  codigo?: string;
  quantidade: number;
  unidade: string;
  valor_unitario: number;
  valor_total: number;
  marca_extraida?: string;
  descartar?: boolean;
}

export interface DadosCupomFiscal {
  mercado_nome?: string;
  mercado_cnpj?: string;
  data_emissao?: string;
  chave_acesso?: string;
  total_cupom?: number;
  itens: ItemCupomFiscal[];
  aviso?: string;
}

// Lista de marcas comuns de supermercados brasileiros para detecção automática
const MARCAS_COMUNS = [
  "TIO JOAO", "TIO JOÃO", "CAMIL", "DONA BENTA", "RENATA", "BARILLA", "ADRIA", "VILMA",
  "ITALAC", "PIRACANJUBA", "NINHO", "NESTLE", "NESTLÉ", "DANONE", "VIGOR", "BATAVO",
  "ELEFANTE", "POMAROLA", "FUGINI", "HEINZ", "HELLMANNS", "HELLMANN'S", "QUALY", "CLAYBOM", "DELICIA", "DELÍCIA",
  "SADIA", "PERDIGAO", "PERDIGÃO", "SEARA", "AURORA", "SWIFT", "FRIBOI", "MATOBOI",
  "YPE", "YPÊ", "OMO", "BRILHANTE", "ARIEL", "COMFORTO", "DOWNY", "VEJA", "BOMBRIL",
  "COLGATE", "ORAL-B", "SORRISO", "CLOSEUP", "SENSODYNE", "DOVE", "NIVEA", "PALMOLIVE", "REXONA",
  "COCA COLA", "COCA-COLA", "PEPSI", "GUARANA ANTARCTICA", "GUARANÁ", "FANTA", "SPRITE", "SCHWEPPES",
  "AMBEV", "BRAHMA", "SKOL", "HEINEKEN", "AMSTEL", "BUDWEISER", "CORONA", "EISENBAHN",
  "BAUDUCCO", "MARILAN", "M. DIAS BRANCO", "PASSA TEMPO", "TRAKINAS", "NESTLE", "GAROTO", "LACTA",
  "MELITTA", "PILAO", "PILÃO", "3 CORACOES", "3 CORAÇÕES", "SANTA CLARA", "CABOCLO", "NESCAFE", "NESCAFÉ",
  "SUAVINHO", "PINHO SOL", "LIZOFORM", "VANISH", "MINUANO", "LIMPOL", "YOKI", "KITANO", "SAZON", "MAGGI"
];

/**
 * Tenta identificar uma marca conhecida dentro do texto do produto
 */
export function extrairMarcaDoTexto(texto: string): string | undefined {
  if (!texto) return undefined;
  const upper = texto.toUpperCase();

  for (const marca of MARCAS_COMUNS) {
    // Procura a marca como palavra inteira
    const regex = new RegExp(`\\b${marca.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    if (regex.test(upper)) {
      // Normaliza para formato Capitalizado (ex: "Italac")
      return marca
        .toLowerCase()
        .split(" ")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");
    }
  }

  return undefined;
}

/**
 * Normaliza a unidade comercial para o padrão do Pechincha (un, kg, g, L, ml, pct, lata, cx)
 */
export function normalizarUnidade(u: string): string {
  const limpo = (u || "").trim().toUpperCase();
  if (limpo === "KG" || limpo === "KILO" || limpo === "QUILO") return "kg";
  if (limpo === "G" || limpo === "GR" || limpo === "GRAMA" || limpo === "GRAMAS") return "g";
  if (limpo === "L" || limpo === "LT" || limpo === "LITRO" || limpo === "LITROS") return "L";
  if (limpo === "ML") return "ml";
  if (limpo === "PCT" || limpo === "PACOTE" || limpo === "PC") return "pct";
  if (limpo === "LT" || limpo === "LATA") return "lata";
  if (limpo === "CX" || limpo === "CAIXA") return "cx";
  return "un";
}

/**
 * Converte strings monetárias brasileiras (ex: "1.234,56" ou "24,90") para number
 */
export function parseNumeroBR(valor: string | number): number {
  if (typeof valor === "number") return valor;
  if (!valor) return 0;
  const limpo = valor.toString().trim().replace(/R\$\s*/gi, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
}

/**
 * Faz parsing do HTML da página de consulta da SEFAZ (NFC-e padrão nacional Encat / SVRS / SP / MT / etc.)
 */
export function parseCupomHtml(html: string): DadosCupomFiscal {
  const itens: ItemCupomFiscal[] = [];
  let mercadoNome: string | undefined;
  let mercadoCnpj: string | undefined;
  let dataEmissao: string | undefined;
  let totalCupom: number | undefined;

  // 1. Extração dos dados do Mercado (Razão Social e CNPJ)
  // Padrão 1: class="txtTopo" ou "txtRazaoSocial"
  const mNomeMatch = html.match(/<div[^>]*class=["'][^"']*(?:txtTopo|txtRazaoSocial|xNome)[^"']*["'][^>]*>([^<]+)<\/div>/i) ||
                     html.match(/<span[^>]*class=["'][^"']*(?:txtTopo|txtRazaoSocial|xNome)[^"']*["'][^>]*>([^<]+)<\/span>/i);
  if (mNomeMatch && mNomeMatch[1]) {
    mercadoNome = mNomeMatch[1].trim();
  }

  // CNPJ: Procura padrão de CNPJ (XX.XXX.XXX/XXXX-XX)
  const cnpjMatch = html.match(/CNPJ[:\s]*([0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2})/i) ||
                    html.match(/([0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2})/);
  if (cnpjMatch && cnpjMatch[1]) {
    mercadoCnpj = cnpjMatch[1].trim();
  }

  // Data de Emissão: Procura padrão dd/mm/aaaa hh:mm:ss
  const dataMatch = html.match(/(?:Emiss[aã]o|Data)[:\s]*([0-9]{2}\/[0-9]{2}\/[0-9]{4}(?:\s+[0-9]{2}:[0-9]{2}(?::[0-9]{2})?)?)/i) ||
                    html.match(/([0-9]{2}\/[0-9]{2}\/[0-9]{4}\s+[0-9]{2}:[0-9]{2})/);
  if (dataMatch && dataMatch[1]) {
    dataEmissao = dataMatch[1].trim();
  }

  // Total Geral da Nota
  const totalMatch = html.match(/<span[^>]*class=["'][^"']*totalNumb[^"']*["'][^>]*>([^<]+)<\/span>/i) ||
                     html.match(/(?:Valor a pagar|Valor total|Total R\$)[:\s]*<span[^>]*>([^<]+)<\/span>/i) ||
                     html.match(/(?:Valor a pagar|Valor total|Total R\$)[:\s]*R?\$?\s*([0-9]+[.,][0-9]{2})/i);
  if (totalMatch && totalMatch[1]) {
    totalCupom = parseNumeroBR(totalMatch[1]);
  }

  // 2. Extração dos Itens da Tabela
  // Padrão oficial nacional: <tr id="Item + 1"> ... <span class="txtTit">NOME</span> ...
  const trMatches = html.matchAll(/<tr[^>]*id=["']Item\s*\+\s*\d+["'][^>]*>([\s\S]*?)<\/tr>/gi);

  for (const match of trMatches) {
    const trContent = match[1];

    // Nome / Descrição
    const titMatch = trContent.match(/<span[^>]*class=["'][^"']*txtTit[^"']*["'][^>]*>([^<]+)<\/span>/i);
    if (!titMatch || !titMatch[1]) continue;
    const desc = titMatch[1].trim();

    // Código
    const codMatch = trContent.match(/<span[^>]*class=["'][^"']*RCod[^"']*["'][^>]*>[^\d]*(\d+)[^<]*<\/span>/i);
    const codigo = codMatch && codMatch[1] ? codMatch[1].trim() : undefined;

    // Quantidade
    const qtdMatch = trContent.match(/<span[^>]*class=["'][^"']*Rqtd[^"']*["'][^>]*>[^\d]*([0-9]+[.,]?[0-9]*)/i);
    const quantidade = qtdMatch && qtdMatch[1] ? parseNumeroBR(qtdMatch[1]) : 1;

    // Unidade
    const unMatch = trContent.match(/<span[^>]*class=["'][^"']*RUN[^"']*["'][^>]*>(?:UN:\s*)?([^<]+)<\/span>/i);
    const unidade = unMatch && unMatch[1] ? normalizarUnidade(unMatch[1].replace(/UN:\s*/i, "").trim()) : "un";

    // Valor Unitário
    const vlUnitMatch = trContent.match(/<span[^>]*class=["'][^"']*RvlUnit[^"']*["'][^>]*>[^\d]*([0-9]+[.,][0-9]{2})/i);
    const valorUnitario = vlUnitMatch && vlUnitMatch[1] ? parseNumeroBR(vlUnitMatch[1]) : 0;

    // Valor Total
    const vlTotalMatch = trContent.match(/<span[^>]*class=["'][^"']*valor[^"']*["'][^>]*>[^\d]*([0-9]+[.,][0-9]{2})/i);
    const valorTotal = vlTotalMatch && vlTotalMatch[1] ? parseNumeroBR(vlTotalMatch[1]) : valorUnitario * quantidade;

    // Filtro automático de Sacola Plástica
    const ehSacola = /sacola/i.test(desc);

    itens.push({
      id_temp: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      descricao: desc,
      codigo,
      quantidade: quantidade > 0 ? quantidade : 1,
      unidade,
      valor_unitario: valorUnitario > 0 ? valorUnitario : (valorTotal / (quantidade || 1)),
      valor_total: valorTotal,
      marca_extraida: extrairMarcaDoTexto(desc),
      descartar: ehSacola,
    });
  }

  // Se não achou itens pelo padrão <tr>, tenta formato de lista genérica
  if (itens.length === 0) {
    return parseCupomTexto(html.replace(/<[^>]+>/g, " \n "));
  }

  return {
    mercado_nome: mercadoNome,
    mercado_cnpj: mercadoCnpj,
    data_emissao: dataEmissao,
    total_cupom: totalCupom,
    itens,
  };
}

/**
 * Faz parsing de texto puro (extraído de PDF ou colado)
 */
export function parseCupomTexto(textoBruto: string): DadosCupomFiscal {
  const itens: ItemCupomFiscal[] = [];
  let mercadoNome: string | undefined;
  let mercadoCnpj: string | undefined;
  let dataEmissao: string | undefined;
  let totalCupom: number | undefined;

  // Busca CNPJ
  const cnpjMatch = textoBruto.match(/([0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2})/);
  if (cnpjMatch) {
    mercadoCnpj = cnpjMatch[1];
  }

  // Busca Data
  const dataMatch = textoBruto.match(/([0-9]{2}\/[0-9]{2}\/[0-9]{4}(?:\s+[0-9]{2}:[0-9]{2}(?::[0-9]{2})?)?)/);
  if (dataMatch) {
    dataEmissao = dataMatch[1];
  }

  // Busca Total
  const totalMatch = textoBruto.match(/(?:TOTAL|VALOR A PAGAR|TOTAL R\$|TOTAL LIQUIDO)[:\s]*R?\$?\s*([0-9]+[.,][0-9]{2})/i);
  if (totalMatch) {
    totalCupom = parseNumeroBR(totalMatch[1]);
  }

  const linhas = textoBruto.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  // Se a primeira linha tiver cara de nome comercial e não for cabeçalho
  if (linhas.length > 0 && !linhas[0].toLowerCase().includes("danfe") && !linhas[0].toLowerCase().includes("cnpj")) {
    mercadoNome = linhas[0];
  }

  // Regex para linha de produto de cupom fiscal:
  // Ex: "001 7891000100100 ARROZ TIO JOAO 5KG 2 UN X 24,90 49,80"
  // Ou: "ARROZ TIO JOAO 5KG 1 UN 24,90"
  // Ou: "LEITE CONDENSADO 395G ... 4,89"
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];

    // Ignora linhas de rodapé, totais e impostos
    if (
      /^(TOTAL|VALOR|PAGAMENTO|CARTAO|DINHEIRO|TROCO|CHAVE DE ACESSO|PROTOCOLO|EMISSAO|TRIBUTOS|ICMS|PROCON)/i.test(linha)
    ) {
      continue;
    }

    // Tenta casar linha com valores no final: "DESCRIÇÃO ... QTD UN ... VL_UNIT VL_TOTAL"
    // Padrão 1: linha com números decimais no final (ex: "ARROZ 5KG 1 UN 24,90 24,90" ou "ARROZ 5KG 24,90")
    const matchValores = linha.match(/^(.*?)\s+([0-9]+[.,]?[0-9]*)\s*([A-Za-z]{2,3})\s*(?:X|\*|\/)?\s*([0-9]+[.,][0-9]{2})\s+([0-9]+[.,][0-9]{2})$/i) ||
                         linha.match(/^(.*?)\s+([0-9]+[.,][0-9]{2})\s*$/);

    if (matchValores) {
      if (matchValores.length === 6) {
        // Linha completa: Descrição, Qtd, Unidade, VlUnit, VlTotal
        const desc = matchValores[1].replace(/^\d+\s+/, "").trim();
        const qtd = parseNumeroBR(matchValores[2]) || 1;
        const un = normalizarUnidade(matchValores[3]);
        const vlUnit = parseNumeroBR(matchValores[4]);
        const vlTotal = parseNumeroBR(matchValores[5]);

        if (desc.length > 2 && vlUnit > 0) {
          itens.push({
            id_temp: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            descricao: desc,
            quantidade: qtd,
            unidade: un,
            valor_unitario: vlUnit,
            valor_total: vlTotal,
            marca_extraida: extrairMarcaDoTexto(desc),
            descartar: /sacola/i.test(desc),
          });
        }
      } else if (matchValores.length === 3) {
        // Linha simples: Descrição e Preço final
        const desc = matchValores[1].replace(/^\d+\s+/, "").trim();
        const vlTotal = parseNumeroBR(matchValores[2]);

        if (desc.length > 2 && vlTotal > 0) {
          itens.push({
            id_temp: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            descricao: desc,
            quantidade: 1,
            unidade: "un",
            valor_unitario: vlTotal,
            valor_total: vlTotal,
            marca_extraida: extrairMarcaDoTexto(desc),
            descartar: /sacola/i.test(desc),
          });
        }
      }
    }
  }

  return {
    mercado_nome: mercadoNome,
    mercado_cnpj: mercadoCnpj,
    data_emissao: dataEmissao,
    total_cupom: totalCupom,
    itens,
  };
}
