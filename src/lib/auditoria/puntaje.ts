// Convierte las evaluaciones en hallazgos, puntajes por categoría y total.
// Puntaje de categoría = (puntos obtenidos / puntos evaluables) × peso de la
// categoría. Los checks que no se pudieron evaluar (na) no cuentan; si una
// categoría completa queda sin datos, el total se reescala sobre las demás.

import { CHECKS, type Contexto, type DefCheck, type Evaluacion } from "./checks";
import {
  CATEGORIAS,
  NOMBRE_CATEGORIA,
  PESO_CATEGORIA,
  calificacion,
  type Categoria,
  type Cuadrante,
  type Hallazgo,
  type PasoSiguiente,
  type Puntajes,
  type Severidad,
  type Veredicto,
} from "./tipos";

function severidad(def: DefCheck, e: Evaluacion): Severidad {
  if (e.estado === "ok") return "positivo";
  if (e.estado === "na") return "pendiente";
  if (e.estado === "falla") return def.severidad;
  return def.severidad === "critico" ? "importante" : "mejora";
}

export function cuadrante(impacto: Hallazgo["impacto"], esfuerzo: Hallazgo["esfuerzo"]): Cuadrante {
  if (impacto !== "bajo" && esfuerzo === "bajo") return "quick-win";
  if (impacto === "alto") return "proyecto";
  if (esfuerzo !== "alto") return "mejora-menor";
  return "despues";
}

export function evaluarChecks(ctx: Contexto): Hallazgo[] {
  return CHECKS.map((def) => {
    let e: Evaluacion;
    try {
      e = def.evaluar(ctx);
    } catch (err) {
      e = { estado: "na", detalle: `No se pudo evaluar: ${(err as Error).message}` };
    }
    const fraccion = e.estado === "ok" ? 1 : e.estado === "falla" ? 0 : e.estado === "na" ? 0 : Math.min(1, Math.max(0, e.fraccion ?? 0.5));
    const pendiente = e.estado === "parcial" || e.estado === "falla";
    return {
      id: def.id,
      categoria: def.categoria,
      titulo: def.titulo,
      estado: e.estado,
      severidad: severidad(def, e),
      puntos: Math.round(def.peso * fraccion * 10) / 10,
      peso: def.peso,
      detalle: e.detalle,
      evidencia: e.evidencia ?? [],
      recomendacion: def.recomendacion,
      impacto: def.impacto,
      esfuerzo: def.esfuerzo,
      area: def.area,
      cuadrante: pendiente ? cuadrante(def.impacto, def.esfuerzo) : null,
      fuente: def.fuente,
    };
  });
}

export function calcularPuntajes(hallazgos: Hallazgo[]) {
  const puntajes = {} as Puntajes;
  let suma = 0;
  let pesoEvaluado = 0;
  for (const cat of CATEGORIAS) {
    const evaluables = hallazgos.filter((h) => h.categoria === cat && h.estado !== "na");
    const max = evaluables.reduce((s, h) => s + h.peso, 0);
    const obt = evaluables.reduce((s, h) => s + h.puntos, 0);
    const porcentaje = max > 0 ? obt / max : null;
    puntajes[cat] = {
      obtenido: porcentaje === null ? 0 : Math.round(porcentaje * PESO_CATEGORIA[cat] * 10) / 10,
      maximo: PESO_CATEGORIA[cat],
      porcentaje: porcentaje === null ? null : Math.round(porcentaje * 100),
    };
    if (porcentaje !== null) {
      suma += porcentaje * PESO_CATEGORIA[cat];
      pesoEvaluado += PESO_CATEGORIA[cat];
    }
  }
  const total = pesoEvaluado > 0 ? Math.round((suma / pesoEvaluado) * 1000) / 10 : 0;
  return { puntajes, total, calificacion: calificacion(Math.round(total)) };
}

const ORDEN_SEV: Record<Severidad, number> = { critico: 0, importante: 1, mejora: 2, ia: 3, pendiente: 4, positivo: 5 };
const ORDEN_NIVEL = { alto: 0, medio: 1, bajo: 2 } as const;

export function ordenarHallazgos(a: Hallazgo, b: Hallazgo) {
  return ORDEN_SEV[a.severidad] - ORDEN_SEV[b.severidad] || ORDEN_NIVEL[a.impacto] - ORDEN_NIVEL[b.impacto] || b.peso - a.peso;
}

/** Hasta 6 arreglos de alto impacto y bajo esfuerzo, de mayor a menor peso. */
export function quickWins(hallazgos: Hallazgo[]): string[] {
  return hallazgos
    .filter((h) => h.cuadrante === "quick-win")
    .sort((a, b) => ORDEN_SEV[a.severidad] - ORDEN_SEV[b.severidad] || (b.peso - b.puntos) * PESO_CATEGORIA[b.categoria] - (a.peso - a.puntos) * PESO_CATEGORIA[a.categoria])
    .slice(0, 6)
    .map((h) => h.id);
}

// ------------------------------------------------------------------ textos sin IA
export function veredictosBase(hallazgos: Hallazgo[], puntajes: Puntajes): Record<Categoria, Veredicto> {
  const out = {} as Record<Categoria, Veredicto>;
  for (const cat of CATEGORIAS) {
    const p = puntajes[cat];
    const hs = hallazgos.filter((h) => h.categoria === cat).sort(ordenarHallazgos);
    const malos = hs.filter((h) => h.estado === "falla" || h.estado === "parcial");
    const buenos = hs.filter((h) => h.estado === "ok");
    const nivel = p.porcentaje === null ? "sin datos" : p.porcentaje >= 85 ? "sólido" : p.porcentaje >= 65 ? "aceptable con pendientes" : p.porcentaje >= 45 ? "con problemas importantes" : "crítico";
    out[cat] = {
      titular: `${NOMBRE_CATEGORIA[cat]}: ${nivel}`,
      texto:
        p.porcentaje === null
          ? "No hubo datos suficientes para evaluar esta categoría."
          : [
              malos.length ? `Lo más urgente: ${malos.slice(0, 2).map((h) => h.titulo.toLowerCase()).join(" y ")}.` : "No se encontraron problemas en esta categoría.",
              buenos.length ? `Bien resuelto: ${buenos.slice(0, 2).map((h) => h.titulo.toLowerCase()).join(" y ")}.` : "",
            ]
              .filter(Boolean)
              .join(" "),
    };
  }
  return out;
}

export function resumenBase(total: number, puntajes: Puntajes, hallazgos: Hallazgo[]): string {
  const peor = CATEGORIAS.filter((c) => puntajes[c].porcentaje !== null).sort((a, b) => puntajes[a].porcentaje! - puntajes[b].porcentaje!)[0];
  const criticos = hallazgos.filter((h) => h.severidad === "critico").length;
  const importantes = hallazgos.filter((h) => h.severidad === "importante").length;
  return `El sitio obtiene ${Math.round(total)}/100 (${calificacion(Math.round(total))}). Se encontraron ${criticos} hallazgo(s) crítico(s) y ${importantes} importante(s). ${
    peor ? `La categoría más débil es ${NOMBRE_CATEGORIA[peor].toLowerCase()} (${puntajes[peor].porcentaje}%).` : ""
  }`.trim();
}

export function pasosBase(hallazgos: Hallazgo[]): PasoSiguiente[] {
  return hallazgos
    .filter((h) => h.estado === "falla" || h.estado === "parcial")
    .sort(ordenarHallazgos)
    .slice(0, 5)
    .map((h) => ({ titulo: h.titulo, detalle: h.recomendacion, esfuerzo: h.esfuerzo, area: h.area, hallazgos: [h.id] }));
}
