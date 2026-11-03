// Lógica de la carga masiva: lee filas de Excel/CSV, detecta columnas y
// convierte cada fila en una tarea lista para `importar_tareas()`.
// Sin dependencias de React para poder probarla aparte.

import { ESTATUS, PRIORIDADES, type Estatus, type Prioridad } from "@/types/db";

export type Celda = string | number | boolean | Date | null | undefined;

export const CAMPOS = [
  "cliente",
  "titulo",
  "responsable",
  "estatus",
  "prioridad",
  "qa",
  "fecha_inicio",
  "fecha_entrega",
  "fecha_cierre",
  "proyecto",
  "documento_url",
  "comentarios",
] as const;
export type Campo = (typeof CAMPOS)[number];

export const NOMBRE_CAMPO: Record<Campo, string> = {
  cliente: "Cliente",
  titulo: "Tarea",
  responsable: "Responsable",
  estatus: "Estatus",
  prioridad: "Prioridad",
  qa: "QA",
  fecha_inicio: "Fecha de inicio",
  fecha_entrega: "Fecha de entrega",
  fecha_cierre: "Fecha de cierre",
  proyecto: "Proyecto",
  documento_url: "Documento",
  comentarios: "Comentarios",
};

// Encabezados que se reconocen solos (ya normalizados: minúsculas, sin acentos).
const ALIAS: Record<Campo, string[]> = {
  cliente: ["cliente", "clientes", "marca", "cuenta", "empresa"],
  titulo: ["tarea", "tareas", "titulo", "actividad", "nombre de la tarea", "task", "pendiente", "entregable"],
  responsable: ["responsable", "responsables", "asignado", "asignado a", "encargado", "owner", "persona"],
  estatus: ["estatus", "status", "estado"],
  prioridad: ["prioridad", "priority", "urgencia"],
  qa: ["qa", "requiere qa", "revision qa"],
  fecha_inicio: ["fecha de inicio", "fecha inicio", "inicio"],
  fecha_entrega: ["fecha de entrega", "fecha entrega", "entrega", "deadline", "fecha limite", "vencimiento"],
  fecha_cierre: ["fecha de cierre", "fecha cierre", "cierre", "fecha de termino"],
  proyecto: ["proyecto", "campana"],
  documento_url: ["documento", "link", "liga", "url", "enlace", "doc"],
  comentarios: ["comentarios", "comentario", "notas", "nota", "observaciones"],
};

export function normalizar(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function textoCelda(v: Celda): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return fechaISO(v) ?? "";
  return String(v).trim();
}

/** Encabezado → campo (o null si no se reconoce). */
export function campoDeEncabezado(encabezado: string): Campo | null {
  const n = normalizar(encabezado).replace(/[*:.]/g, "").trim();
  if (!n) return null;
  for (const c of CAMPOS) if (ALIAS[c].includes(n)) return c;
  for (const c of CAMPOS) if (ALIAS[c].some((a) => a.length > 3 && n.startsWith(a))) return c;
  return null;
}

/** Busca, en las primeras filas, la que parece el encabezado. */
export function detectarEncabezado(filas: Celda[][]): number {
  let mejor = -1;
  let puntos = 1;
  for (let i = 0; i < Math.min(filas.length, 25); i++) {
    const campos = new Set(filas[i].map((c) => campoDeEncabezado(textoCelda(c))).filter(Boolean));
    if (campos.has("titulo") && campos.size > puntos) {
      mejor = i;
      puntos = campos.size;
    }
  }
  return mejor;
}

export type Mapeo = (Campo | null)[];

export function mapeoInicial(encabezado: Celda[]): Mapeo {
  const usados = new Set<Campo>();
  return encabezado.map((c) => {
    const campo = campoDeEncabezado(textoCelda(c));
    if (!campo || usados.has(campo)) return null;
    usados.add(campo);
    return campo;
  });
}

// ------------------------------------------------------------------ valores

