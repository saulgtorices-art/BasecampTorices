// Tipos del reporte de auditoría UX/UI. Se comparten entre el motor
// (servidor) y el reporte (navegador), así que aquí no va nada de Node.

export const CATEGORIAS = ["ux", "ui", "responsive", "accesibilidad", "tecnico"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

/** Peso de cada categoría en el puntaje total (suma 100). */
export const PESO_CATEGORIA: Record<Categoria, number> = {
  ux: 40,
  ui: 35,
  responsive: 10,
  accesibilidad: 10,
  tecnico: 5,
};

export const NOMBRE_CATEGORIA: Record<Categoria, string> = {
  ux: "Experiencia (UX)",
  ui: "Interfaz (UI)",
  responsive: "Responsive",
  accesibilidad: "Accesibilidad",
  tecnico: "Técnico",
};

export type Severidad = "critico" | "importante" | "mejora" | "positivo" | "pendiente" | "ia";
export type EstadoCheck = "ok" | "parcial" | "falla" | "na";
export type Nivel = "alto" | "medio" | "bajo";
export type Area = "Diseño UX/UI" | "Desarrollo" | "Contenido/SEO";
export type Cuadrante = "quick-win" | "proyecto" | "mejora-menor" | "despues";

export interface Hallazgo {
  id: string;
  categoria: Categoria;
  titulo: string;
  estado: EstadoCheck;
  severidad: Severidad;
  /** Puntos obtenidos / posibles dentro de su categoría (antes de normalizar). */
  puntos: number;
  peso: number;
  detalle: string;
  evidencia: string[];
  recomendacion: string;
  impacto: Nivel;
  esfuerzo: Nivel;
  area: Area;
  cuadrante: Cuadrante | null;
  fuente: "html" | "pagespeed" | "red";
}

export interface HallazgoIA {
  id: string;
  categoria: Categoria;
  titulo: string;
  detalle: string;
  recomendacion: string;
  severidad: "critico" | "importante" | "mejora" | "positivo";
}

export interface PuntajeCategoria {
  obtenido: number;
  maximo: number;
  /** 0–100 dentro de la categoría; null si no se pudo evaluar nada. */
  porcentaje: number | null;
}

export type Puntajes = Record<Categoria, PuntajeCategoria>;

export interface Vitales {
  /** ms */
  lcp: number | null;
  cls: number | null;
  /** INP en campo; en laboratorio se usa TBT. ms */
  inp: number | null;
  tbt: number | null;
  fcp: number | null;
}

export interface ResultadoPageSpeed {
  ok: boolean;
  error?: string;
  estrategia: "mobile" | "desktop";
  puntajes: { rendimiento: number | null; accesibilidad: number | null; buenasPracticas: number | null; seo: number | null };
  laboratorio: Vitales;
  campo: (Vitales & { fuente: "url" | "origen"; categoria: string | null }) | null;
  version: string | null;
}

export interface PaginaClave {
  url: string;
  texto: string;
  status: number | null;
  titulo: string | null;
  h1: string | null;
  error?: string;
}

export interface Veredicto {
  titular: string;
  texto: string;
}

export interface PasoSiguiente {
  titulo: string;
  detalle: string;
  esfuerzo: Nivel;
  area: Area;
  hallazgos?: string[];
}

export interface ResultadoAuditoria {
  version: 1;
  url: string;
  urlFinal: string;
  titulo: string | null;
  resumen: string;
  generadoConIA: boolean;
  modeloIA?: string;
  veredictos: Record<Categoria, Veredicto>;
  hallazgos: Hallazgo[];
  hallazgosIA: HallazgoIA[];
  quickWins: string[];
  proximosPasos: PasoSiguiente[];
  lagunas: string[];
  paginas: PaginaClave[];
  pagespeed: { movil: ResultadoPageSpeed | null; escritorio: ResultadoPageSpeed | null };
  red: { ttfbMs: number | null; status: number | null; redirecciones: string[]; bytesHtml: number | null };
  duracionMs: number;
}

export interface Capturas {
  movil?: string | null;
  escritorio?: string | null;
}

export function calificacion(puntaje: number): "A" | "B" | "C" | "D" | "F" {
  if (puntaje >= 90) return "A";
  if (puntaje >= 80) return "B";
  if (puntaje >= 70) return "C";
  if (puntaje >= 55) return "D";
  return "F";
}
