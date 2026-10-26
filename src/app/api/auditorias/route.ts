import { after, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServidor } from "@/lib/supabase/server";
import { ejecutarAuditoria } from "@/lib/auditoria/motor";
import { normalizarUrl, validarUrlPublica } from "@/lib/auditoria/red";

// PageSpeed (móvil + escritorio) y la IA tardan 1–3 min. En Vercel con Fluid
// Compute el límite por defecto es 300 s; after() sigue corriendo después de
// responder hasta ese límite.
export const maxDuration = 300;

/** Una auditoría "en proceso" más vieja que esto se considera abandonada. */
const MINUTOS_ABANDONO = 6;

/**
 * Inicia una auditoría UX/UI.
 *   POST /api/auditorias  { cliente_id, url? }
 * Si no viene url se usa el dominio del cliente. Responde { id } de inmediato
 * y el análisis sigue en segundo plano; el reporte consulta el avance.
 */
export async function POST(request: Request) {
  const supabase = await supabaseServidor();
  const { data: yoId } = await supabase.rpc("miembro_actual_id");
  if (!yoId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const cuerpo = (await request.json().catch(() => ({}))) as { cliente_id?: string; url?: string };
  if (!cuerpo.cliente_id) return NextResponse.json({ error: "Falta cliente_id" }, { status: 400 });

  const { data: cliente } = await supabase.from("clientes").select("id, nombre, dominio").eq("id", cuerpo.cliente_id).maybeSingle();
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const entrada = (cuerpo.url ?? "").trim() || cliente.dominio || "";
  if (!entrada) {
    return NextResponse.json({ error: `«${cliente.nombre}» no tiene dominio. Agrégalo en Clientes o escribe la URL.` }, { status: 400 });
  }

  let url: string;
  try {
    url = normalizarUrl(entrada);
    await validarUrlPublica(new URL(url));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "URL inválida" }, { status: 400 });
  }

  // Evita lanzar dos veces la misma auditoría por doble clic.
  const desde = new Date(Date.now() - MINUTOS_ABANDONO * 60_000).toISOString();
  const { data: enCurso } = await supabase
    .from("auditorias")
    .select("id")
    .eq("cliente_id", cliente.id)
    .eq("url", url)
    .eq("estado", "en_proceso")
    .gte("created_at", desde)
    .limit(1)
    .maybeSingle();
  if (enCurso) return NextResponse.json({ id: enCurso.id, existente: true });

  const { data: nueva, error } = await supabase
    .from("auditorias")
    .insert({ cliente_id: cliente.id, url, creado_por: yoId, progreso: "En cola…" })
    .select("id")
    .single();
  if (error || !nueva) return NextResponse.json({ error: error?.message ?? "No se pudo crear" }, { status: 500 });

  // En segundo plano se escribe con service role (la sesión del usuario puede
  // expirar); si no está configurada, con su propia sesión.
  const db = process.env.SUPABASE_SERVICE_ROLE_KEY ? supabaseAdmin() : supabase;
  after(() => ejecutarAuditoria(db, nueva.id, url));

  return NextResponse.json({ id: nueva.id }, { status: 202 });
}
