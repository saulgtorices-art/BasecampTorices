"use client";

import { useMemo, useState } from "react";
import { Play, Square, Trash2 } from "lucide-react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useDatos } from "@/components/datos/DatosProvider";
import Avatar from "@/components/ui/Avatar";
import { formatoFecha, formatoFechaHora, formatoMinutos, hoyMx } from "@/lib/ui";
import { formatoCronometro, useAhora } from "@/lib/useAhora";
import type { ComentarioTarea, Historial, RegistroTiempo, Tarea } from "@/types/db";
import { useFilasTarea } from "./useFilasTarea";

const ORDEN_ASC = { columna: "created_at", asc: true };
const ORDEN_INICIO = { columna: "inicio", asc: false };
const ORDEN_FECHA = { columna: "fecha", asc: false };

// ===================================================================== Comentarios
export function PestanaComentarios({ tarea }: { tarea: Tarea }) {
  const supabase = supabaseNavegador();
  const { yo, esAdmin, miembroPorId, avisar } = useDatos();
  const { filas, cargando, recargar } = useFilasTarea<ComentarioTarea>(
    "comentarios_tarea",
    tarea.id,
    ORDEN_ASC,
  );
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    const limpio = texto.trim();
    if (!limpio) return;
    setEnviando(true);
    const { error } = await supabase
      .from("comentarios_tarea")
      .insert({ tarea_id: tarea.id, miembro_id: yo.id, texto: limpio });
    setEnviando(false);
    if (error) return avisar(error.message);
    setTexto("");
    recargar();
  }

  async function borrar(id: string) {
    if (!confirm("¿Borrar este comentario?")) return;
    const { error } = await supabase.from("comentarios_tarea").delete().eq("id", id);
    if (error) return avisar(error.message);
    recargar();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-slate-200 p-2 focus-within:border-marca-500">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) enviar();
          }}
          rows={3}
          placeholder="Escribe un comentario… (Ctrl/⌘ + Enter para enviar)"
          className="w-full resize-none text-sm outline-none"
        />
        <div className="flex justify-end">
          <button onClick={enviar} disabled={!texto.trim() || enviando} className="btn-primario py-1">
            Comentar
          </button>
        </div>
      </div>

      {cargando && <p className="text-sm text-slate-400">Cargando…</p>}
      {!cargando && filas.length === 0 && (
        <p className="text-center text-sm text-slate-400">Sin comentarios todavía.</p>
      )}
      <ul className="flex flex-col gap-3">
        {[...filas].reverse().map((c) => {
          const autor = c.miembro_id ? miembroPorId.get(c.miembro_id) : null;
          const puedeBorrar = esAdmin || c.miembro_id === yo.id;
          return (
            <li key={c.id} className="group flex gap-2.5">
              <Avatar nombre={autor?.nombre ?? "?"} tam={28} />
              <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2">
                <div className="mb-0.5 flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{autor?.nombre ?? "—"}</span>
                  <span>{formatoFechaHora(c.created_at)}</span>
                  {puedeBorrar && (
                    <button
                      onClick={() => borrar(c.id)}
                      className="ml-auto text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap break-words">{c.texto}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ========================================================================= Tiempo
export function PestanaTiempo({ tarea }: { tarea: Tarea }) {
  const supabase = supabaseNavegador();
  const { yo, esAdmin, miembroPorId, temporizador, iniciarTemporizador, detenerTemporizador, avisar } =
    useDatos();
  const { filas, recargar } = useFilasTarea<RegistroTiempo>("registros_tiempo", tarea.id, ORDEN_INICIO, {
    recargarCon: temporizador?.id,
  });
  const corriendoAqui = temporizador?.tarea_id === tarea.id;
  const ahora = useAhora(corriendoAqui);

  const [fecha, setFecha] = useState(hoyMx());
  const [horas, setHoras] = useState("");
  const [minutos, setMinutos] = useState("");
  const [nota, setNota] = useState("");

  const totalPorPersona = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const r of filas) if (r.minutos) mapa.set(r.miembro_id, (mapa.get(r.miembro_id) ?? 0) + r.minutos);
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [filas]);
  const total = totalPorPersona.reduce((s, [, m]) => s + m, 0);

  async function capturar(e: React.FormEvent) {
    e.preventDefault();
    const min = (Number(horas) || 0) * 60 + (Number(minutos) || 0);
    if (min <= 0) return avisar("Indica horas o minutos.");
    // Registro manual: inicia a las 09:00 (hora de CDMX) del día elegido y dura `min` minutos.
    const inicio = new Date(`${fecha}T09:00:00-06:00`);
    const fin = new Date(inicio.getTime() + min * 60000);
    const { error } = await supabase.from("registros_tiempo").insert({
      tarea_id: tarea.id,
      miembro_id: yo.id,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      nota: nota.trim() || null,
      manual: true,
    });
    if (error) return avisar(error.message);
    setHoras("");
    setMinutos("");
    setNota("");
    avisar(`Se registraron ${formatoMinutos(min)}`, "ok");
    recargar();
  }

  async function borrar(id: string) {
    if (!confirm("¿Borrar este registro de tiempo?")) return;
    const { error } = await supabase.from("registros_tiempo").delete().eq("id", id);
    if (error) return avisar(error.message);
    recargar();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
        {corriendoAqui ? (
          <>
            <span className="font-mono text-2xl tabular-nums">
              {formatoCronometro(ahora - new Date(temporizador!.inicio).getTime())}
            </span>
            <button onClick={() => detenerTemporizador()} className="btn ml-auto bg-red-500 text-white hover:bg-red-600">
              <Square size={13} fill="currentColor" /> Detener
            </button>
          </>
        ) : (
          <>
            <div className="text-sm text-slate-600">
              {temporizador
                ? "Tienes un temporizador en otra tarea; al iniciar aquí se detendrá."
                : "Registra tu tiempo en esta tarea."}
            </div>
            <button onClick={() => iniciarTemporizador(tarea.id)} className="btn ml-auto bg-green-600 text-white hover:bg-green-700">
              <Play size={13} fill="currentColor" /> Iniciar
            </button>
          </>
        )}
      </div>

      <form onSubmit={capturar} className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 text-sm font-medium">Captura manual</div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="etiqueta">Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo w-40" required />
          </div>
          <div>
            <label className="etiqueta">Horas</label>
            <input type="number" min={0} max={24} value={horas} onChange={(e) => setHoras(e.target.value)} className="campo w-20" />
          </div>
          <div>
            <label className="etiqueta">Minutos</label>
            <input type="number" min={0} max={59} value={minutos} onChange={(e) => setMinutos(e.target.value)} className="campo w-20" />
          </div>
          <div className="min-w-40 flex-1">
            <label className="etiqueta">Nota</label>
            <input value={nota} onChange={(e) => setNota(e.target.value)} className="campo" placeholder="Opcional" />
          </div>
          <button className="btn-primario">Agregar</button>
        </div>
      </form>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-medium">Registros</span>
          <span className="text-sm text-slate-600">
            Total: <b>{formatoMinutos(total)}</b>
          </span>
        </div>
        {totalPorPersona.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {totalPorPersona.map(([id, m]) => (
              <span key={id} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs">
                {miembroPorId.get(id)?.nombre ?? "—"}: {formatoMinutos(m)}
              </span>
            ))}
          </div>
        )}
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {filas.length === 0 && <li className="p-4 text-center text-sm text-slate-400">Sin registros.</li>}
          {filas.map((r) => {
            const quien = miembroPorId.get(r.miembro_id);
            const puede = esAdmin || r.miembro_id === yo.id;
            return (
              <li key={r.id} className="group flex items-center gap-2.5 px-3 py-2 text-sm">
                <Avatar nombre={quien?.nombre} tam={22} />
                <div className="min-w-0 flex-1">
                  <div>
                    <span className="font-medium">{r.fin ? formatoMinutos(r.minutos) : "En curso…"}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      {r.manual ? formatoFecha(r.inicio.slice(0, 10)) + " · manual" : formatoFechaHora(r.inicio)}
                    </span>
                  </div>
                  {r.nota && <div className="truncate text-xs text-slate-500">{r.nota}</div>}
                </div>
                {puede && r.fin && (
                  <button
                    onClick={() => borrar(r.id)}
                    className="text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ====================================================================== Historial
const NOMBRES_CAMPO: Record<string, string> = {
  creada: "creó la tarea",
  titulo: "Título",
  cliente: "Cliente",
  responsable: "Responsable",
  estatus: "Estatus",
  prioridad: "Prioridad",
  qa: "QA",
  fecha_inicio: "Fecha de inicio",
  fecha_entrega: "Fecha de entrega",
  fecha_cierre: "Fecha de cierre",
  comentarios: "Notas",
  documento_url: "Documento",
  proyecto: "Proyecto",
  adjunto: "Archivos",
};

function valorLegible(campo: string, v: string | null) {
  if (v === null || v === "") return "vacío";
  if (campo === "qa") return v === "true" ? "Sí" : "No";
  if (campo.startsWith("fecha_")) return formatoFecha(v);
  return v.length > 80 ? v.slice(0, 80) + "…" : v;
}

export function PestanaHistorial({ tarea }: { tarea: Tarea }) {
  const { miembroPorId } = useDatos();
  // El historial lo escribe un trigger: recargamos cada vez que la tarea cambia.
  const { filas, cargando } = useFilasTarea<Historial>("historial", tarea.id, ORDEN_FECHA, {
    realtime: false,
    recargarCon: tarea.updated_at,
  });

  if (cargando) return <p className="text-sm text-slate-400">Cargando…</p>;

  return (
    <ol className="relative ml-3 border-l border-slate-200">
      {filas.map((h) => {
        const quien = h.miembro_id ? miembroPorId.get(h.miembro_id)?.nombre : "Sistema";
        return (
          <li key={h.id} className="mb-4 ml-4">
            <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-marca-500" />
            <div className="text-xs text-slate-500">{formatoFechaHora(h.fecha)}</div>
            <div className="text-sm">
              <b>{quien ?? "—"}</b>{" "}
              {h.campo === "creada" ? (
                "creó la tarea"
              ) : h.campo === "adjunto" ? (
                h.valor_nuevo ? (
                  <>
                    adjuntó <b>{h.valor_nuevo}</b>
                  </>
                ) : (
                  <>
                    quitó <span className="text-slate-500 line-through">{h.valor_anterior}</span>
                  </>
                )
              ) : (
                <>
                  cambió <b>{NOMBRES_CAMPO[h.campo] ?? h.campo}</b>:{" "}
                  <span className="text-slate-500 line-through">{valorLegible(h.campo, h.valor_anterior)}</span>
                  {" → "}
                  <span>{valorLegible(h.campo, h.valor_nuevo)}</span>
                </>
              )}
            </div>
          </li>
        );
      })}
      {filas.length === 0 && <li className="ml-4 text-sm text-slate-400">Sin cambios registrados.</li>}
    </ol>
  );
}
