import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Rota leve chamada diariamente pelo GitHub Actions para manter o banco
 * gratuito do Supabase ativo (evitando a pausa após 7 dias sem uso).
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("check_registration_status");

    if (error) {
      return NextResponse.json(
        { ok: false, mensagem: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      mensagem: "Supabase ativo",
      status: data,
      verificado_em: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { ok: false, mensagem: "Falha ao consultar o banco." },
      { status: 500 }
    );
  }
}
