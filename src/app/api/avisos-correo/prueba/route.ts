import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { correoConfigurado, enviarCorreo, plantillaAviso, urlApp } from "@/lib/correo";

export const runtime = "nodejs";

/** Botón "Enviarme un correo de prueba" del Perfil: manda un aviso al usuario actual. */
export async function POST(peticion: Request) {
  const supabase = await supabaseServidor();
  const { data: id } = await supabase.rpc("miembro_actual_id");
  if (!id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!correoConfigurado()) {
    return NextResponse.json(
      { error: "Los correos aún no están configurados (faltan CORREO_USUARIO y CORREO_CONTRASENA en Vercel)." },
      { status: 503 },
    );
  }

  const { data: yo } = await supabase.from("miembros").select("nombre, correo").eq("id", id).single();
  if (!yo) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const base = urlApp(peticion);
  const correo = plantillaAviso({
    para: yo.nombre.split(" ")[0],
    actor: null,
    texto: "Así te van a llegar los avisos de Basecamp por correo. ✅",
    enlace: `${base}/tabla`,
    boton: "Abrir Basecamp",
    ajustes: `${base}/perfil`,
  });
  try {
    await enviarCorreo({ para: yo.correo, ...correo });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo enviar: ${(e as Error).message}` }, { status: 502 });
  }
  return NextResponse.json({ enviado: yo.correo });
}
