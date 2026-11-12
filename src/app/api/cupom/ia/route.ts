import { NextRequest, NextResponse } from "next/server";
import { normalizarModeloIA } from "@/lib/ia-config";

export const dynamic = "force-dynamic";

export interface ItemAnalisadoIA {
  indice: number;
  nome_limpo: string;
  marca: string;
  setor: string;
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
    signal: AbortSignal.timeout(18000),
  });
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
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || "";
        return NextResponse.json(
          { erro: traduzirErroGemini(res.status, errMsg) },
          { status: res.status >= 400 && res.status < 500 ? 400 : 502 }
        );
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
        "",
        "Itens:",
        listaNumerada,
      ].join("\n");

      const res = await chamarGemini(apiKey, modelo, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
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
                  },
                  required: ["indice", "nome_limpo", "marca", "setor"],
                },
              },
            },
            required: ["itens"],
          },
          temperature: 0.1,
        },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || "";
        return NextResponse.json(
          { erro: traduzirErroGemini(res.status, errMsg) },
          { status: res.status >= 400 && res.status < 500 ? 400 : 502 }
        );
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const jsonLimpo = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const parsed = JSON.parse(jsonLimpo) as { itens?: ItemAnalisadoIA[] };
      const itensAnalisados = Array.isArray(parsed?.itens) ? parsed.itens : [];

      return NextResponse.json({
        ok: true,
        modelo,
        itens: itensAnalisados,
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
