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
      <Encabezado titulo="Tabla" subtitulo={`${tareas.length} tareas agrupadas por cliente`}>
        <NuevaTarea />
      </Encabezado>
      <BarraFiltros />
      <TablaTareas tareas={tareas} agruparPor="cliente" mostrarGruposVacios={activos === 0} />
    </>
  );
}

export default function TablaPage() {
  return (
    <Suspense>
      <Contenido />
    </Suspense>
  );
}
