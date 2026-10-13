"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CheckCircle2, Clock, Download, ListTodo } from "lucide-react";
import Encabezado from "@/components/Encabezado";
import { useDatos } from "@/components/datos/DatosProvider";
import { supabaseNavegador } from "@/lib/supabase/client";
import { COLOR_PRIORIDAD, formatoFecha, hoyMx } from "@/lib/ui";
import type { Tarea } from "@/types/db";

// Colores validados (ΔE CVD 24.7 entre sí, contraste ≥ 3:1 sobre blanco).
const C_TERMINADAS = "#2a78d6";
const C_PENDIENTES = "#eb6834";
const C_HORAS = "#2a78d6";
const SUPERFICIE = "#ffffff";

interface FilaHoras {
  mes: string;
  miembro_id: string;
  miembro: string;
  cliente_id: string;
  cliente: string;
  horas: number;
  minutos: number;
}

/** Mes (AAAA-MM) en que "cae" una tarea; misma regla que la vista v_tareas_mes. */
function mesDeTarea(t: Tarea) {
  const fecha =
    (t.estatus === "Terminado" ? t.fecha_cierre : null) ??
    t.fecha_entrega ??
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date(t.created_at));
  return fecha.slice(0, 7);
}

function nombreMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
}

export default function DashboardPage() {
  const supabase = supabaseNavegador();
  const { tareas, miembros, miembroPorId, clientePorId, abrirTarea, temporizador, avisar } = useDatos();
  const [mes, setMes] = useState(hoyMx().slice(0, 7));
  const [horas, setHoras] = useState<FilaHoras[]>([]);
  const [personaCsv, setPersonaCsv] = useState("");

  // Horas del mes (se recarga al cambiar de mes o al detener un temporizador).
  useEffect(() => {
    let vigente = true;
    supabase
      .from("v_horas_mes")
      .select("*")
      .eq("mes", `${mes}-01`)
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) avisar(error.message);
        setHoras(((data as FilaHoras[]) ?? []).map((r) => ({ ...r, horas: Number(r.horas) })));
      });
    return () => {
      vigente = false;
    };
  }, [supabase, mes, temporizador?.id, avisar]);

  const delMes = useMemo(() => tareas.filter((t) => mesDeTarea(t) === mes), [tareas, mes]);
  const hoy = hoyMx();
  const vencidas = useMemo(
    () =>
      tareas
        .filter((t) => t.estatus !== "Terminado" && t.fecha_entrega && t.fecha_entrega < hoy)
        .sort((a, b) => a.fecha_entrega!.localeCompare(b.fecha_entrega!)),
    [tareas, hoy],
  );

  const porPersona = useMemo(() => {
    const mapa = new Map<string, { nombre: string; terminadas: number; pendientes: number }>();
    for (const t of delMes) {
      const k = t.responsable_id ?? "sin";
      const nombre = t.responsable_id ? (miembroPorId.get(t.responsable_id)?.nombre ?? "—") : "Sin asignar";
      const f = mapa.get(k) ?? { nombre, terminadas: 0, pendientes: 0 };
      if (t.estatus === "Terminado") f.terminadas++;
      else f.pendientes++;
      mapa.set(k, f);
    }
    return [...mapa.values()].sort((a, b) => b.terminadas + b.pendientes - (a.terminadas + a.pendientes));
  }, [delMes, miembroPorId]);

  const porCliente = useMemo(() => {
    const mapa = new Map<string, { nombre: string; terminadas: number; pendientes: number }>();
    for (const t of delMes) {
      const nombre = clientePorId.get(t.cliente_id)?.nombre ?? "—";
      const f = mapa.get(t.cliente_id) ?? { nombre, terminadas: 0, pendientes: 0 };
      if (t.estatus === "Terminado") f.terminadas++;
      else f.pendientes++;
      mapa.set(t.cliente_id, f);
    }
    return [...mapa.values()].sort((a, b) => b.terminadas + b.pendientes - (a.terminadas + a.pendientes));
  }, [delMes, clientePorId]);

  const horasPorPersona = useMemo(() => agrupar(horas, "miembro"), [horas]);
  const horasPorCliente = useMemo(() => agrupar(horas, "cliente"), [horas]);

  const terminadas = delMes.filter((t) => t.estatus === "Terminado").length;
  const pendientes = delMes.length - terminadas;
  const totalHoras = horas.reduce((s, r) => s + r.horas, 0);

  const urlCsv = `/api/reporte?mes=${mes}${personaCsv ? `&miembro=${personaCsv}` : ""}`;

  return (
    <>
      <Encabezado titulo="Dashboard" subtitulo={`Resumen de ${nombreMes(mes)}`}>
        <input
          type="month"
          value={mes}
          onChange={(e) => e.target.value && setMes(e.target.value)}
          className="campo w-44"
        />
        <div className="flex items-center gap-1">
          <select value={personaCsv} onChange={(e) => setPersonaCsv(e.target.value)} className="campo w-40">
            <option value="">Todas las personas</option>
            {miembros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
          <a href={urlCsv} className="btn-secundario" download>
            <Download size={15} /> CSV
          </a>
        </div>
      </Encabezado>

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icono={<CheckCircle2 size={18} />} titulo="Terminadas en el mes" valor={terminadas} />
          <Kpi icono={<ListTodo size={18} />} titulo="Pendientes del mes" valor={pendientes} />
          <Kpi
            icono={<AlertTriangle size={18} />}
            titulo="Vencidas hoy"
            valor={vencidas.length}
            alerta={vencidas.length > 0}
          />
          <Kpi icono={<Clock size={18} />} titulo="Horas registradas" valor={totalHoras.toFixed(1)} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Tarjeta titulo="Terminadas vs pendientes por persona">
            <GraficaEstado datos={porPersona} />
          </Tarjeta>
          <Tarjeta titulo="Terminadas vs pendientes por cliente">
            <GraficaEstado datos={porCliente} />
          </Tarjeta>
          <Tarjeta titulo="Horas por persona">
            <GraficaHoras datos={horasPorPersona} />
          </Tarjeta>
          <Tarjeta titulo="Horas por cliente">
            <GraficaHoras datos={horasPorCliente} />
          </Tarjeta>
        </div>

        <Tarjeta titulo={`Tareas vencidas (${vencidas.length})`}>
          {vencidas.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No hay tareas vencidas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-xs text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="py-2 text-left font-medium">Tarea</th>
                    <th className="py-2 text-left font-medium">Cliente</th>
                    <th className="py-2 text-left font-medium">Responsable</th>
                    <th className="py-2 text-left font-medium">Prioridad</th>
                    <th className="py-2 text-left font-medium">Entrega</th>
                    <th className="py-2 text-right font-medium">Días de atraso</th>
                  </tr>
                </thead>
                <tbody>
                  {vencidas.map((t) => {
                    const dias = Math.round(
                      (Date.parse(hoy) - Date.parse(t.fecha_entrega!)) / 86400000,
                    );
                    return (
                      <tr
                        key={t.id}
                        onClick={() => abrirTarea(t.id)}
                        className="cursor-pointer border-b border-slate-50 hover:bg-slate-50"
                      >
                        <td className="py-2 pr-2 font-medium">{t.titulo}</td>
                        <td className="py-2 pr-2 text-slate-600">{clientePorId.get(t.cliente_id)?.nombre}</td>
                        <td className="py-2 pr-2 text-slate-600">
                          {t.responsable_id ? miembroPorId.get(t.responsable_id)?.nombre : "Sin asignar"}
                        </td>
                        <td className="py-2 pr-2">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: COLOR_PRIORIDAD[t.prioridad] }}
                            />
                            {t.prioridad}
                          </span>
                        </td>
                        <td className="py-2 pr-2 text-slate-600">{formatoFecha(t.fecha_entrega)}</td>
                        <td className="py-2 text-right font-semibold text-red-600 tabular-nums">{dias}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
        <p className="text-xs text-slate-400">
          Una tarea cuenta en el mes de su fecha de cierre (si está terminada) o de su fecha de entrega
          (si está pendiente; sin fecha de entrega, el mes en que se creó). Las horas cuentan en el mes
          en que se registraron.
        </p>
      </div>
    </>
  );
}

function agrupar(filas: FilaHoras[], por: "miembro" | "cliente") {
  const mapa = new Map<string, number>();
  for (const r of filas) mapa.set(r[por], (mapa.get(r[por]) ?? 0) + r.horas);
  return [...mapa.entries()]
    .map(([nombre, horas]) => ({ nombre, horas: Math.round(horas * 100) / 100 }))
    .sort((a, b) => b.horas - a.horas);
}

function Kpi({
  icono,
  titulo,
  valor,
  alerta,
}: {
  icono: React.ReactNode;
  titulo: string;
  valor: number | string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className={"mb-2 flex items-center gap-2 text-xs " + (alerta ? "text-red-600" : "text-slate-500")}>
        {icono}
        {titulo}
      </div>
      <div className="text-3xl font-semibold text-slate-900 tabular-nums">{valor}</div>
    </div>
  );
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{titulo}</h2>
      {children}
    </section>
  );
}

const ejeTexto = { fontSize: 12, fill: "#475569" };

function Vacio() {
  return <p className="py-10 text-center text-sm text-slate-400">Sin datos para este mes.</p>;
}

function Leyenda() {
  return (
    <div className="mb-2 flex gap-4 text-xs text-slate-600">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: C_TERMINADAS }} /> Terminadas
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: C_PENDIENTES }} /> Pendientes
      </span>
    </div>
  );
}

