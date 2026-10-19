"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import type { EstadoTicket, Prioridad, Ticket } from "@/types/db";

export const folio = (n: number) => `TK-${String(n).padStart(4, "0")}`;

export const ABIERTOS: EstadoTicket[] = ["Nuevo", "En revisión", "Aceptado"];
export const estaAbierto = (t: Ticket) => ABIERTOS.includes(t.estado);

export const RANGO_URGENCIA: Record<Prioridad, number> = { Urgente: 0, Alta: 1, Media: 2, Baja: 3 };

export const SLA_TEXTO: Record<Prioridad, string> = {
  Urgente: "4 horas",
  Alta: "1 día",
  Media: "3 días",
  Baja: "1 semana",
};

export const DESCRIPCION_URGENCIA: Record<Prioridad, string> = {
  Urgente: "Algo está caído o bloquea al cliente",
  Alta: "Afecta el trabajo, hay que verlo hoy",
  Media: "Importante, pero puede esperar unos días",
  Baja: "Mejora o idea sin prisa",
};

export const COLOR_ESTADO: Record<EstadoTicket, string> = {
  Nuevo: "#579bfc",
  "En revisión": "#a25ddc",
  Aceptado: "#fdab3d",
  Rechazado: "#94a3b8",
  Resuelto: "#00c875",
};

function duracion(ms: number) {
  const min = Math.round(Math.abs(ms) / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} días`;
}

/** Estado del SLA para mostrar: texto y tono. */
export function estadoSla(t: Ticket, ahora = Date.now()): { texto: string; tono: "ok" | "alerta" | "vencido" | "cerrado" } {
  if (!t.vence_at) return { texto: "—", tono: "ok" };
  const vence = new Date(t.vence_at).getTime();
  if (!estaAbierto(t)) {
    if (t.estado === "Rechazado") return { texto: "Rechazado", tono: "cerrado" };
    const fin = t.resuelto_at ? new Date(t.resuelto_at).getTime() : ahora;
    const tardo = duracion(fin - new Date(t.created_at).getTime());
    return { texto: fin <= vence ? `Resuelto en ${tardo} ✓` : `Resuelto en ${tardo} (fuera de SLA)`, tono: "cerrado" };
  }
  const resta = vence - ahora;
  if (resta < 0) return { texto: `Vencido hace ${duracion(resta)}`, tono: "vencido" };
  const total = vence - new Date(t.created_at).getTime();
  return { texto: `Vence en ${duracion(resta)}`, tono: resta < total * 0.25 ? "alerta" : "ok" };
}

/** Todos los tickets, en tiempo real. */
export function useTickets() {
  const supabase = supabaseNavegador();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from("tickets").select("*").order("created_at", { ascending: false }).limit(2000);
    setTickets((data as Ticket[]) ?? []);
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
    const canal = supabase
      .channel("tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, (p) => {
        if (p.eventType === "DELETE") {
          const id = (p.old as { id: string }).id;
          setTickets((ts) => ts.filter((t) => t.id !== id));
        } else {
          const n = p.new as Ticket;
          setTickets((ts) => {
            const i = ts.findIndex((t) => t.id === n.id);
            if (i === -1) return [n, ...ts];
            const c = ts.slice();
            c[i] = n;
            return c;
          });
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, cargar]);

  return { tickets, cargando, recargar: cargar };
}
