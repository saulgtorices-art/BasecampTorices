"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { AlarmClock, AtSign, Bell, BellRing, CheckCheck, RefreshCw, Ticket, UserPlus } from "lucide-react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useDatos } from "@/components/datos/DatosProvider";
import Avatar from "@/components/ui/Avatar";
import type { Notificacion, TipoNotificacion } from "@/types/db";

const ICONO: Record<TipoNotificacion, React.ReactNode> = {
  mencion: <AtSign size={12} />,
  asignacion: <UserPlus size={12} />,
  estatus: <RefreshCw size={12} />,
  vencida: <AlarmClock size={12} />,
  ticket: <Ticket size={12} />,
};

const COLOR: Record<TipoNotificacion, string> = {
  mencion: "bg-marca-600",
  asignacion: "bg-green-600",
  estatus: "bg-amber-500",
  vencida: "bg-red-600",
  ticket: "bg-purple-600",
};

function hace(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

/** Campanita de notificaciones: contador, lista en vivo y avisos del navegador. */
export default function Campana() {
  const supabase = supabaseNavegador();
  const { yo, miembroPorId, abrirTarea, avisar } = useDatos();
  const [lista, setLista] = useState<Notificacion[]>([]);
  const [abierta, setAbierta] = useState(false);
  const [permiso, setPermiso] = useState<NotificationPermission | "no-soportado">("default");
  const cajaRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const noLeidas = lista.filter((n) => !n.leida).length;

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("notificaciones")
      .select("*")
      .eq("miembro_id", yo.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setLista((data as Notificacion[]) ?? []);
  }, [supabase, yo.id]);

  // Carga inicial + avisos de tareas vencidas (se generan una sola vez por tarea).
  useEffect(() => {
    setPermiso(typeof Notification === "undefined" ? "no-soportado" : Notification.permission);
    supabase.rpc("generar_avisos_vencidas").then(() => cargar());
  }, [supabase, cargar]);

  // Tiempo real.
  const abrirTareaRef = useRef(abrirTarea);
  abrirTareaRef.current = abrirTarea;
  useEffect(() => {
    const canal = supabase
      .channel(`notificaciones-${yo.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notificaciones", filter: `miembro_id=eq.${yo.id}` },
        (p) => {
          if (p.eventType === "INSERT") {
            const n = p.new as Notificacion;
            setLista((l) => [n, ...l.filter((x) => x.id !== n.id)].slice(0, 50));
            if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
              const aviso = new Notification("Grupo Torices", { body: n.texto, tag: n.id, icon: "/logo-simbolo.png" });
              aviso.onclick = () => {
                window.focus();
                if (n.ticket_id) window.location.assign(`/tickets?ticket=${n.ticket_id}`);
                else if (n.tarea_id) abrirTareaRef.current(n.tarea_id);
                aviso.close();
              };
            } else if (!document.hidden) {
              avisar(n.texto, "ok");
            }
          } else {
            cargar();
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, yo.id, cargar, avisar]);

  // Cierra al hacer clic fuera.
  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent) => {
      if (!cajaRef.current?.contains(e.target as Node)) setAbierta(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierta]);

  // Contador en el título de la pestaña.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = noLeidas ? `(${noLeidas}) ${base}` : base;
  }, [noLeidas]);

  async function marcarLeida(ids: string[]) {
    if (!ids.length) return;
    setLista((l) => l.map((n) => (ids.includes(n.id) ? { ...n, leida: true } : n)));
    await supabase.from("notificaciones").update({ leida: true }).in("id", ids);
  }

  async function abrir(n: Notificacion) {
    marcarLeida([n.id]);
    setAbierta(false);
    if (n.ticket_id) router.push(`/tickets?ticket=${n.ticket_id}`);
    else if (n.tarea_id) abrirTarea(n.tarea_id);
  }

  async function activarNavegador() {
    if (typeof Notification === "undefined") return;
    const r = await Notification.requestPermission();
    setPermiso(r);
    if (r === "granted") avisar("Listo: te avisaremos aunque tengas otra pestaña abierta.", "ok");
  }

  return (
    <div ref={cajaRef} className="relative">
      <button
        onClick={() => setAbierta((a) => !a)}
        title="Notificaciones"
        className={clsx(
          "relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm",
          abierta ? "bg-marca-50 font-medium text-marca-700" : "text-slate-600 hover:bg-slate-100",
        )}
      >
        {noLeidas ? <BellRing size={17} /> : <Bell size={17} />}
        <span className="hidden md:inline">Notificaciones</span>
        {noLeidas > 0 && (
          <span className="absolute top-1 left-6 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] leading-4 font-semibold text-white md:static md:ml-auto">
            {noLeidas > 99 ? "99+" : noLeidas}
          </span>
        )}
      </button>

      {abierta && (
        <div className="fixed top-14 left-14 z-50 flex max-h-[75vh] w-[min(22rem,calc(100vw-4.5rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl md:top-16 md:left-56">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <span className="font-semibold">Notificaciones</span>
            {noLeidas > 0 && (
              <button
                onClick={() => marcarLeida(lista.filter((n) => !n.leida).map((n) => n.id))}
                className="ml-auto flex items-center gap-1 text-xs text-marca-700 hover:underline"
              >
                <CheckCheck size={14} /> Marcar todas como leídas
              </button>
            )}
          </div>

          {permiso === "default" && (
            <button
              onClick={activarNavegador}
              className="mx-3 mt-3 rounded-lg bg-marca-50 px-3 py-2 text-left text-xs text-marca-700 hover:bg-marca-100"
            >
              <b>Activar avisos del navegador</b> para enterarte aunque estés en otra pestaña.
            </button>
          )}

          <ul className="flex-1 overflow-y-auto py-1">
            {lista.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-slate-400">No tienes notificaciones.</li>
            )}
            {lista.map((n) => {
              const actor = n.actor_id ? miembroPorId.get(n.actor_id) : null;
              return (
                <li key={n.id}>
                  <button
                    onClick={() => abrir(n)}
                    className={clsx(
                      "flex w-full gap-3 px-4 py-2.5 text-left hover:bg-slate-50",
                      !n.leida && "bg-marca-50/50",
                    )}
                  >
                    <div className="relative shrink-0">
                      <Avatar nombre={actor?.nombre ?? "Sistema"} foto={actor?.foto_url} tam={32} />
                      <span
                        className={clsx(
                          "absolute -right-1 -bottom-1 flex h-4.5 w-4.5 items-center justify-center rounded-full p-0.5 text-white ring-2 ring-white",
                          COLOR[n.tipo],
                        )}
                      >
                        {ICONO[n.tipo]}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-3 text-sm">
                        {actor && <b>{actor.nombre} </b>}
                        {n.texto}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">{hace(n.created_at)}</p>
                    </div>
                    {!n.leida && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-marca-600" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
