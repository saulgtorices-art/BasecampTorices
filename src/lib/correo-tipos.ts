import type { TipoNotificacion } from "@/types/db";

/** Tipos de aviso que cada persona puede recibir por correo (sección de Mi perfil). */
export const TIPOS_CORREO: { tipo: TipoNotificacion; texto: string; detalle: string; soloLider?: boolean }[] = [
  { tipo: "mencion", texto: "Menciones", detalle: "Alguien te menciona con @ en un comentario" },
  { tipo: "asignacion", texto: "Asignaciones", detalle: "Te asignan una tarea (o varias en una carga masiva)" },
  { tipo: "ticket", texto: "Tickets", detalle: "Tickets nuevos, cambios y comentarios" },
  { tipo: "estatus", texto: "Cambios de estatus", detalle: "Alguien mueve de estatus una tarea tuya" },
  { tipo: "vencida", texto: "Tareas vencidas", detalle: "Una tarea tuya pasó su fecha de entrega" },
  { tipo: "eliminada", texto: "Tareas eliminadas", detalle: "Alguien de tu célula borra una tarea", soloLider: true },
  { tipo: "importacion", texto: "Cargas masivas", detalle: "Alguien de tu célula carga tareas desde Excel", soloLider: true },
];
