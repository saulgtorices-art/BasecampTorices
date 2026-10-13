import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

/** Regreso de Google: crea la sesión y valida que el correo esté en miembros. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const siguiente = searchParams.get("next") ?? "/";

  if (!code) return NextResponse.redirect(`${origin}/login?error=sin-codigo`);

  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=auth`);

  const { data: esMiembro, error: errorRpc } = await supabase.rpc("vincular_miembro");
  if (errorRpc || !esMiembro) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=no-autorizado`);
  }

  const destino = siguiente.startsWith("/") ? siguiente : "/";
  return NextResponse.redirect(`${origin}${destino}`);
}
