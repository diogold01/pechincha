import { NextRequest, NextResponse } from "next/server";
import { normalizarModeloIA } from "@/lib/ia-config";

export const dynamic = "force-dynamic";

function traduzirErroGemini(status: number, detalhe?: string): string {
  const msg = (detalhe || "").toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    msg.includes("api key not valid") ||
    msg.includes("api_key_invalid")
  ) {
    return "A chave da IA é inválida ou foi revogada. Confira em Mais → IA para Cupons.";
  }
  if (status === 404 || msg.includes("not found") || msg.includes("is not supported")) {
    return "O modelo selecionado não está disponível para esta chave. Troque o modelo em Mais.";
  }
  if (
    status === 429 ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("resource_exhausted")
  ) {
    return "Limite gratuito da chave atingido no momento. Tente novamente em instantes.";
  }
  if (status >= 500) {
    return "O Google AI Studio está temporariamente indisponível. Tente novamente em instantes.";
  }
  return "Não foi possível consultar a IA agora.";
}

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

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-gemini-api-key")?.trim() || "";
    if (apiKey.length < 15) {
      return NextResponse.json(
        { erro: "Configure sua chave gratuita do Google AI Studio em Mais para usar o assistente." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const acao = body?.acao as string | undefined;
    const modelo = normalizarModeloIA(body?.modelo);
    const contexto = body?.contexto || {};

    const contextoJson = JSON.stringify(contexto).slice(0, 12000);

    if (acao === "resumo") {
      const prompt = `Você é um consultor financeiro doméstico brasileiro, direto, prático e acolhedor, dentro do app Pechincha.
Analise os dados reais de compras de supermercado abaixo (valores em R$, formato brasileiro) e gere:
1) Um resumoCurto de 1 frase direta sobre o mês.
2) De 3 a 4 destaques práticos (tipo: "alerta", "economia" ou "dica"), cada um com título curto (até 5 palavras) e texto objetivo (1 a 2 frases) citando números reais dos dados.

Regras:
- Nunca invente dados que não estejam no JSON.
- Use português do Brasil simples, sem jargões técnicos.
- Formate valores como R$ 123,45.

Dados do mês:
${contextoJson}`;

      const responseSchema = {
        type: "OBJECT",
        properties: {
          resumoCurto: { type: "STRING" },
          destaques: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                tipo: { type: "STRING", enum: ["alerta", "economia", "dica"] },
                titulo: { type: "STRING" },
                texto: { type: "STRING" },
              },
              required: ["tipo", "titulo", "texto"],
            },
          },
        },
        required: ["resumoCurto", "destaques"],
      };

      const res = await chamarGemini(apiKey, modelo, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema,
          temperature: 0.3,
        },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return NextResponse.json(
          { erro: traduzirErroGemini(res.status, errJson?.error?.message) },
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

      const parsed = JSON.parse(jsonLimpo);
      return NextResponse.json({
        ok: true,
        resumoCurto: parsed.resumoCurto || "",
        destaques: Array.isArray(parsed.destaques) ? parsed.destaques.slice(0, 4) : [],
      });
    }

    if (acao === "perguntar") {
      const pergunta = typeof body?.pergunta === "string" ? body.pergunta.trim() : "";
      if (!pergunta) {
        return NextResponse.json(
          { erro: "Digite uma pergunta para consultar seus gastos." },
          { status: 400 }
        );
      }

      const prompt = `Você é o assistente financeiro do app Pechincha. Responda à pergunta do usuário usando APENAS os dados reais fornecidos abaixo.
Regras:
- Seja direto e conciso (máximo 4 linhas).
- Use português do Brasil simples e valores no formato R$ 123,45.
- Se a informação não estiver nos dados, diga isso de forma clara e curta.

Dados do grupo:
${contextoJson}

Pergunta do usuário:
${pergunta}`;

      const res = await chamarGemini(apiKey, modelo, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 400,
        },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return NextResponse.json(
          { erro: traduzirErroGemini(res.status, errJson?.error?.message) },
          { status: res.status >= 400 && res.status < 500 ? 400 : 502 }
        );
      }

      const data = await res.json();
      const resposta = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();

      return NextResponse.json({
        ok: true,
        resposta: resposta || "Não consegui gerar uma resposta com os dados atuais.",
      });
    }

    return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
  } catch {
    return NextResponse.json(
      { erro: "Erro inesperado ao consultar a IA. Tente novamente." },
      { status: 500 }
    );
  }
}
