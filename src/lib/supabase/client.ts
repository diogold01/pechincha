import { createBrowserClient } from "@supabase/ssr";

/**
 * Verifica se as variáveis de ambiente do Supabase já foram configuradas no .env.local
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return Boolean(
    url &&
      key &&
      url.startsWith("https://") &&
      url !== "https://seu-projeto.supabase.co" &&
      key !== "sua-chave-anon-publica-aqui"
  );
}

/**
 * Cria o cliente do Supabase para uso em componentes de navegador (Client Components).
 * Utiliza exclusivamente a chave pública (anon key), respeitando o RLS.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
