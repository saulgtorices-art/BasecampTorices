import type { Estatus, Prioridad } from "@/types/db";

export const COLOR_ESTATUS: Record<Estatus, string> = {
  Backlog: "#94a3b8",
  "En Proceso": "#fdab3d",
  "En QA": "#a25ddc",
  "On hold - tarea continua": "#579bfc",
  Terminado: "#00c875",
};

export const COLOR_PRIORIDAD: Record<Prioridad, string> = {
  Urgente: "#e2445c",
  Alta: "#ff7a45",
  Media: "#fdbc64",
  Baja: "#7fc8f8",
};

/** Paleta para el borde de cada grupo (cliente / responsable). */
const PALETA_GRUPOS = [
  "#579bfc", "#00c875", "#a25ddc", "#fdab3d", "#e2445c",
  "#037f4c", "#ff642e", "#66ccff", "#9d50dd", "#ff158a",
];

export function colorGrupo(clave: string) {
  let h = 0;
  for (const c of clave) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA_GRUPOS[h % PALETA_GRUPOS.length];
}

/** Fecha de hoy (YYYY-MM-DD) en la zona del equipo. */
export function hoyMx(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}

export function estaVencida(t: { estatus: Estatus; fecha_entrega: string | null }) {
  return t.estatus !== "Terminado" && !!t.fecha_entrega && t.fecha_entrega < hoyMx();
}

export function formatoFecha(iso: string | null) {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export function formatoFechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatoMinutos(min: number | null | undefined) {
  const m = Math.max(0, Math.round(min ?? 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

export function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

// ------------------------------------------------------------------ auditorías
/** Colores de severidad del reporte de auditoría (mismos tonos que FOVEA). */
export const COLOR_SEVERIDAD = {
  critico: { fondo: "#FEF2F2", texto: "#B91C1C", punto: "#DC2626", nombre: "Crítico" },
  importante: { fondo: "#FFF7ED", texto: "#C2410C", punto: "#EA580C", nombre: "Importante" },
  mejora: { fondo: "#FFFBEB", texto: "#B45309", punto: "#D97706", nombre: "Mejora" },
  positivo: { fondo: "#F0FDF4", texto: "#15803D", punto: "#16A34A", nombre: "Bien" },
  pendiente: { fondo: "#F8FAFC", texto: "#475569", punto: "#94A3B8", nombre: "Sin evaluar" },
  ia: { fondo: "#F5F3FF", texto: "#6D28D9", punto: "#7C3AED", nombre: "IA" },
} as const;

export const COLOR_CALIFICACION: Record<string, string> = {
  A: "#16A34A",
  B: "#65A30D",
  C: "#D97706",
  D: "#EA580C",
  F: "#DC2626",
};