function fechaISO(d: Date): string | null {
  if (isNaN(d.getTime())) return null;
  // Las celdas de fecha de Excel llegan a medianoche UTC.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function armarFecha(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const f = new Date(Date.UTC(y, m - 1, d));
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return fechaISO(f);
}

const MESES: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
  jan: 1, apr: 4, aug: 8, dec: 12,
};

/** Fecha de Excel (Date o número de serie) o texto dd/mm/aaaa, aaaa-mm-dd, "15 oct 2026"… */
export function leerFecha(v: Celda): { valor: string | null; error?: string } {
  if (v === null || v === undefined || v === "") return { valor: null };
  if (v instanceof Date) {
    const f = fechaISO(v);
    return f ? { valor: f } : { valor: null, error: "fecha inválida" };
  }
  if (typeof v === "number") {
    // Número de serie de Excel (días desde 1899-12-30).
    if (v > 20000 && v < 80000) return { valor: fechaISO(new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)) };
    return { valor: null, error: `fecha no reconocida: ${v}` };
  }
  const t = normalizar(v);
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const f = armarFecha(+m[1], +m[2], +m[3]);
    return f ? { valor: f } : { valor: null, error: `fecha inválida: ${v}` };
  }
  // En México el día va primero: 05/11/2026 = 5 de noviembre.
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const f = armarFecha(+m[3], +m[2], +m[1]);
    return f ? { valor: f } : { valor: null, error: `fecha inválida: ${v}` };
  }
  m = t.match(/^(\d{1,2})(?:\s*de)?[\s-/]*([a-z]{3})[a-z]*\.?(?:\s*de)?[\s-/]*(\d{2,4})$/);
  if (m && MESES[m[2]]) {
    const f = armarFecha(+m[3], MESES[m[2]], +m[1]);
    return f ? { valor: f } : { valor: null, error: `fecha inválida: ${v}` };
  }
  return { valor: null, error: `fecha no reconocida: ${v}` };
}

const ESTATUS_ALIAS: [string[], Estatus][] = [
  [["backlog", "pendiente", "por hacer", "sin iniciar", "no iniciado", "to do", "todo", "nuevo"], "Backlog"],
  [["en proceso", "proceso", "en progreso", "en curso", "trabajando", "working on it", "in progress", "haciendo"], "En Proceso"],
  [["en qa", "qa", "en revision", "revision", "review"], "En QA"],
  [["on hold - tarea continua", "on hold", "tarea continua", "continua", "en pausa", "pausa", "detenido", "stuck"], "On hold - tarea continua"],
  [["terminado", "terminada", "hecho", "hecha", "done", "listo", "lista", "completado", "completada", "entregado", "entregada", "finalizado", "finalizada", "cerrado", "cerrada"], "Terminado"],
];

export function leerEstatus(v: Celda): { valor: Estatus; aviso?: string } {
  const t = normalizar(textoCelda(v));
  if (!t) return { valor: "Backlog" };
  const exacto = ESTATUS.find((e) => normalizar(e) === t);
  if (exacto) return { valor: exacto };
  for (const [alias, e] of ESTATUS_ALIAS) if (alias.includes(t)) return { valor: e };
  if (t.startsWith("on hold")) return { valor: "On hold - tarea continua" };
  return { valor: "Backlog", aviso: `estatus "${textoCelda(v)}" no reconocido → Backlog` };
}

export function leerPrioridad(v: Celda): { valor: Prioridad; aviso?: string } {
  const t = normalizar(textoCelda(v));
  if (!t) return { valor: "Media" };
  const exacto = PRIORIDADES.find((p) => normalizar(p) === t);
  if (exacto) return { valor: exacto };
  if (["critica", "critico", "urgent", "asap"].includes(t)) return { valor: "Urgente" };
  if (["high", "alto"].includes(t)) return { valor: "Alta" };
  if (["normal", "medium", "medio"].includes(t)) return { valor: "Media" };
  if (["low", "bajo"].includes(t)) return { valor: "Baja" };
  // "Urgentísima", "Altísima", "Bajita"…
  if (t.startsWith("urgen")) return { valor: "Urgente" };
  if (t.startsWith("alt")) return { valor: "Alta" };
  if (t.startsWith("baj")) return { valor: "Baja" };
  return { valor: "Media", aviso: `prioridad "${textoCelda(v)}" no reconocida → Media` };
}

