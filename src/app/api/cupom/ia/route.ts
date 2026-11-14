import { NextRequest, NextResponse } from "next/server";
import { normalizarModeloIA } from "@/lib/ia-config";

export const dynamic = "force-dynamic";

export interface ItemAnalisadoIA {
  indice: number;
  nome_limpo: string;
  marca: string;
  setor: string;
  emoji?: string;
}

export interface ProdutoCatalogoFormatadoIA {
  indice: number;
  nome_sugerido: string;
  marca_removida: string;
  setor_sugerido: string;
  emoji_sugerido: string;
}

/**
 * Converte códigos de erro da API do Google AI Studio em mensagens simples em português
 */
function traduzirErroGemini(status: number, detalhe?: string): string {
  const msg = (detalhe || "").toLowerCase();

  if (status === 401 || status === 403 || msg.includes("api key not valid") || msg.includes("api_key_invalid")) {
    return "A chave informada é inválida ou foi revogada. Confira se copiou a chave completa do Google AI Studio.";
  }
  if (status === 404 || msg.includes("not found") || msg.includes("is not supported")) {
    return "O modelo selecionado não está disponível para esta chave no momento. Experimente outro modelo.";
  }
  if (status === 429 || msg.includes("quota") || msg.includes("rate limit") || msg.includes("resource_exhausted")) {
    return "O limite gratuito da sua chave foi atingido no momento. Aguarde alguns instantes ou continue usando sem IA.";
  }
  if (status >= 500) {
    return "O servidor do Google AI Studio está temporariamente indisponível. Tente novamente em instantes.";
  }
  return "Não foi possível consultar o Google AI Studio com esta chave.";
}

/**
 * Executa chamada segura à API REST do Google Gemini sem gravar a chave em lugar nenhum
 */
