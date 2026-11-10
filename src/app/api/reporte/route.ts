import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { traerTodo } from "@/lib/supabase/traerTodo";

/**
 * Reporte mensual por persona en CSV.
 *   GET /api/reporte?mes=2026-10[&miembro=<id>]
 * Columnas: Persona, Cliente, Tarea, Estatus, Horas, Comentarios.
 * Incluye las tareas asignadas a la persona que caen en el mes (cierre / entrega)
 * y cualquier tarea donde haya registrado tiempo ese mes.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mes = searchParams.get("mes") ?? "";
  const miembro = searchParams.get("miembro");
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: "Parámetro mes inválido (usa AAAA-MM)" }, { status: 400 });
  }

  const supabase = await supabaseServidor();
  const { data: esMiembro } = await supabase.rpc("es_miembro");
  if (!esMiembro) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const [anio, m] = mes.split("-").map(Number);
  const inicioMes = `${mes}-01`;
  const siguiente = m === 12 ? `${anio + 1}-01-01` : `${anio}-${String(m + 1).padStart(2, "0")}-01`;
  // Límites del mes en hora de CDMX (UTC-6, sin horario de verano).
  const desdeTs = `${inicioMes}T00:00:00-06:00`;
  const hastaTs = `${siguiente}T00:00:00-06:00`;

  // Se arma una consulta nueva por página: los builders de Supabase se modifican en sitio.
  const qTareasMes = () => {
    const q = supabase.from("v_tareas_mes").select("tarea_id, responsable_id").eq("mes", inicioMes);
    return miembro ? q.eq("responsable_id", miembro) : q;
  };
  const qRegistros = () => {
    const q = supabase
      .from("registros_tiempo")
      .select("tarea_id, miembro_id, minutos")
      .gte("inicio", desdeTs)
      .lt("inicio", hastaTs)
      .not("minutos", "is", null);
    return miembro ? q.eq("miembro_id", miembro) : q;
  };

  // Paginado: Supabase corta cada respuesta en "Max rows" aunque se pida más.
  const [tareasMes, registros, miembros] = await Promise.all([
    traerTodo<{ tarea_id: string; responsable_id: string | null }>((desde, hasta) =>
      qTareasMes().order("tarea_id").order("responsable_id").range(desde, hasta),
    ),
    traerTodo<{ tarea_id: string; miembro_id: string; minutos: number | null }>((desde, hasta) =>
      qRegistros().order("id").range(desde, hasta),
    ),
    supabase.from("miembros").select("id, nombre"),
  ]);
  const error = tareasMes.error ?? registros.error ?? miembros.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // (persona, tarea) -> minutos
  const filas = new Map<string, { persona: string; tarea: string; minutos: number }>();
  const clave = (p: string, t: string) => `${p}|${t}`;
  for (const t of tareasMes.data ?? []) {
    if (!t.responsable_id) continue;
    filas.set(clave(t.responsable_id, t.tarea_id), { persona: t.responsable_id, tarea: t.tarea_id, minutos: 0 });
  }
  for (const r of registros.data ?? []) {
    const k = clave(r.miembro_id, r.tarea_id);
    const f = filas.get(k) ?? { persona: r.miembro_id, tarea: r.tarea_id, minutos: 0 };
    f.minutos += r.minutos ?? 0;
    filas.set(k, f);
  }

  const idsTareas = [...new Set([...filas.values()].map((f) => f.tarea))];
  const tareas = new Map<string, { titulo: string; estatus: string; comentarios: string | null; cliente: string }>();
  for (let i = 0; i < idsTareas.length; i += 200) {
    const { data, error: e } = await supabase
      .from("tareas")
      .select("id, titulo, estatus, comentarios, clientes(nombre)")
      .in("id", idsTareas.slice(i, i + 200));
    if (e) return NextResponse.json({ error: e.message }, { status: 500 });
    for (const t of data ?? []) {
      const cli = t.clientes as unknown as { nombre: string } | null;
      tareas.set(t.id, { titulo: t.titulo, estatus: t.estatus, comentarios: t.comentarios, cliente: cli?.nombre ?? "" });
    }
  }

  const nombre = new Map((miembros.data ?? []).map((x) => [x.id, x.nombre as string]));
  const lista = [...filas.values()]
    .filter((f) => tareas.has(f.tarea))
    .map((f) => {
      const t = tareas.get(f.tarea)!;
      return {
        persona: nombre.get(f.persona) ?? "",
        cliente: t.cliente,
        tarea: t.titulo,
        estatus: t.estatus,
        horas: (f.minutos / 60).toFixed(2),
        comentarios: t.comentarios ?? "",
      };
    })
    .sort(
      (a, b) =>
        a.persona.localeCompare(b.persona) || a.cliente.localeCompare(b.cliente) || a.tarea.localeCompare(b.tarea),
    );

  const celda = (v: string) => `"${v.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  const lineas = [
    ["Persona", "Cliente", "Tarea", "Estatus", "Horas", "Comentarios"].map(celda).join(","),
    ...lista.map((r) => [r.persona, r.cliente, r.tarea, r.estatus, r.horas, r.comentarios].map(celda).join(",")),
  ];
  // BOM para que Excel abra bien los acentos.
  const csv = "﻿" + lineas.join("\r\n") + "\r\n";

  const sufijo = miembro
    ? "-" +
      (nombre.get(miembro) ?? "persona")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
    : "";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reporte-${mes}${sufijo}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