export function leerQA(v: Celda): boolean {
  if (typeof v === "boolean") return v;
  const t = normalizar(textoCelda(v));
  return ["si", "yes", "true", "verdadero", "x", "1", "✓", "✔", "requiere"].includes(t);
}

// ------------------------------------------------------------- personas

export interface PersonaImport {
  id: string;
  nombre: string;
  alias: string[];
  activo: boolean;
}

/** Busca al responsable por nombre, alias o nombre parcial (si es único). */
export function buscarResponsable(valor: string, miembros: PersonaImport[]): { id: string | null; aviso?: string } {
  // "Ana / Beto", "Ana y Beto", "Ana, Beto" → se toma el primero.
  const partes = valor.split(/\s*(?:\/|,|;|&|\s+y\s+)\s*/).filter(Boolean);
  const v = normalizar(partes[0] ?? "");
  if (!v) return { id: null };
  const extra = partes.length > 1 ? ` (solo se asignó a ${partes[0]})` : "";

  const nombres = (m: PersonaImport) => [m.nombre, ...m.alias].map(normalizar);
  const exacto = miembros.filter((m) => nombres(m).includes(v));
  const lista = exacto.length ? exacto : miembros.filter((m) => {
    const tokens = v.split(" ");
    return nombres(m).some((n) => tokens.every((tk) => n.split(" ").some((p) => p.startsWith(tk))));
  });
  const activos = lista.filter((m) => m.activo);
  const elegidos = activos.length ? activos : lista;
  if (elegidos.length === 1)
    return { id: elegidos[0].id, aviso: extra || (elegidos[0].activo ? undefined : `${elegidos[0].nombre} está inactivo`) };
  if (elegidos.length > 1) return { id: null, aviso: `"${valor}" coincide con varias personas → sin asignar` };
  return { id: null, aviso: `responsable "${valor}" no está en Equipo → sin asignar` };
}

// ----------------------------------------------------------------- filas

export interface FilaImport {
  cliente: string;
  titulo: string;
  responsable_id: string | null;
  estatus: Estatus;
  prioridad: Prioridad;
  qa: boolean;
  fecha_inicio: string | null;
  fecha_entrega: string | null;
  fecha_cierre: string | null;
  proyecto: string | null;
  documento_url: string | null;
  comentarios: string | null;
}

export interface FilaPrevia {
  /** Número de renglón en el archivo (1 = primera fila). */
  renglon: number;
  datos: FilaImport;
  clienteNuevo: boolean;
  errores: string[];
  avisos: string[];
}

export interface Contexto {
  clientes: { nombre: string; activo: boolean }[];
  miembros: PersonaImport[];
  /** Tareas existentes para avisar de posibles duplicados. */
  existentes: { cliente: string; titulo: string }[];
  clientePorDefecto: string;
  crearClientes: boolean;
}

