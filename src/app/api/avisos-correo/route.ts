import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { correoConfigurado, enviarCorreo, plantillaAviso, urlApp } from "@/lib/correo";

export const runtime = "nodejs";

/**
 * Lo llama la base de datos (trigger `notificaciones_enviar_correo`, vía pg_net)
 * cada vez que se crea una notificación que la persona quiere por correo.
 *   POST { id }  ·  header x-avisos-secreto = AVISOS_CORREO_SECRETO
 */
export async function POST(peticion: Request) {
  const secreto = process.env.AVISOS_CORREO_SECRETO;
  if (!secreto || peticion.headers.get("x-avisos-secreto") !== secreto) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!correoConfigurado()) return NextResponse.json({ omitido: "correo sin configurar" });

  const { id } = (await peticion.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  const db = supabaseAdmin();
  // Se "aparta" antes de enviar para no mandar el mismo correo dos veces.
  const { data: n } = await db
    .from("notificaciones")
    .update({ correo_enviado_at: new Date().toISOString() })
    .eq("id", id)
    .is("correo_enviado_at", null)
    .select("id, miembro_id, actor_id, tarea_id, ticket_id, tipo, texto")
    .maybeSingle();
  if (!n) return NextResponse.json({ omitido: "ya enviado o no existe" });

  const ids = [n.miembro_id, n.actor_id].filter(Boolean) as string[];
  const [{ data: personas }, { data: tarea }, { data: ticket }] = await Promise.all([
    db.from("miembros").select("id, nombre, correo, activo, correo_tipos").in("id", ids),
    n.tarea_id
      ? db.from("tareas").select("titulo, clientes(nombre)").eq("id", n.tarea_id).maybeSingle()
      : Promise.resolve({ data: null }),
    n.ticket_id
      ? db.from("tickets").select("numero").eq("id", n.ticket_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const para = personas?.find((p) => p.id === n.miembro_id);
  const actor = personas?.find((p) => p.id === n.actor_id);
  if (!para?.activo || !para.correo || !(para.correo_tipos ?? []).includes(n.tipo)) {
    return NextResponse.json({ omitido: "la persona no quiere este aviso por correo" });
  }

  const base = urlApp(peticion);
  const enlace = n.ticket_id
    ? `${base}/tickets?ticket=${n.ticket_id}`
    : n.tipo === "eliminada"
      ? `${base}/papelera`
      : n.tarea_id
        ? `${base}/tabla?tarea=${n.tarea_id}`
        : `${base}/tabla`;
  const cliente = (tarea as { clientes?: { nombre?: string } | null } | null)?.clientes?.nombre;
  const correo = plantillaAviso({
    para: para.nombre.split(" ")[0],
    actor: actor?.nombre ?? null,
    texto: n.texto,
    contexto: cliente ? `Cliente: ${cliente}` : ticket ? `Ticket TK-${String(ticket.numero).padStart(4, "0")}` : null,
    enlace,
    boton: n.tipo === "eliminada" ? "Ver la papelera" : n.ticket_id ? "Ver el ticket" : n.tarea_id ? "Abrir la tarea" : "Abrir Basecamp",
    ajustes: `${base}/perfil`,
  });

  try {
    await enviarCorreo({ para: para.correo, ...correo });
  } catch (e) {
    // Se libera para poder reintentar.
    await db.from("notificaciones").update({ correo_enviado_at: null }).eq("id", n.id);
    console.error("avisos-correo", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
  return NextResponse.json({ enviado: true });
}
