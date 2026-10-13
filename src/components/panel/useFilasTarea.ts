"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";

/**
 * Carga las filas de una tabla hija de `tareas` (comentarios, registros…)
 * y las mantiene al día con Realtime. `recargarCon` fuerza recarga cuando cambia.
 */
export function useFilasTarea<T extends { id: string | number }>(
  tabla: string,
  tareaId: string,
  orden: { columna: string; asc: boolean },
  opciones: { realtime?: boolean; recargarCon?: unknown } = {},
) {
  const supabase = supabaseNavegador();
  const [filas, setFilas] = useState<T[]>([]);
  const [cargando, setCargando] = useState(true);
  const { realtime = true, recargarCon } = opciones;

  const recargar = useCallback(async () => {
    const { data } = await supabase
      .from(tabla)
      .select("*")
      .eq("tarea_id", tareaId)
      .order(orden.columna, { ascending: orden.asc })
      .limit(1000);
    setFilas((data as T[]) ?? []);
    setCargando(false);
  }, [supabase, tabla, tareaId, orden.columna, orden.asc]);

  useEffect(() => {
    recargar();
  }, [recargar, recargarCon]);

  useEffect(() => {
    if (!realtime) return;
    const canal = supabase
      .channel(`${tabla}-${tareaId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: tabla, filter: `tarea_id=eq.${tareaId}` },
        () => recargar(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, tabla, tareaId, realtime, recargar]);

  return { filas, setFilas, cargando, recargar };
}
