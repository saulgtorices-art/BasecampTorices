"use client";

import { useMemo } from "react";
import { useDatos } from "@/components/datos/DatosProvider";
import type { Tarea } from "@/types/db";
import { aplicarFiltros, useFiltros } from "./useFiltros";

/** Tareas del store con los filtros de la URL aplicados (y un filtro fijo opcional). */
export function useTareasFiltradas(filtroFijo?: (t: Tarea) => boolean) {
  const { tareas, clientePorId, miembroPorId } = useDatos();
  const { filtros } = useFiltros();
  return useMemo(() => {
    const base = filtroFijo ? tareas.filter(filtroFijo) : tareas;
    return aplicarFiltros(base, filtros, clientePorId, miembroPorId);
  }, [tareas, filtros, clientePorId, miembroPorId, filtroFijo]);
}
