import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** Cliente de Supabase para Server Components, Route Handlers y Server Actions. */
export async function supabaseServidor() {
  const almacen = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (lista) => {
          try {
            lista.forEach(({ name, value, options }) => almacen.set(name, value, options));
          } catch {
            // Llamado desde un Server Component: el middleware refresca la sesión.
          }
        },
      },
    },
  );
}

/**
 * Cliente con SERVICE ROLE (ignora RLS). Solo usar en el servidor y para
 * tareas administrativas puntuales. Nunca exponer al navegador.
 */
export function supabaseAdmin() {
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!llave) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, llave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
