import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Miembro } from "@/types/db";

/** Devuelve el miembro de la sesión actual o redirige a /login. */
export async function miembroActual(): Promise<Miembro> {
  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("miembros")
    .select("*")
    .eq("auth_user_id", user.id)
    .eq("activo", true)
    .maybeSingle();

  if (!data) redirect("/login?error=no-autorizado");
  return data as Miembro;
}