export function prepararFilas(filas: Celda[][], inicio: number, mapeo: Mapeo, ctx: Contexto): FilaPrevia[] {
  const clientes = new Map(ctx.clientes.map((c) => [normalizar(c.nombre), c]));
  const existentes = new Set(ctx.existentes.map((e) => `${normalizar(e.cliente)}|${normalizar(e.titulo)}`));
  const vistos = new Set<string>();
  const col = (campo: Campo) => mapeo.indexOf(campo);
  const salida: FilaPrevia[] = [];

  for (let i = inicio; i < filas.length; i++) {
    const fila = filas[i] ?? [];
    if (fila.every((c) => textoCelda(c) === "")) continue;
    const valor = (campo: Campo): Celda => (col(campo) === -1 ? null : fila[col(campo)]);
    const texto = (campo: Campo) => textoCelda(valor(campo));
    const errores: string[] = [];
    const avisos: string[] = [];

    const titulo = texto("titulo");
    if (!titulo) errores.push("sin nombre de tarea");

    let cliente = texto("cliente") || ctx.clientePorDefecto.trim();
    let clienteNuevo = false;
    const existente = clientes.get(normalizar(cliente));
    if (!cliente) errores.push("sin cliente");
    else if (existente) {
      cliente = existente.nombre;
      if (!existente.activo) avisos.push(`el cliente ${existente.nombre} está inactivo`);
    } else if (ctx.crearClientes) {
      clienteNuevo = true;
    } else errores.push(`el cliente "${cliente}" no existe`);

    const resp = buscarResponsable(texto("responsable"), ctx.miembros);
    if (resp.aviso) avisos.push(resp.aviso);
    const estatus = leerEstatus(valor("estatus"));
    if (estatus.aviso) avisos.push(estatus.aviso);
    const prioridad = leerPrioridad(valor("prioridad"));
    if (prioridad.aviso) avisos.push(prioridad.aviso);

    const fecha = (campo: Campo) => {
      const f = leerFecha(valor(campo));
      if (f.error) avisos.push(`${NOMBRE_CAMPO[campo]}: ${f.error} (se deja vacía)`);
      return f.valor;
    };
    const fecha_inicio = fecha("fecha_inicio");
    const fecha_entrega = fecha("fecha_entrega");
    const fecha_cierre = fecha("fecha_cierre");

    const llave = `${normalizar(cliente)}|${normalizar(titulo)}`;
    if (titulo && existentes.has(llave)) avisos.push("ya existe una tarea igual en este cliente");
    else if (titulo && vistos.has(llave)) avisos.push("repetida en el archivo");
    vistos.add(llave);

    salida.push({
      renglon: i + 1,
      clienteNuevo,
      errores,
      avisos,
      datos: {
        cliente,
        titulo,
        responsable_id: resp.id,
        estatus: estatus.valor,
        prioridad: prioridad.valor,
        qa: leerQA(valor("qa")),
        fecha_inicio,
        fecha_entrega,
        fecha_cierre,
        proyecto: texto("proyecto") || null,
        documento_url: texto("documento_url") || null,
        comentarios: texto("comentarios") || null,
      },
    });
  }
  return salida;
}

// ------------------------------------------------------------------- CSV

/** CSV/TSV (también lo que se pega copiando celdas de Excel). Detecta el separador. */
export function leerCSV(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, "");
  const primera = limpio.split(/\r?\n/, 1)[0] ?? "";
  const sep = ["\t", ";", ","].reduce((a, b) => (primera.split(b).length > primera.split(a).length ? b : a), ",");
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"' && celda === "") comillas = true;
    else if (c === sep) {
      fila.push(celda);
      celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += c;
  }
  if (celda !== "" || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

/** Plantilla para descargar (CSV con BOM para que Excel respete los acentos). */
export function plantillaCSV(): string {
  const enc = ["Cliente", "Tarea", "Responsable", "Estatus", "Prioridad", "QA", "Fecha de Inicio", "Fecha de Entrega", "Proyecto", "Documento", "Comentarios"];
  const ej = [
    ["Cliente Ejemplo", "Diseño de banners noviembre", "Yanni Reyes", "Backlog", "Alta", "Sí", "03/11/2026", "10/11/2026", "Campaña Buen Fin", "https://drive.google.com/…", "3 medidas"],
    ["Cliente Ejemplo", "Reporte SEO mensual", "Eduardo Ojeda", "En Proceso", "Media", "No", "", "30/11/2026", "", "", ""],
  ];
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + [enc, ...ej].map((f) => f.map(esc).join(",")).join("\r\n") + "\r\n";
}
