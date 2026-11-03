"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, Search, Trash2 } from "lucide-react";
import Encabezado from "@/components/Encabezado";
import { useDatos } from "@/components/datos/DatosProvider";
import Avatar from "@/components/ui/Avatar";
import { supabaseNavegador } from "@/lib/supabase/client";
import { formatoFechaHora, hoyMx } from "@/lib/ui";
import { normalizar } from "@/lib/importacion";
import type { AdjuntoComentario, AdjuntoTarea, ComentarioTarea, Tarea } from "@/types/db";

interface Eliminada {
  id: string;
  titulo: string;
  cliente_id: string | null;
  responsable_id: string | null;
  eliminada_por: string | null;
  eliminada_at: string;
  datos: {
    tarea: Tarea;
    comentarios: ComentarioTarea[];
    adjuntos: AdjuntoTarea[];
    registros: { minutos: number | null }[];
  };
}

/** Rutas de Storage de la tarea (archivos y evidencias de comentarios). */
function rutasDe(e: Eliminada): string[] {
  const archivos = (e.datos.adjuntos ?? []).map((a) => a.ruta).filter((r): r is string => !!r);
  const evidencias = (e.datos.comentarios ?? []).flatMap((c) =>
    ((c.adjuntos ?? []) as AdjuntoComentario[]).map((a) => a.ruta),
  );
  return [...archivos, ...evidencias];
}

export default function PapeleraPage() {
  const supabase = supabaseNavegador();
  const { esAdmin, clientePorId, miembroPorId, abrirTarea, avisar } = useDatos();
  const [lista, setLista] = useState<Eliminada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from("tareas_eliminadas")
      .select("*")
      .order("eliminada_at", { ascending: false })
      .limit(500);
    if (error) avisar(error.message);
    setLista((data as Eliminada[]) ?? []);
    setCargando(false);
  }, [supabase, avisar]);

  useEffect(() => {
    if (esAdmin) cargar();
  }, [esAdmin, cargar]);

  const filtrada = useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return lista;
    return lista.filter((e) =>
      normalizar(
        [
          e.titulo,
          e.cliente_id && clientePorId.get(e.cliente_id)?.nombre,
          e.responsable_id && miembroPorId.get(e.responsable_id)?.nombre,
          e.eliminada_por && miembroPorId.get(e.eliminada_por)?.nombre,
        ].join(" "),
      ).includes(q),
    );
  }, [lista, busqueda, clientePorId, miembroPorId]);

  async function restaurar(e: Eliminada) {
    setOcupado(e.id);
    const { error } = await supabase.rpc("restaurar_tarea", { p_id: e.id });
    setOcupado(null);
    if (error) {
      avisar(error.message);
      return;
    }
    setLista((l) => l.filter((x) => x.id !== e.id));
    avisar(`"${e.titulo}" se restauró con sus comentarios y archivos`, "ok");
    abrirTarea(e.id);
  }

  async function purgar(items: Eliminada[]) {
    const rutas = items.flatMap(rutasDe);
    for (let i = 0; i < rutas.length; i += 100) {
      await supabase.storage.from("adjuntos").remove(rutas.slice(i, i + 100));
    }
    const { error } = await supabase
      .from("tareas_eliminadas")
      .delete()
      .in(
        "id",
        items.map((x) => x.id),
      );
    if (error) {
      avisar(error.message);
      return;
    }
    const ids = new Set(items.map((x) => x.id));
    setLista((l) => l.filter((x) => !ids.has(x.id)));
    avisar(items.length === 1 ? "Eliminada definitivamente" : `${items.length} tareas eliminadas definitivamente`, "ok");
  }

  if (!esAdmin)
    return (
      <>
        <Encabezado titulo="Papelera" />
        <div className="m-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          La papelera es para los líderes de célula (admin).
        </div>
      </>
    );

  const viejas = lista.filter((e) => e.eliminada_at.slice(0, 10) < restarDias(hoyMx(), 30));

  return (
    <>
      <Encabezado
        titulo="Papelera"
        subtitulo="Tareas que alguien borró. Restaurarlas trae de vuelta comentarios, archivos, tiempo e historial."
      >
        {viejas.length > 0 && (
          <button
            className="btn-secundario"
            onClick={() =>
              confirm(`¿Eliminar definitivamente ${viejas.length} tareas con más de 30 días en la papelera?`) &&
              purgar(viejas)
            }
          >
            <Trash2 size={15} /> Vaciar más de 30 días ({viejas.length})
          </button>
        )}
      </Encabezado>
      <div className="max-w-5xl p-4 md:p-6">
        <div className="relative mb-4 max-w-sm">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar tarea, cliente o persona…"
            className="campo pl-9"
          />
        </div>

        {cargando ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : filtrada.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            {lista.length ? "Nada coincide con la búsqueda." : "La papelera está vacía."}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {filtrada.map((e) => {
              const quien = e.eliminada_por ? miembroPorId.get(e.eliminada_por) : null;
              const resp = e.responsable_id ? miembroPorId.get(e.responsable_id) : null;
              const nCom = e.datos.comentarios?.length ?? 0;
              const nArch = e.datos.adjuntos?.length ?? 0;
              const min = (e.datos.registros ?? []).reduce((s, r) => s + (r.minutos ?? 0), 0);
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Avatar nombre={quien?.nombre ?? "—"} foto={quien?.foto_url} tam={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{e.titulo}</div>
                    <div className="text-xs text-slate-500">
                      {(e.cliente_id && clientePorId.get(e.cliente_id)?.nombre) || "Cliente borrado"} ·{" "}
                      {resp?.nombre ?? "Sin responsable"} · {e.datos.tarea?.estatus}
                    </div>
                    <div className="text-xs text-slate-400">
                      Borró <b className="font-medium text-slate-600">{quien?.nombre ?? "—"}</b> el{" "}
                      {formatoFechaHora(e.eliminada_at)}
                      {(nCom > 0 || nArch > 0 || min > 0) &&
                        ` · ${[
                          nCom && `${nCom} comentarios`,
                          nArch && `${nArch} archivos`,
                          min && `${Math.round((min / 60) * 10) / 10} h`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}`}
                    </div>
                  </div>
                  <button className="btn-primario py-1.5" disabled={ocupado === e.id} onClick={() => restaurar(e)}>
                    <RotateCcw size={14} /> {ocupado === e.id ? "Restaurando…" : "Restaurar"}
                  </button>
                  <button
                    title="Eliminar definitivamente"
                    className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() =>
                      confirm(`¿Eliminar "${e.titulo}" definitivamente? Ya no se podrá recuperar.`) && purgar([e])
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function restarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}