function TooltipCaja({
  active,
  payload,
  label,
  unidad,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  unidad: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-slate-800">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: p.color }} />
          {p.name}: <b className="text-slate-900 tabular-nums">{p.value}</b> {unidad}
        </div>
      ))}
    </div>
  );
}

function GraficaEstado({ datos }: { datos: { nombre: string; terminadas: number; pendientes: number }[] }) {
  if (datos.length === 0) return <Vacio />;
  // El total va junto al nombre: siempre visible aunque un segmento sea 0.
  const filas = datos.map((d) => ({ ...d, etiqueta: `${d.nombre} (${d.terminadas + d.pendientes})` }));
  return (
    <>
      <Leyenda />
      <ResponsiveContainer width="100%" height={filas.length * 34 + 30}>
        <BarChart data={filas} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="#eef0f4" />
          <XAxis type="number" allowDecimals={false} tick={ejeTexto} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="etiqueta" width={150} tick={ejeTexto} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "#f1f5f9" }} content={<TooltipCaja unidad="tareas" />} />
          <Bar dataKey="terminadas" name="Terminadas" stackId="a" fill={C_TERMINADAS} stroke={SUPERFICIE} strokeWidth={2} />
          <Bar
            dataKey="pendientes"
            name="Pendientes"
            stackId="a"
            fill={C_PENDIENTES}
            stroke={SUPERFICIE}
            strokeWidth={2}
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

function GraficaHoras({ datos }: { datos: { nombre: string; horas: number }[] }) {
  if (datos.length === 0) return <Vacio />;
  return (
    <ResponsiveContainer width="100%" height={datos.length * 34 + 30}>
      <BarChart data={datos} layout="vertical" margin={{ left: 8, right: 44 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke="#eef0f4" />
        <XAxis type="number" tick={ejeTexto} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="nombre" width={120} tick={ejeTexto} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} content={<TooltipCaja unidad="h" />} />
        <Bar dataKey="horas" name="Horas" fill={C_HORAS} radius={[0, 4, 4, 0]}>
          <LabelList
            dataKey="horas"
            position="right"
            formatter={(v: unknown) => `${Number(v).toFixed(1)} h`}
            style={{ fontSize: 12, fill: "#334155" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
