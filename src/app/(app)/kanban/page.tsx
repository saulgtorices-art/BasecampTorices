"use client";

import { Suspense } from "react";
import Encabezado from "@/components/Encabezado";
import NuevaTarea from "@/components/NuevaTarea";
import Kanban from "@/components/kanban/Kanban";
import BarraFiltros from "@/components/filtros/BarraFiltros";
import { useTareasFiltradas } from "@/components/filtros/useTareasFiltradas";

function Contenido() {
  const tareas = useTareasFiltradas();
  return (
    <>
      <Encabezado titulo="Kanban" subtitulo="Arrastra las tarjetas para cambiar su estatus u orden">
        <NuevaTarea />
      </Encabezado>
      <BarraFiltros ocultar={["estatus"]} />
      <Kanban tareas={tareas} />
    </>
  );
}

export default function KanbanPage() {
  return (
    <Suspense>
      <Contenido />
    </Suspense>
  );
}
