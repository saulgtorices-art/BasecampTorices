"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import clsx from "clsx";
import Encabezado from "@/components/Encabezado";
import NuevaTarea from "@/components/NuevaTarea";
import TablaTareas from "@/components/tabla/TablaTareas";
import Kanban from "@/components/kanban/Kanban";
import BarraFiltros from "@/components/filtros/BarraFiltros";
import { useTareasFiltradas } from "@/components/filtros/useTareasFiltradas";
import { useDatos } from "@/components/datos/DatosProvider";
import { estaVencida } from "@/lib/ui";
import type { Tarea } from "@/types/db";

function Contenido() {
  const { yo } = useDatos();
  const [vista, setVista] = useState<"tabla" | "kanban">("tabla");
  const mias = useCallback((t: Tarea) => t.responsable_id === yo.id, [yo.id]);
  const tareas = useTareasFiltradas(mias);
  const base = useMemo(() => ({ responsable_id: yo.id }), [yo.id]);

  const pendientes = tareas.filter((t) => t.estatus !== "Terminado").length;
  const vencidas = tareas.filter(estaVencida).length;

  return (
    <>
      <Encabezado
        titulo="Mis tareas"
        subtitulo={`${pendientes} pendientes${vencidas ? ` · ${vencidas} vencidas` : ""}`}
      >
        <div className="flex rounded-md border border-slate-300 p-0.5 text-sm">
          {(["tabla", "kanban"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={clsx(
                "rounded px-3 py-1 capitalize",
                vista === v ? "bg-marca-600 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <NuevaTarea responsableInicial={yo.id} />
      </Encabezado>
      <BarraFiltros ocultar={vista === "kanban" ? ["responsable", "estatus"] : ["responsable"]} />
      {vista === "tabla" ? (
        <TablaTareas tareas={tareas} agruparPor="cliente" baseNueva={base} />
      ) : (
        <Kanban tareas={tareas} />
      )}
    </>
  );
}

export default function MisTareasPage() {
  return (
    <Suspense>
      <Contenido />
    </Suspense>
  );
}
