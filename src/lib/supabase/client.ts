import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

/** Cliente de Supabase para componentes de navegador (singleton). */
export function supabaseNavegador(): SupabaseClient {
  if (!cliente) {
    cliente = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return cliente;
}
