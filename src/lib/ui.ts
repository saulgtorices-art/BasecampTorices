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
