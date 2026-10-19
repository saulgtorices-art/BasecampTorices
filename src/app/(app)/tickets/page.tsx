"use client";

import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { AlarmClock, Flame, Inbox, Search, Timer } from "lucide-react";
import Encabezado from "@/components/Encabezado";
import Avatar from "@/components/ui/Avatar";
import { useDatos } from "@/components/datos/DatosProvider";
import NuevoTicket from "@/components/tickets/NuevoTicket";
import DetalleTicket from "@/components/tickets/DetalleTicket";
import { COLOR_ESTADO, RANGO_URGENCIA, estadoSla, estaAbierto, folio, useTickets } from "@/components/tickets/util";
import { COLOR_PRIORIDAD } from "@/lib/ui";
import { PRIORIDADES, type Prioridad, type Ticket } from "@/types/db";
import { useAhora } from "@/lib/useAhora";

type Vista = "abiertos" | "mios" | "asignados" | "cerrados" | "todos";

const VISTAS: { clave: Vista; texto: string }[] = [
  { clave: "abiertos", texto: "Abiertos" },
  { clave: "asignados", texto: "Asignados a mí" },
  { clave: "mios", texto: "Los que pedí" },
  { clave: "cerrados", texto: "Cerrados" },
  { clave: "todos", texto: "Todos" },
];

function Tarjeta({ titulo, valor, icono, tono }: { titulo: string; valor: string; icono: React.ReactNode; tono: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className={clsx("rounded-lg p-2", tono)}>{icono}</div>
      <div>
        <div className="text-xl leading-none font-semibold tabular-nums">{valor}</div>
        <div className="mt-1 text-xs text-slate-500">{titulo}</div>
      </div>
    </div>
  );
}

