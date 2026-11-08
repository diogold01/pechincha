import { NextRequest, NextResponse } from "next/server";
import { parseCupomHtml, parseCupomTexto } from "@/lib/cupom-parser";
import { PDFParse } from "pdf-parse";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    // 1. Processamento de Arquivo PDF via FormData
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json(
          { erro: "Nenhum arquivo PDF foi enviado." },
          { status: 400 }
        );
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const parser = new PDFParse({ data: buffer });
      let texto = "";
      try {
        const pdfData = await parser.getText();
        texto = pdfData.text || "";
      } finally {
        await parser.destroy().catch(() => {});
      }

      if (!texto.trim()) {
        return NextResponse.json(
          { erro: "Não foi possível extrair texto legível deste PDF." },
          { status: 422 }
        );
      }

      const dados = parseCupomTexto(texto);
      return NextResponse.json({ dados });
    }

    // 2. Processamento de JSON (URL da SEFAZ ou Texto direto)
    const body = await req.json().catch(() => ({}));
    const { url, texto } = body;

    if (url && typeof url === "string" && url.trim().startsWith("http")) {
      try {
        const response = await fetch(url.trim(), {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          },
          redirect: "follow",
          cache: "no-store",
        });

        if (!response.ok) {
          return NextResponse.json(
            {
              erro: `A SEFAZ retornou status de erro ${response.status}. Verifique o link do cupom.`,
            },
            { status: 502 }
          );
        }

        const html = await response.text();
        const dados = parseCupomHtml(html);

        return NextResponse.json({ dados });
      } catch (fetchErr: any) {
        return NextResponse.json(
          {
            erro:
              "Não foi possível conectar ao servidor da SEFAZ. O portal pode estar temporariamente indisponível.",
            detalhe: fetchErr.message,
          },
          { status: 502 }
        );
      }
    }

    if (texto && typeof texto === "string" && texto.trim().length > 0) {
      const dados = parseCupomTexto(texto);
      return NextResponse.json({ dados });
    }

    return NextResponse.json(
      {
        erro: "Informe uma URL de cupom fiscal válida ou envie um arquivo PDF.",
      },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        erro: "Falha ao processar o cupom fiscal.",
        detalhe: err.message,
      },
      { status: 500 }
    );
  }
}
