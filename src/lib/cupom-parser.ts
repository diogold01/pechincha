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
  valor_original?: number;
  desconto?: number;
  eh_atacado?: boolean;
  marca_extraida?: string;
  descartar?: boolean;
}

export interface DadosCupomFiscal {
  mercado_nome?: string;
  mercado_cnpj?: string;
  data_emissao?: string;
  chave_acesso?: string;
  total_cupom?: number;
  total_bruto?: number;
  total_descontos?: number;
  total_pago?: number;
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
 * Agrupa itens idênticos/repetidos na mesma nota (ex: 3 oréganos de 1 un viram 1 item consolidado de 3 un)
 */
export function agruparItensCupom(itens: ItemCupomFiscal[]): ItemCupomFiscal[] {
  const mapa = new Map<string, ItemCupomFiscal>();

  for (const it of itens) {
    const chave = `${it.descricao.trim().toLowerCase()}_${it.unidade.trim().toLowerCase()}_${it.valor_unitario.toFixed(2)}`;
    if (mapa.has(chave)) {
      const existente = mapa.get(chave)!;
      existente.quantidade = Number((existente.quantidade + it.quantidade).toFixed(3));
      existente.valor_total = Number((existente.valor_total + it.valor_total).toFixed(2));
      if (it.desconto) {
        existente.desconto = Number(((existente.desconto || 0) + it.desconto).toFixed(2));
      }
      if (it.valor_original) {
        existente.valor_original = Number(((existente.valor_original || 0) + it.valor_original).toFixed(2));
      }
      if (it.eh_atacado) {
        existente.eh_atacado = true;
      }
    } else {
      mapa.set(chave, { ...it });
    }
  }

  return Array.from(mapa.values());
}

/**
 * Remove tags HTML e entidades básicas para leitura limpa de trechos de cupom
 */
function limparTrechoHtml(trecho: string): string {
  return trecho
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrai o texto limpo de um span identificado pela classe CSS
 */
function extrairCampoSpan(blocoHtml: string, classeCss: string): string {
  const regex = new RegExp(
    `<span[^>]*class=["'][^"']*\\b${classeCss}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/span>`,
    "i"
  );
  const match = blocoHtml.match(regex);
  return match?.[1] ? limparTrechoHtml(match[1]) : "";
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
  let totalBrutoHtml: number | undefined;
  let totalDescontosHtml: number | undefined;

  const textoLimpoHtml = limparTrechoHtml(html);

  // 1. Extração dos dados do Mercado (Razão Social e CNPJ)
  const mNomeMatch = html.match(/<div[^>]*class=["'][^"']*(?:txtTopo|txtRazaoSocial|xNome)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                     html.match(/<span[^>]*class=["'][^"']*(?:txtTopo|txtRazaoSocial|xNome)[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  if (mNomeMatch && mNomeMatch[1]) {
    mercadoNome = limparTrechoHtml(mNomeMatch[1]);
  }

  // CNPJ: Procura padrão de CNPJ (XX.XXX.XXX/XXXX-XX)
  const cnpjMatch = textoLimpoHtml.match(/CNPJ[:\s]*([0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2})/i) ||
                    textoLimpoHtml.match(/([0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2})/);
  if (cnpjMatch && cnpjMatch[1]) {
    mercadoCnpj = cnpjMatch[1].trim();
  }

  // Data de Emissão: Procura padrão dd/mm/aaaa hh:mm(:ss)
  const dataMatch = textoLimpoHtml.match(/(?:Emiss[aã]o|Data)[:\s]*([0-9]{2}\/[0-9]{2}\/[0-9]{4}(?:\s+[0-9]{2}:[0-9]{2}(?::[0-9]{2})?)?)/i) ||
                    textoLimpoHtml.match(/([0-9]{2}\/[0-9]{2}\/[0-9]{4}\s+[0-9]{2}:[0-9]{2})/);
  if (dataMatch && dataMatch[1]) {
    dataEmissao = dataMatch[1].trim();
  }

  // Total Bruto, Descontos e Valor a Pagar (prioriza rótulos explícitos para não confundir com Qtd. total de itens)
  const regexValorMonetario = "([0-9]+(?:\\.[0-9]{3})*,[0-9]{2}|[0-9]+\\.[0-9]{2})";

  const brutoMatch = textoLimpoHtml.match(
    new RegExp(`Valor\\s+total\\s*(?:R\\$\\s*)?:?\\s*${regexValorMonetario}`, "i")
  );
  if (brutoMatch?.[1]) {
    totalBrutoHtml = parseNumeroBR(brutoMatch[1]);
  }

  const descHtmlMatch = textoLimpoHtml.match(
    new RegExp(`(?:Descontos?|Total\\s+de\\s+Descontos?)\\s*(?:R\\$\\s*)?:?\\s*${regexValorMonetario}`, "i")
  );
  if (descHtmlMatch?.[1]) {
    totalDescontosHtml = parseNumeroBR(descHtmlMatch[1]);
  }

  const pagarMatch = textoLimpoHtml.match(
    new RegExp(`(?:Valor\\s+a\\s+pagar|Valor\\s+pago|Total\\s+l[ií]quido)\\s*(?:R\\$\\s*)?:?\\s*${regexValorMonetario}`, "i")
  );
  if (pagarMatch?.[1]) {
    totalCupom = parseNumeroBR(pagarMatch[1]);
  }

  if (!totalCupom) {
    const txtMax = extrairCampoSpan(html, "txtMax");
    const maxMatch = txtMax.match(new RegExp(regexValorMonetario));
    if (maxMatch?.[1]) {
      totalCupom = parseNumeroBR(maxMatch[1]);
    }
  }

  if (!totalCupom) {
    const spansTotal = html.matchAll(/<span[^>]*class=["'][^"']*\btotalNumb\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi);
    for (const st of spansTotal) {
      const txt = limparTrechoHtml(st[1]);
      // Ignora números inteiros (ex: "20" de Qtd. total de itens), aceita apenas valores monetários com centavos
      const valMatch = txt.match(new RegExp(`^R?\\$?\\s*${regexValorMonetario}$`));
      if (valMatch?.[1]) {
        totalCupom = parseNumeroBR(valMatch[1]);
      }
    }
  }

  if (!totalCupom && totalBrutoHtml) {
    totalCupom = totalBrutoHtml;
  }

  if (!totalDescontosHtml && totalBrutoHtml && totalCupom && totalBrutoHtml > totalCupom) {
    totalDescontosHtml = Number((totalBrutoHtml - totalCupom).toFixed(2));
  }

  // 2. Extração dos Itens da Tabela
  // Padrão oficial nacional: <tr id="Item + 1"> ... <span class="txtTit">NOME</span> ...
  const trMatches = html.matchAll(/<tr[^>]*id=["']Item\s*\+\s*\d+["'][^>]*>([\s\S]*?)<\/tr>/gi);

  for (const match of trMatches) {
    const trContent = match[1];

    // Nome / Descrição
    const desc = extrairCampoSpan(trContent, "txtTit");
    if (!desc) continue;

    // Código
    const codTexto = extrairCampoSpan(trContent, "RCod");
    const codMatch = codTexto.match(/(\d+)/);
    const codigo = codMatch?.[1]?.trim();

    // Quantidade
    const qtdTexto = extrairCampoSpan(trContent, "Rqtd");
    const qtdMatch = qtdTexto.match(/([0-9]+(?:[.,][0-9]+)?)/);
    const quantidade = qtdMatch?.[1] ? parseNumeroBR(qtdMatch[1]) : 1;

    // Unidade (remove tags como <strong>UN: </strong> antes de normalizar)
    const unTexto = extrairCampoSpan(trContent, "RUN")
      .replace(/^UN:\s*/i, "")
      .trim();
    const unidade = unTexto ? normalizarUnidade(unTexto) : "un";

    // Valor Unitário
    const vlUnitTexto = extrairCampoSpan(trContent, "RvlUnit");
    const vlUnitMatch = vlUnitTexto.match(/([0-9]+(?:\.[0-9]{3})*,[0-9]{2,4}|[0-9]+[.,][0-9]{2,4})/);
    const valorUnitario = vlUnitMatch?.[1] ? parseNumeroBR(vlUnitMatch[1]) : 0;

    // Valor Total
    const vlTotalTexto = extrairCampoSpan(trContent, "valor");
    const vlTotalMatch = vlTotalTexto.match(/([0-9]+(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+[.,][0-9]{2})/);
    const valorTotal = vlTotalMatch?.[1] ? parseNumeroBR(vlTotalMatch[1]) : valorUnitario * quantidade;

    // Filtro automático de Sacola Plástica
    const ehSacola = /sacola/i.test(desc);

    itens.push({
      id_temp: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${itens.length}`,
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

  const itensAgrupados = agruparItensCupom(itens);

  return {
    mercado_nome: mercadoNome,
    mercado_cnpj: mercadoCnpj,
    data_emissao: dataEmissao,
    total_cupom: totalCupom,
    total_bruto: totalBrutoHtml,
    total_descontos: totalDescontosHtml,
    total_pago: totalCupom,
    itens: itensAgrupados,
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
  let totalBruto: number | undefined;
  let totalDescontos: number | undefined;
  let totalPago: number | undefined;

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
  const totalMatch =
    textoBruto.match(/(?:VALOR PAGO R\$|VALOR A PAGAR R\$|VALOR A PAGAR|TOTAL R\$|TOTAL LIQUIDO|TOTAL)[:\s]*R?\$?\s*([0-9]+[.,][0-9]{2})/i) ||
    textoBruto.match(/Valor pago R\$:\s*\n?\s*([0-9]+[.,][0-9]{2})/i) ||
    textoBruto.match(/Valor a pagar R\$:\s*\n?\s*([0-9]+[.,][0-9]{2})/i);
  if (totalMatch) {
    totalCupom = parseNumeroBR(totalMatch[1]);
  }

  // Busca Desconto direto
  const descontoMatch =
    textoBruto.match(/(?:Descontos?|Total de Descontos?)[:\s]*R?\$?\s*([0-9]+[.,][0-9]{2})/i) ||
    textoBruto.match(/Descontos R\$:\s*\n?\s*([0-9]+[.,][0-9]{2})/i);
  if (descontoMatch) {
    totalDescontos = parseNumeroBR(descontoMatch[1]);
  }

  // Busca Bloco de Totais SEFAZ MS (onde vem total bruto, desconto e valor a pagar empilhados)
  const regexBlocoTotais = /([0-9]+[.,][0-9]{2})\s*\n\s*([0-9]+[.,][0-9]{2})\s*\n\s*([0-9]+[.,][0-9]{2})\s*\n\s*Valor\s*pago/i;
  const matchBloco = textoBruto.match(regexBlocoTotais);
  if (matchBloco) {
    totalBruto = parseNumeroBR(matchBloco[1]);
    totalDescontos = parseNumeroBR(matchBloco[2]);
    totalPago = parseNumeroBR(matchBloco[3]);
    if (!totalCupom || totalCupom === 0) {
      totalCupom = totalPago;
    }
  }

  const linhas = textoBruto
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Busca Nome do Mercado / Razão Social / Nome Fantasia
  const razaoSocialMatch = textoBruto.match(/(?:Raz[aã]o\s+Social|Nome\s+Fantasia|Emitente)[:\s]+([^\n\r]+)/i);
  if (razaoSocialMatch) {
    mercadoNome = razaoSocialMatch[1].trim();
  } else {
    for (const l of linhas.slice(0, 10)) {
      const lLower = l.toLowerCase();
      if (
        !lLower.includes("governo") &&
        !lLower.includes("secretaria") &&
        !lLower.includes("sefaz") &&
        !lLower.includes("danfe") &&
        !lLower.includes("nfc-e") &&
        !lLower.includes("sat") &&
        !lLower.includes("consulta") &&
        !lLower.includes("imprimir") &&
        !lLower.includes("resumo") &&
        !lLower.includes("visualizar") &&
        !lLower.includes("cnpj") &&
        !lLower.includes("documento auxiliar") &&
        !lLower.includes("via consumidor") &&
        l.length > 3
      ) {
        mercadoNome = l;
        break;
      }
    }
  }

  // Percorre as linhas identificando produtos
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];

    // Padrão de linha de Desconto aplicada pelo caixa / PDV
    // Ex: "DESCONTO -13,10% R$ -0,30 1,99" ou "DESCONTO R$ -2,10 41,37"
    const matchLinhaDesc = linha.match(
      /^DESC(?:ONTO)?(?:\s+-[0-9]+[.,]?[0-9]*%)?\s*(?:R\$\s*)?(-?[0-9]+[.,][0-9]{2})\s+([0-9]+[.,][0-9]{2})$/i
    );
    if (matchLinhaDesc && itens.length > 0) {
      const ultimo = itens[itens.length - 1];
      const descVal = Math.abs(parseNumeroBR(matchLinhaDesc[1]));
      const novoTotal = parseNumeroBR(matchLinhaDesc[2]);

      ultimo.valor_original = ultimo.valor_total;
      ultimo.desconto = descVal;
      ultimo.valor_total = novoTotal;
      ultimo.valor_unitario = Number((novoTotal / (ultimo.quantidade || 1)).toFixed(2));
      ultimo.eh_atacado = true;
      continue;
    }

    // Ignora cabeçalhos, rodapé, totais e impostos
    if (
      /^(TOTAL|VALOR A PAGAR|VALOR PAGO|FORMA DE PAGAMENTO|CARTAO|CARTÃO|DINHEIRO|TROCO|CHAVE DE ACESSO|PROTOCOLO|EMISSAO|EMISSÃO|TRIBUTOS|ICMS|PROCON|CONSULTE PELA|DOCUMENTO AUXILIAR|NFC-E|GOVERNO|SECRETARIA)/i.test(
        linha
      )
    ) {
      continue;
    }

    // Padrão 1: SEFAZ MS / Encat Multi-Linha
    // Ex: "Qtde.:0,83UN: KGVl. Unit.: 3,95" ou "Qtde.:1 UN: UNVl. Unit.: 14,59"
    const matchSefazMs = linha.match(
      /Qtde\.?:?\s*([0-9]+[.,]?[0-9]*)\s*UN:\s*([A-Za-z]+)\s*Vl\.?\s*Unit\.?:?\s*([0-9]+[.,][0-9]{2})/i
    );

    if (matchSefazMs) {
      let desc = "";
      for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
        const lj = linhas[j];
        if (
          !lj.toLowerCase().startsWith("vl. total") &&
          !/^\d+[.,]\d{2}$/.test(lj) &&
          !/^\(?código:?\s*\d*\s*\)?$/i.test(lj) &&
          !/^\d+\s*\)$/.test(lj)
        ) {
          desc = lj;
          break;
        }
      }

      desc = desc
        .replace(/\(Código:[^)]*\)/gi, "")
        .replace(/\(Código:?$/gi, "")
        .replace(/^\d+[\s\.\-]+/, "")
        .trim();

      const qtd = parseNumeroBR(matchSefazMs[1]) || 1;
      const un = normalizarUnidade(matchSefazMs[2] || "un");
      const vlUnit = parseNumeroBR(matchSefazMs[3]);

      let vlTotal = vlUnit * qtd;
      if (i + 1 < linhas.length) {
        if (/^vl\.?\s*total/i.test(linhas[i + 1])) {
          if (i + 2 < linhas.length && /^[0-9]+[.,][0-9]{2}$/.test(linhas[i + 2])) {
            vlTotal = parseNumeroBR(linhas[i + 2]);
            i += 2;
          } else {
            i += 1;
          }
        } else if (/^[0-9]+[.,][0-9]{2}$/.test(linhas[i + 1])) {
          vlTotal = parseNumeroBR(linhas[i + 1]);
          i += 1;
        }
      }

      if (desc.length > 1 && vlUnit > 0) {
        itens.push({
          id_temp: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${itens.length}`,
          descricao: desc,
          quantidade: qtd,
          unidade: un,
          valor_unitario: vlUnit,
          valor_total: vlTotal,
          marca_extraida: extrairMarcaDoTexto(desc),
          descartar: /sacola/i.test(desc),
        });
        continue;
      }
    }

    // Padrão 2: Linha com tabela em pipes (|)
    if (linha.includes("|")) {
      const cols = linha.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
      if (cols.length >= 3) {
        const ultCol = parseNumeroBR(cols[cols.length - 1]);
        const penultCol = parseNumeroBR(cols[cols.length - 2]);
        if (ultCol > 0) {
          const desc = cols.find((c) => c.length > 2 && !/^[0-9.,]+$/.test(c)) || cols[0];
          const un = cols.find((c) => /^(UN|KG|G|L|ML|PCT|CX|LT)$/i.test(c)) || "un";
          const vlUnit = penultCol > 0 ? penultCol : ultCol;

          itens.push({
            id_temp: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${itens.length}`,
            descricao: desc.replace(/^\d+[\s\.\-]+/, "").trim(),
            quantidade: 1,
            unidade: normalizarUnidade(un),
            valor_unitario: vlUnit,
            valor_total: ultCol,
            marca_extraida: extrairMarcaDoTexto(desc),
            descartar: /sacola/i.test(desc),
          });
          continue;
        }
      }
    }

    // Padrão 3: Multi-linha geral de NFC-e
    if (i + 1 < linhas.length) {
      const proxLinha = linhas[i + 1];
      const matchQtdVl =
        proxLinha.match(/(?:Qtde?\.?|Qtd|Quantidade)?[:\s]*([0-9]+[.,]?[0-9]*)\s*(?:UN|Unidade)?[:.\s]*([A-Za-z]{2,3})?\s*(?:X|\*|Vl\.?\s*Unit\.?[:\s]*)?\s*([0-9]+[.,][0-9]{2})\s*(?:Vl\.?\s*Total\.?[:\s]*)?\s*([0-9]+[.,][0-9]{2})$/i) ||
        proxLinha.match(/^([0-9]+[.,]?[0-9]*)\s*([A-Za-z]{2,3})\s*(?:X|\*)\s*([0-9]+[.,][0-9]{2})\s+([0-9]+[.,][0-9]{2})$/i);

      if (
        matchQtdVl &&
        !linha.includes("TOTAL") &&
        !linha.includes("VALOR") &&
        !linha.includes("PAGAMENTO") &&
        !linha.includes("CHAVE")
      ) {
        const desc = linha.replace(/^\d+[\s\.\-]+/, "").trim();
        const qtd = parseNumeroBR(matchQtdVl[1]) || 1;
        const un = normalizarUnidade(matchQtdVl[2] || "un");
        const vlUnit = parseNumeroBR(matchQtdVl[3]);
        const vlTotal = parseNumeroBR(matchQtdVl[4]);

        if (desc.length > 2 && vlUnit > 0) {
          itens.push({
            id_temp: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${itens.length}`,
            descricao: desc,
            quantidade: qtd,
            unidade: un,
            valor_unitario: vlUnit,
            valor_total: vlTotal,
            marca_extraida: extrairMarcaDoTexto(desc),
            descartar: /sacola/i.test(desc),
          });
          i++; // Avança a linha consumida
          continue;
        }
      }
    }

    // Padrão 4: Linha única com valores no final
    // Importante: linha NÃO pode começar com "Qtde" nem "Vl" para não confundir cabeçalhos soltos com descrição
    if (!linha.toLowerCase().startsWith("qtde") && !linha.toLowerCase().startsWith("vl.")) {
      const matchValores =
        linha.match(/^(.*?)\s+([0-9]+[.,]?[0-9]*)\s*([A-Za-z]{2,3})\s*(?:X|\*|\/)?\s*([0-9]+[.,][0-9]{2})\s+([0-9]+[.,][0-9]{2})$/i) ||
        linha.match(/^(.*?)\s+([0-9]+[.,][0-9]{2})\s*$/);

      if (matchValores) {
        if (matchValores.length === 6) {
          const desc = matchValores[1].replace(/^\d+[\s\.\-]+/, "").trim();
          const qtd = parseNumeroBR(matchValores[2]) || 1;
          const un = normalizarUnidade(matchValores[3]);
          const vlUnit = parseNumeroBR(matchValores[4]);
          const vlTotal = parseNumeroBR(matchValores[5]);

          if (desc.length > 2 && vlUnit > 0) {
            itens.push({
              id_temp: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${itens.length}`,
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
          const desc = matchValores[1].replace(/^\d+[\s\.\-]+/, "").trim();
          const vlTotal = parseNumeroBR(matchValores[2]);

          if (desc.length > 2 && vlTotal > 0) {
            itens.push({
              id_temp: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${itens.length}`,
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
  }

  // Se o total_cupom não foi encontrado no cabeçalho/rodapé, calcula a soma dos itens
  if (!totalCupom || totalCupom === 0) {
    totalCupom = itens.reduce((acc, it) => acc + (it.valor_total || 0), 0);
  }

  const itensAgrupados = agruparItensCupom(itens);

  return {
    mercado_nome: mercadoNome,
    mercado_cnpj: mercadoCnpj,
    data_emissao: dataEmissao,
    total_cupom: totalPago || totalCupom,
    total_bruto: totalBruto,
    total_descontos: totalDescontos,
    total_pago: totalPago || totalCupom,
    itens: itensAgrupados,
  };
}