function Contenido() {
  const { yo, miembroPorId, clientePorId } = useDatos();
  const { tickets, cargando } = useTickets();
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const ahora = useAhora(true, 30000);

  const [vista, setVista] = useState<Vista>("abiertos");
  const [urgencia, setUrgencia] = useState<Prioridad | null>(null);
  const [q, setQ] = useState("");

  const abiertoId = params.get("ticket");
  const abierto = abiertoId ? tickets.find((t) => t.id === abiertoId) : null;
  const abrir = (id: string | null) => router.replace(id ? `${ruta}?ticket=${id}` : ruta, { scroll: false });

  const stats = useMemo(() => {
    const abiertos = tickets.filter(estaAbierto);
    const resueltos30 = tickets.filter(
      (t) => t.estado === "Resuelto" && t.resuelto_at && ahora - new Date(t.resuelto_at).getTime() < 30 * 86400000,
    );
    const prom = resueltos30.length
      ? resueltos30.reduce((s, t) => s + (new Date(t.resuelto_at!).getTime() - new Date(t.created_at).getTime()), 0) /
        resueltos30.length /
        3600000
      : null;
    const enSla = resueltos30.filter((t) => t.vence_at && t.resuelto_at! <= t.vence_at).length;
    return {
      abiertos: abiertos.length,
      urgentes: abiertos.filter((t) => t.urgencia === "Urgente").length,
      vencidos: abiertos.filter((t) => t.vence_at && new Date(t.vence_at).getTime() < ahora).length,
      promedio: prom === null ? "—" : prom < 48 ? `${Math.round(prom)} h` : `${Math.round(prom / 24)} d`,
      cumplimiento: resueltos30.length ? `${Math.round((enSla / resueltos30.length) * 100)}%` : "—",
    };
  }, [tickets, ahora]);

  const lista = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return tickets
      .filter((t) => {
        if (vista === "abiertos" && !estaAbierto(t)) return false;
        if (vista === "cerrados" && estaAbierto(t)) return false;
        if (vista === "mios" && t.solicitante_id !== yo.id) return false;
        if (vista === "asignados" && (t.asignado_id !== yo.id || !estaAbierto(t))) return false;
        if (urgencia && t.urgencia !== urgencia) return false;
        if (texto && !`${folio(t.numero)} ${t.titulo} ${t.descripcion}`.toLowerCase().includes(texto)) return false;
        return true;
      })
      .sort((a, b) => {
        const aa = estaAbierto(a), bb = estaAbierto(b);
        if (aa !== bb) return aa ? -1 : 1;
        if (aa) {
          const r = RANGO_URGENCIA[a.urgencia] - RANGO_URGENCIA[b.urgencia];
          if (r) return r;
          return (a.vence_at ?? "").localeCompare(b.vence_at ?? "");
        }
        return b.updated_at.localeCompare(a.updated_at);
      });
  }, [tickets, vista, urgencia, q, yo.id]);

  const conteo = (v: Vista) =>
    tickets.filter((t) =>
      v === "abiertos"
        ? estaAbierto(t)
        : v === "asignados"
          ? t.asignado_id === yo.id && estaAbierto(t)
          : v === "mios"
            ? t.solicitante_id === yo.id
            : v === "cerrados"
              ? !estaAbierto(t)
              : true,
    ).length;

  return (
    <>
      <Encabezado titulo="Tickets" subtitulo="Pide trabajo al equipo con urgencia y tiempo de respuesta">
        <NuevoTicket onCreado={(id) => abrir(id)} />
      </Encabezado>

      <div className="p-4 md:p-6">
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tarjeta titulo="Abiertos" valor={String(stats.abiertos)} icono={<Inbox size={18} />} tono="bg-marca-50 text-marca-700" />
          <Tarjeta titulo="Urgentes abiertos" valor={String(stats.urgentes)} icono={<Flame size={18} />} tono="bg-red-50 text-red-600" />
          <Tarjeta titulo="Fuera de SLA" valor={String(stats.vencidos)} icono={<AlarmClock size={18} />} tono="bg-amber-50 text-amber-600" />
          <Tarjeta
            titulo={`Resolución prom. · ${stats.cumplimiento} en SLA (30 d)`}
            valor={stats.promedio}
            icono={<Timer size={18} />}
            tono="bg-green-50 text-green-700"
          />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
            {VISTAS.map((v) => (
              <button
                key={v.clave}
                onClick={() => setVista(v.clave)}
                className={clsx(
                  "rounded-md px-3 py-1 text-sm",
                  vista === v.clave ? "bg-white font-medium shadow-sm" : "text-slate-600 hover:text-slate-900",
                )}
              >
                {v.texto} <span className="text-xs text-slate-400">{conteo(v.clave)}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {PRIORIDADES.map((p) => (
              <button
                key={p}
                onClick={() => setUrgencia(urgencia === p ? null : p)}
                className={clsx(
                  "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  urgencia === p ? "border-transparent text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50",
                )}
                style={urgencia === p ? { background: COLOR_PRIORIDAD[p] } : {}}
              >
                {p}
              </button>
            ))}
          </div>
          <label className="relative ml-auto w-full sm:w-64">
            <Search size={15} className="absolute top-2 left-2.5 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar TK-0001, texto…" className="campo pl-8" />
          </label>
        </div>

        <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {cargando && <li className="p-6 text-center text-sm text-slate-400">Cargando…</li>}
          {!cargando && lista.length === 0 && (
            <li className="p-10 text-center text-sm text-slate-400">
              No hay tickets aquí. ¿Necesitas algo? Dale a <b>Levantar ticket</b>.
            </li>
          )}
          {lista.map((t: Ticket) => {
            const sla = estadoSla(t, ahora);
            const asignado = t.asignado_id ? miembroPorId.get(t.asignado_id) : null;
            const solicitante = t.solicitante_id ? miembroPorId.get(t.solicitante_id) : null;
            return (
              <li key={t.id} className="border-b border-slate-100 last:border-0">
                <button
                  onClick={() => abrir(t.id)}
                  className={clsx("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50", abiertoId === t.id && "bg-marca-50/50")}
                >
                  <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: COLOR_PRIORIDAD[t.urgencia] }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <span className="font-mono font-semibold">{folio(t.numero)}</span>
                      <span className="rounded px-1.5 py-px font-semibold text-white" style={{ background: COLOR_ESTADO[t.estado] }}>
                        {t.estado}
                      </span>
                      <span className="font-semibold" style={{ color: COLOR_PRIORIDAD[t.urgencia] }}>
                        {t.urgencia}
                      </span>
                      <span>· {t.categoria}</span>
                      {t.cliente_id && <span>· {clientePorId.get(t.cliente_id)?.nombre}</span>}
                    </div>
                    <div className="truncate font-medium">{t.titulo}</div>
                    <div className="text-xs text-slate-500">Pidió {solicitante?.nombre ?? "—"}</div>
                  </div>
                  <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        sla.tono === "vencido" && "bg-red-100 text-red-700",
                        sla.tono === "alerta" && "bg-amber-100 text-amber-700",
                        sla.tono === "ok" && "bg-green-100 text-green-700",
                        sla.tono === "cerrado" && "bg-slate-100 text-slate-600",
                      )}
                    >
                      {sla.texto}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Avatar nombre={asignado?.nombre} foto={asignado?.foto_url} tam={18} />
                      {asignado?.nombre ?? "Sin asignar"}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {abierto && <DetalleTicket key={abierto.id} ticket={abierto} onCerrar={() => abrir(null)} />}
    </>
  );
}

export default function PaginaTickets() {
  return (
    <Suspense>
      <Contenido />
    </Suspense>
  );
}