async function chamarGemini(
  apiKey: string,
  modelo: string,
  payload: Record<string, unknown>
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`;

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
}

/**
 * Converte resposta não-OK do Gemini em NextResponse padronizado em português
 */
async function criarErroRespostaGemini(res: Response) {
  const errJson = await res.json().catch(() => ({}));
  const errMsg = errJson?.error?.message || "";
  return NextResponse.json(
    { erro: traduzirErroGemini(res.status, errMsg) },
    { status: res.status >= 400 && res.status < 500 ? 400 : 502 }
  );
}

/**
 * Executa prompt com saída JSON estruturada no Gemini e devolve o objeto parseado ou uma resposta de erro
 */
async function executarJsonEstruturadoGemini<T>(
  apiKey: string,
  modelo: string,
  prompt: string,
  responseSchema: Record<string, unknown>
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const res = await chamarGemini(apiKey, modelo, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.1,
    },
  });

  if (!res.ok) {
    return { ok: false, response: await criarErroRespostaGemini(res) };
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const jsonLimpo = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return { ok: true, data: JSON.parse(jsonLimpo) as T };
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-gemini-api-key")?.trim() || "";
    if (apiKey.length < 15) {
      return NextResponse.json(
        { erro: "Informe uma chave válida do Google AI Studio para usar a IA." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const acao = body?.acao as string | undefined;
    const modelo = normalizarModeloIA(body?.modelo);

    // 1. Teste rápido da chave
    if (acao === "testar") {
      const res = await chamarGemini(apiKey, modelo, {
        contents: [
          {
            parts: [{ text: "Responda apenas com a palavra OK." }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 10,
          temperature: 0,
        },
      });

      if (!res.ok) {
        return criarErroRespostaGemini(res);
      }

      return NextResponse.json({
        ok: true,
        modelo,
        mensagem: "Chave validada com sucesso no Google AI Studio!",
      });
    }

    // 2. Análise e limpeza de nomes/marcas/setores dos itens do cupom
    if (acao === "analisar") {
      const itensBrutos = Array.isArray(body?.itens)
        ? body.itens
            .slice(0, 120)
            .map((t: unknown) => (typeof t === "string" ? t.trim() : ""))
        : [];

      if (itensBrutos.length === 0 || itensBrutos.every((t: string) => !t)) {
        return NextResponse.json(
          { erro: "Nenhum item enviado para análise." },
          { status: 400 }
        );
      }

      const setoresDisponiveis = Array.isArray(body?.setores)
        ? body.setores
            .slice(0, 40)
            .map((s: unknown) => (typeof s === "string" ? s.trim() : ""))
            .filter(Boolean)
        : [];

      const listaNumerada = itensBrutos
        .map((desc: string, idx: number) => `${idx}: ${desc}`)
        .join("\n");

      const prompt = [
        "Você organiza compras de supermercado brasileiro a partir de descrições abreviadas de cupom fiscal.",
        "Para cada item numerado, retorne no JSON exatamente o mesmo 'indice' e preencha:",
        "- nome_limpo: nome comercial claro em português do Brasil, sem códigos e removendo a marca (se houver marca identificada), mantendo medidas úteis como 160g, 2L ou 800g quando ajudarem a diferenciar o produto. Exemplos: 'PAO FRANCES MARQUESPAN kg' -> 'Pão Francês'; 'IOG DANONE 160G NAT INT' -> 'Iogurte Natural Integral 160g'; 'CARNE BOV PEIXINHO kg' -> 'Carne Bovina Peixinho'; 'LIMAO TAITI kg' -> 'Limão Taiti'.",
        "- marca: apenas o nome da marca capitalizado (ex: 'Marquespan', 'Danone', 'Bello', 'Kinino', 'Perdigão', 'Kodilar', 'Donana', 'Veneza', 'Vitalia'). Retorne string vazia '' se não existir marca ou se a palavra indicar corte, sabor ou variedade (como 'Peixinho', 'Taiti', 'Nanica', 'Bahia', 'Inglesa').",
        setoresDisponiveis.length > 0
          ? `- setor: escolha exatamente um dos nomes da lista de setores disponíveis (${setoresDisponiveis.join(", ")}), ou '' se nenhum combinar.`
          : "- setor: sugira um setor comum de mercado (Hortifruti, Açougue, Padaria, Laticínios, Mercearia, Bebidas, Limpeza, Higiene, Congelados, Pet).",
        "- emoji: um único emoji específico que represente bem o produto (ex: '🥖' para Pão Francês, '🥩' para Carne, '🍋' para Limão, '🧻' para Papel Higiênico, '🐶' para Ração, '🍝' para Lasanha).",
        "",
        "Itens:",
        listaNumerada,
      ].join("\n");

      const resultado = await executarJsonEstruturadoGemini<{
        itens?: ItemAnalisadoIA[];
      }>(apiKey, modelo, prompt, {
        type: "OBJECT",
        properties: {
          itens: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                indice: { type: "INTEGER" },
                nome_limpo: { type: "STRING" },
                marca: { type: "STRING" },
                setor: { type: "STRING" },
                emoji: { type: "STRING" },
              },
              required: ["indice", "nome_limpo", "marca", "setor", "emoji"],
            },
          },
        },
        required: ["itens"],
      });

      if (!resultado.ok) {
        return resultado.response;
      }

      const itensAnalisados = Array.isArray(resultado.data?.itens)
        ? resultado.data.itens
        : [];

      return NextResponse.json({
        ok: true,
        modelo,
        itens: itensAnalisados,
      });
    }

    // 3. Padronização em lote dos produtos já cadastrados no catálogo
    if (acao === "formatar_catalogo") {
      const produtosEntrada = Array.isArray(body?.produtos)
        ? body.produtos
            .slice(0, 50)
            .map((p: any, i: number) => ({
              indice: typeof p?.indice === "number" ? p.indice : i,
              nome: typeof p?.nome === "string" ? p.nome.trim() : "",
              setor_atual:
                typeof p?.setor_atual === "string" ? p.setor_atual.trim() : "",
              emoji_atual:
                typeof p?.emoji_atual === "string" ? p.emoji_atual.trim() : "",
            }))
            .filter((p: { nome: string }) => p.nome.length > 0)
        : [];

      if (produtosEntrada.length === 0) {
        return NextResponse.json(
          { erro: "Nenhum produto enviado para formatação." },
          { status: 400 }
        );
      }

      const setoresDisponiveis = Array.isArray(body?.setores)
        ? body.setores
            .slice(0, 40)
            .map((s: unknown) => (typeof s === "string" ? s.trim() : ""))
            .filter(Boolean)
        : [];

      const marcasConhecidas = Array.isArray(body?.marcas_conhecidas)
        ? body.marcas_conhecidas
            .slice(0, 150)
            .map((m: unknown) => (typeof m === "string" ? m.trim() : ""))
            .filter(Boolean)
        : [];

      const listaProdutos = produtosEntrada
        .map(
          (p: {
            indice: number;
            nome: string;
            setor_atual: string;
            emoji_atual: string;
          }) =>
            `${p.indice}: ${p.nome}${p.setor_atual ? ` [setor atual: ${p.setor_atual}]` : ""}${
              p.emoji_atual ? ` [emoji atual: ${p.emoji_atual}]` : ""
            }`
        )
        .join("\n");

      const prompt = [
        "Você padroniza o catálogo de produtos de um supermercado brasileiro.",
        "Para cada produto numerado, retorne no JSON exatamente o mesmo 'indice' e preencha:",
        "- nome_sugerido: nome limpo, natural e padronizado em português do Brasil (Title Case, acentuação correta, sem abreviações feias, sem códigos e REMOVENDO qualquer marca do nome). Remova unidade solta no final ('kg', 'un', 'pc', 'cx', 'lt'), mas preserve medidas úteis da embalagem como '800g', '400g', '2L', '500ml', e preserve cortes/variedades/sabores que definem o produto (ex: 'Peixinho', 'Taiti', 'Nanica', 'Inglesa', 'Mussarela', 'Integral', 'Zero Lactose'). Exemplos: 'PAO FRANCES MARQUESPAN kg' -> 'Pão Francês'; 'FILEZINHO FRANGO BELLO 800G' -> 'Filezinho de Frango 800g'; 'PANETONE VENEZA 400G C/GOTAS CHOC' -> 'Panetone com Gotas de Chocolate 400g'; 'PAPEL HIG ATUALLE 12>20M FOLHA DUPLA NEUTRO' -> 'Papel Higiênico Folha Dupla Neutro 12 rolos'.",
        "- marca_removida: se você removeu alguma marca que estava dentro do nome, informe essa marca capitalizada (ex: 'Marquespan', 'Bello', 'Veneza', 'Atualle'). Se não havia marca no nome, retorne ''.",
        marcasConhecidas.length > 0
          ? `Marcas já usadas neste catálogo (ajuda a identificar marcas a remover): ${marcasConhecidas.join(", ")}.`
          : "",
        setoresDisponiveis.length > 0
          ? `- setor_sugerido: escolha exatamente um dos setores disponíveis (${setoresDisponiveis.join(", ")}), mantendo o setor atual caso ele já faça sentido.`
          : "- setor_sugerido: sugira um setor comum brasileiro (Hortifruti, Açougue, Padaria, Laticínios, Mercearia, Bebidas, Limpeza, Higiene, Congelados, Pet).",
        "- emoji_sugerido: um único emoji específico e expressivo que represente o produto (ex: '🥖', '🍗', '🍋', '🧻', '🐶', '🥩'). Nunca use '📦'. Se o emoji atual já for específico e ótimo, pode mantê-lo.",
        "",
        "Produtos:",
        listaProdutos,
      ]
        .filter(Boolean)
        .join("\n");

      const resultado = await executarJsonEstruturadoGemini<{
        itens?: ProdutoCatalogoFormatadoIA[];
      }>(apiKey, modelo, prompt, {
        type: "OBJECT",
        properties: {
          itens: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                indice: { type: "INTEGER" },
                nome_sugerido: { type: "STRING" },
                marca_removida: { type: "STRING" },
                setor_sugerido: { type: "STRING" },
                emoji_sugerido: { type: "STRING" },
              },
              required: [
                "indice",
                "nome_sugerido",
                "marca_removida",
                "setor_sugerido",
                "emoji_sugerido",
              ],
            },
          },
        },
        required: ["itens"],
      });

      if (!resultado.ok) {
        return resultado.response;
      }

      const itensFormatados = Array.isArray(resultado.data?.itens)
        ? resultado.data.itens
        : [];

      return NextResponse.json({
        ok: true,
        modelo,
        itens: itensFormatados,
      });
    }

    return NextResponse.json(
      { erro: "Ação de IA inválida." },
      { status: 400 }
    );
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    return NextResponse.json(
      {
        erro: isTimeout
          ? "O Google AI Studio demorou para responder. Continuando com a identificação local."
          : "Não foi possível processar os itens com a IA agora.",
      },
      { status: 500 }
    );
  }
}
