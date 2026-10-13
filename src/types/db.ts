// Tipos del modelo. Si cambias el esquema, actualiza este archivo
// (o reemplázalo con `npx supabase gen types typescript`).

export const ESTATUS = [
  "Backlog",
  "En Proceso",
  "En QA",
  "On hold - tarea continua",
  "Terminado",
] as const;
export type Estatus = (typeof ESTATUS)[number];

export const PRIORIDADES = ["Urgente", "Alta", "Media", "Baja"] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

export type Rol = "admin" | "miembro";

export interface Cliente {
  id: string;
  nombre: string;
  dominio: string | null;
  activo: boolean;
  created_at: string;
}

export interface Miembro {
  id: string;
  auth_user_id: string | null;
  nombre: string;
  correo: string;
  rol: Rol;
  alias: string[];
  activo: boolean;
  created_at: string;
}

export interface Tarea {
  id: string;
  cliente_id: string;
  titulo: string;
  responsable_id: string | null;
  estatus: Estatus;
  prioridad: Prioridad;
  qa: boolean;
  fecha_inicio: string | null;
  fecha_entrega: string | null;
  fecha_cierre: string | null;
  comentarios: string | null;
  documento_url: string | null;
  proyecto: string | null;
  posicion: number;
  creado_por: string | null;
  import_lote_id: string | null;
  created_at: string;
  updated_at: string;
}

export type TareaEditable = Partial<
  Pick<
    Tarea,
    | "cliente_id"
    | "titulo"
    | "responsable_id"
    | "estatus"
    | "prioridad"
    | "qa"
    | "fecha_inicio"
    | "fecha_entrega"
    | "fecha_cierre"
    | "comentarios"
    | "documento_url"
    | "proyecto"
    | "posicion"
  >
>;

export interface ComentarioTarea {
  id: string;
  tarea_id: string;
  miembro_id: string | null;
  texto: string;
  created_at: string;
}

export interface RegistroTiempo {
  id: string;
  tarea_id: string;
  miembro_id: string;
  inicio: string;
  fin: string | null;
  minutos: number | null;
  nota: string | null;
  manual: boolean;
  created_at: string;
}

export interface Historial {
  id: number;
  tarea_id: string;
  miembro_id: string | null;
  campo: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  fecha: string;
}

/** Columnas que acepta la futura pantalla de importación (Sheets / CSV). */
export const COLUMNAS_IMPORTACION = [
  "Cliente",
  "Tarea",
  "Responsable",
  "Estatus",
  "Prioridad",
  "QA",
  "Fecha de Entrega",
  "Comentarios",
  "Documento",
] as const;
