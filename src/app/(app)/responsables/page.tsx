"use client";

import { Suspense } from "react";
import Encabezado from "@/components/Encabezado";
import NuevaTarea from "@/components/NuevaTarea";
import TablaTareas from "@/components/tabla/TablaTareas";
import BarraFiltros from "@/components/filtros/BarraFiltros";
import { useFiltros } from "@/components/filtros/useFiltros";
import { useTareasFiltradas } from "@/components/filtros/useTareasFiltradas";

function Contenido() {
  const tareas = useTareasFiltradas();
  const { activos } = useFiltros();
  return (
    <>
      <Encabezado titulo="Por responsable" subtitulo="Carga de trabajo de cada persona">
        <NuevaTarea />
      </Encabezado>
      <BarraFiltros />
      <TablaTareas tareas={tareas} agruparPor="responsable" mostrarGruposVacios={activos === 0} />
    </>
  );
}

export default function ResponsablesPage() {
  return (
    <Suspense>
      <Contenido />
    </Suspense>
  );
}
