"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Cliente, Miembro, Tarea } from "@/types/db";

export type CampoFecha = "entrega" | "inicio" | "cierre";

export interface Filtros {
  q: string;
  cliente: string;
  responsable: string; // id, "sin" = sin asignar
  estatus: string;
  prioridad: string;
  proyecto: string; // "sin" = sin proyecto
  campoFecha: CampoFecha;
  desde: string;
  hasta: string;
  ocultarTerminadas: boolean;
}

const CLAVES: (keyof Filtros)[] = [
  "q",
  "cliente",
  "responsable",
  "estatus",
  "prioridad",
  "proyecto",
  "campoFecha",
  "desde",
  "hasta",
  "ocultarTerminadas",
];

/** Quita acentos y pasa a minúsculas para buscar sin importar ortografía. */
export function normalizar(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Filtros guardados en la URL (se pueden compartir como enlace). */
export function useFiltros() {
  const params = useSearchParams();
  const router = useRouter();
  const ruta = usePathname();

  const filtros: Filtros = useMemo(
    () => ({
      q: params.get("q") ?? "",
      cliente: params.get("cliente") ?? "",
      responsable: params.get("responsable") ?? "",
      estatus: params.get("estatus") ?? "",
      prioridad: params.get("prioridad") ?? "",
      proyecto: params.get("proyecto") ?? "",
      campoFecha: (params.get("campoFecha") as CampoFecha) || "entrega",
      desde: params.get("desde") ?? "",
      hasta: params.get("hasta") ?? "",
      ocultarTerminadas: params.get("ocultarTerminadas") === "1",
    }),
    [params],
  );

  const cambiar = useCallback(
    (cambios: Partial<Filtros>) => {
      const nuevos = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(cambios)) {
        const valor = typeof v === "boolean" ? (v ? "1" : "") : (v ?? "");
        if (!valor || (k === "campoFecha" && valor === "entrega")) nuevos.delete(k);
        else nuevos.set(k, valor);
      }
      const qs = nuevos.toString();
      router.replace(qs ? `${ruta}?${qs}` : ruta, { scroll: false });
    },
    [params, router, ruta],
  );

  const limpiar = useCallback(() => {
    const nuevos = new URLSearchParams(params.toString());
    CLAVES.forEach((k) => nuevos.delete(k));
    const qs = nuevos.toString();
    router.replace(qs ? `${ruta}?${qs}` : ruta, { scroll: false });
  }, [params, router, ruta]);

  const activos = CLAVES.filter((k) => {
    if (k === "campoFecha") return false;
    return !!filtros[k];
  }).length;

  return { filtros, cambiar, limpiar, activos };
}

export function aplicarFiltros(
  tareas: Tarea[],
  f: Filtros,
  clientePorId: Map<string, Cliente>,
  miembroPorId: Map<string, Miembro>,
) {
  const q = normalizar(f.q.trim());
  const columnaFecha =
    f.campoFecha === "inicio" ? "fecha_inicio" : f.campoFecha === "cierre" ? "fecha_cierre" : "fecha_entrega";

  return tareas.filter((t) => {
    if (f.cliente && t.cliente_id !== f.cliente) return false;
    if (f.responsable === "sin" ? t.responsable_id !== null : f.responsable && t.responsable_id !== f.responsable)
      return false;
    if (f.estatus && t.estatus !== f.estatus) return false;
    if (f.prioridad && t.prioridad !== f.prioridad) return false;
    if (f.proyecto === "sin" ? !!t.proyecto : f.proyecto && t.proyecto !== f.proyecto) return false;
    if (f.ocultarTerminadas && t.estatus === "Terminado") return false;
    if (f.desde || f.hasta) {
      const fecha = t[columnaFecha];
      if (!fecha) return false;
      if (f.desde && fecha < f.desde) return false;
      if (f.hasta && fecha > f.hasta) return false;
    }
    if (q) {
      const texto = normalizar(
        [
          t.titulo,
          t.comentarios,
          t.proyecto,
          clientePorId.get(t.cliente_id)?.nombre,
          t.responsable_id ? miembroPorId.get(t.responsable_id)?.nombre : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (!q.split(/\s+/).every((p) => texto.includes(p))) return false;
    }
    return true;
  });
}
