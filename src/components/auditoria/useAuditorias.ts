"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import type { Auditoria } from "@/types/db";

export type AuditoriaResumen = Pick<
  Auditoria,
  "id" | "cliente_id" | "url" | "estado" | "progreso" | "puntaje" | "calificacion" | "puntajes" | "error" | "creado_por" | "created_at" | "updated_at"
>;

/** Una auditoría "en proceso" sin avance en este tiempo se da por perdida. */
export const MS_ABANDONO = 6 * 60_000;

export function estaAbandonada(a: Pick<Auditoria, "estado" | "updated_at">) {
  return a.estado === "en_proceso" && Date.now() - new Date(a.updated_at).getTime() > MS_ABANDONO;
}

/** Lista de auditorías (sin resultado ni capturas) con refresco mientras haya alguna en curso. */
export function useAuditorias() {
  const supabase = supabaseNavegador();
  const [lista, setLista] = useState<AuditoriaResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [disponible, setDisponible] = useState(true);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from("auditorias")
      .select("id, cliente_id, url, estado, progreso, puntaje, calificacion, puntajes, error, creado_por, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(500);
    // Si la migración aún no se aplica, la tabla no existe: se oculta la función.
    if (error) setDisponible(false);
    else setLista(data as AuditoriaResumen[]);
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const hayEnCurso = lista.some((a) => a.estado === "en_proceso" && !estaAbandonada(a));
  useEffect(() => {
    if (!hayEnCurso) return;
    const t = setInterval(cargar, 5000);
    return () => clearInterval(t);
  }, [hayEnCurso, cargar]);

  const ultimaPorCliente = useMemo(() => {
    const m = new Map<string, AuditoriaResumen>();
    for (const a of lista) if (!m.has(a.cliente_id) && a.estado === "lista") m.set(a.cliente_id, a);
    return m;
  }, [lista]);

  return { lista, cargando, disponible, ultimaPorCliente, recargar: cargar };
}
