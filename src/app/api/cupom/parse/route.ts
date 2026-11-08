import { NextRequest, NextResponse } from "next/server";
import { parseCupomHtml, parseCupomTexto } from "@/lib/cupom-parser";
import { extractText, getDocumentProxy } from "unpdf";

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
      let texto = "";

      try {
        const pdf = await getDocumentProxy(new Uint8Array(bytes));
        const extracted = await extractText(pdf, { mergePages: true });
        texto = extracted.text || "";
      } catch (pdfErr: any) {
        console.error("Erro unpdf:", pdfErr);
        return NextResponse.json(
          {
            erro: "Não foi possível extrair o conteúdo deste PDF. Se for uma foto do cupom salva em PDF, tente ler o QR code pela câmera ou enviar uma foto nítida.",
            detalhe: pdfErr.message,
          },
          { status: 422 }
        );
      }

      if (!texto.trim()) {
        return NextResponse.json(
          {
            erro: "O arquivo PDF enviado não contém texto legível (pode ser uma imagem escaneada). Tente apontar a câmera para o QR Code do cupom.",
          },
          { status: 422 }
        );
      }

      // Se o texto do PDF contiver a URL da SEFAZ gravada (comum em consultas impressas)
      let dados = parseCupomTexto(texto);

      if (dados.itens.length === 0) {
        const linkMatch = texto.match(/https?:\/\/[^\s"'<>]+(?:qrcode|nfce|danfe|consulta|sefaz)[^\s"'<>]*/i);
        if (linkMatch) {
          try {
            const sefazRes = await fetch(linkMatch[0], {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              },
              redirect: "follow",
              cache: "no-store",
            });
            if (sefazRes.ok) {
              const html = await sefazRes.text();
              const dadosHtml = parseCupomHtml(html);
              if (dadosHtml.itens.length > 0) {
                dados = dadosHtml;
              }
            }
          } catch {
            // Mantém os dados originais se a chamada falhar
          }
        }
      }

      if (dados.itens.length === 0) {
        return NextResponse.json(
          {
            erro: "Não conseguimos identificar os produtos neste PDF. Certifique-se de que é um comprovante ou Danfe NFC-e com a lista de itens.",
          },
          { status: 422 }
        );
      }

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

        if (dados.itens.length === 0) {
          return NextResponse.json(
            {
              erro: "O portal da SEFAZ abriu, mas não continha a lista legível de produtos. O cupom pode exigir digitação de captcha no site oficial.",
            },
            { status: 422 }
          );
        }

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
      if (dados.itens.length === 0) {
        return NextResponse.json(
          {
            erro: "Nenhum produto identificado no texto colado. Verifique a formatação do cupom.",
          },
          { status: 422 }
        );
      }
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
