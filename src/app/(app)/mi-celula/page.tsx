"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import {
  AlertTriangle,
  CalendarClock,
  CalendarX,
  CheckCircle2,
  Crown,
  Flame,
  ListTodo,
  Loader,
  SearchCheck,
} from "lucide-react";
import Encabezado from "@/components/Encabezado";
import NuevaTarea from "@/components/NuevaTarea";
import TablaTareas, { type Agrupacion } from "@/components/tabla/TablaTareas";
import Kanban from "@/components/kanban/Kanban";
import BarraFiltros from "@/components/filtros/BarraFiltros";
import { aplicarFiltros, useFiltros } from "@/components/filtros/useFiltros";
import { useDatos } from "@/components/datos/DatosProvider";
import Avatar from "@/components/ui/Avatar";
import { COLOR_ESTATUS, estaVencida, hoyMx } from "@/lib/ui";
import { ESTATUS, type Miembro, type Tarea } from "@/types/db";

// ---------------------------------------------------------------- vistas rápidas
type Rapida = "" | "vencidas" | "semana" | "urgentes" | "sinfecha" | "qa";

function sumarDias(iso: string, dias: number) {
  const [a, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}

function criterioRapida(r: Rapida, hoy: string): (t: Tarea) => boolean {
  const activa = (t: Tarea) => t.estatus !== "Terminado";
  const enSemana = sumarDias(hoy, 7);
  switch (r) {
    case "vencidas":
      return estaVencida;
    case "semana":
      return (t) => activa(t) && !!t.fecha_entrega && t.fecha_entrega >= hoy && t.fecha_entrega <= enSemana;
    case "urgentes":
      return (t) => activa(t) && (t.prioridad === "Urgente" || t.prioridad === "Alta");
    case "sinfecha":
      return (t) => activa(t) && !t.fecha_entrega;
    case "qa":
      return (t) => t.estatus === "En QA";
    default:
      return () => true;
  }
}

const RAPIDAS: { clave: Rapida; texto: string; icono: React.ElementType }[] = [
  { clave: "", texto: "Todas", icono: ListTodo },
  { clave: "vencidas", texto: "Vencidas", icono: AlertTriangle },
  { clave: "semana", texto: "Vencen en 7 días", icono: CalendarClock },
  { clave: "urgentes", texto: "Urgentes / Alta", icono: Flame },
  { clave: "sinfecha", texto: "Sin fecha de entrega", icono: CalendarX },
  { clave: "qa", texto: "En QA", icono: SearchCheck },
];

const AGRUPACIONES: { clave: Agrupacion; texto: string }[] = [
  { clave: "responsable", texto: "Integrante" },
  { clave: "estatus", texto: "Estatus" },
  { clave: "prioridad", texto: "Prioridad" },
  { clave: "cliente", texto: "Cliente" },
];

// ------------------------------------------------------------------------ página
function Contenido() {
  const { yo, esAdmin, celulas, miembros, tareas, cargando, clientePorId, miembroPorId } = useDatos();
  const params = useSearchParams();
  const router = useRouter();
  const ruta = usePathname();
  const { filtros, cambiar } = useFiltros();
  const [vista, setVista] = useState<"tabla" | "kanban">("tabla");

  const setParam = useCallback(
    (clave: string, valor: string) => {
      const n = new URLSearchParams(params.toString());
      if (valor) n.set(clave, valor);
      else n.delete(clave);
      // Al cambiar de célula, el filtro de responsable ya no aplica.
      if (clave === "celula") n.delete("responsable");
      const qs = n.toString();
      router.replace(qs ? `${ruta}?${qs}` : ruta, { scroll: false });
    },
    [params, router, ruta],
  );

  // Célula que coordino (o a la que pertenezco); si no, la primera.
  const miCelula = celulas.find((c) => c.lider_id === yo.id) ?? celulas.find((c) => c.id === yo.celula_id);
  const celulaId = params.get("celula") || miCelula?.id || celulas[0]?.id || "";
  const celula = celulas.find((c) => c.id === celulaId);
  const agrupar = (params.get("agrupar") as Agrupacion) || "responsable";
  const rapida = (params.get("rapida") as Rapida) || "";

  const equipo = useMemo<Miembro[]>(() => {
    if (!celula) return [];
    const lista = miembros.filter(
      (m) => m.activo && (m.celula_id === celula.id || m.id === celula.lider_id),
    );
    return lista.sort((a, b) =>
      a.id === celula.lider_id ? -1 : b.id === celula.lider_id ? 1 : a.nombre.localeCompare(b.nombre),
    );
  }, [miembros, celula]);
  const idsEquipo = useMemo(() => new Set(equipo.map((m) => m.id)), [equipo]);

  const hoy = hoyMx();
  const mesActual = hoy.slice(0, 7);

  // Todas las tareas del equipo (sin filtros): base de los indicadores.
  const delEquipo = useMemo(
    () => tareas.filter((t) => t.responsable_id && idsEquipo.has(t.responsable_id)),
    [tareas, idsEquipo],
  );

  // Lo que se ve en la tabla: filtros de la barra + vista rápida.
  const visibles = useMemo(() => {
    const criterio = criterioRapida(rapida, hoy);
    return aplicarFiltros(delEquipo, filtros, clientePorId, miembroPorId).filter(criterio);
  }, [delEquipo, filtros, clientePorId, miembroPorId, rapida, hoy]);

  const conteoRapidas = useMemo(() => {
    const r = {} as Record<Rapida, number>;
    for (const { clave } of RAPIDAS) r[clave] = delEquipo.filter(criterioRapida(clave, hoy)).length;
    return r;
  }, [delEquipo, hoy]);

  const activas = delEquipo.filter((t) => t.estatus !== "Terminado");
  const kpis = {
    activas: activas.length,
    proceso: delEquipo.filter((t) => t.estatus === "En Proceso").length,
    qa: conteoRapidas.qa,
    vencidas: conteoRapidas.vencidas,
    urgentes: conteoRapidas.urgentes,
    terminadasMes: delEquipo.filter((t) => t.estatus === "Terminado" && t.fecha_cierre?.startsWith(mesActual))
      .length,
  };

  const base = useMemo(() => ({}), []);

  // --------------------------------------------------------------- estados vacíos
  if (!esAdmin)
    return (
      <>
        <Encabezado titulo="Mi célula" />
        <Aviso>Este tablero es para los coordinadores (admin) de cada célula.</Aviso>
      </>
    );

  if (!cargando && celulas.length === 0)
    return (
      <>
        <Encabezado titulo="Mi célula" />
        <Aviso>
          Todavía no hay células. Aplica la migración <code>20261023000001_celulas.sql</code> en Supabase.
        </Aviso>
      </>
    );

  const lider = celula?.lider_id ? miembroPorId.get(celula.lider_id) : null;

  return (
    <>
      <Encabezado
        titulo={celula ? `${celula.nombre} · ${celula.area}` : "Mi célula"}
        subtitulo={
          celula
            ? `${lider ? `Líder: ${lider.nombre}` : "Sin líder asignado"} · ${equipo.length} integrantes`
            : undefined
        }
      >
        <select
          value={celulaId}
          onChange={(e) => setParam("celula", e.target.value)}
          className="campo w-64"
          title="Ver otra célula"
        >
          {celulas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} · {c.area}
              {c.id === miCelula?.id ? " (mía)" : ""}
            </option>
          ))}
        </select>
        <div className="flex rounded-md border border-slate-300 p-0.5 text-sm">
          {(["tabla", "kanban"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={clsx(
                "rounded px-3 py-1 capitalize",
                vista === v ? "bg-marca-600 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <NuevaTarea />
      </Encabezado>

      {equipo.length === 0 ? (
        <Aviso>
          Esta célula aún no tiene integrantes. Asígnalos en{" "}
          <Link href="/equipo" className="font-medium text-marca-600 hover:underline">
            Equipo → columna Célula
          </Link>
          .
        </Aviso>
      ) : (
        <>
          <div className="flex flex-col gap-4 p-4 pb-2 md:px-6">
            {/* Indicadores */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <Kpi icono={<ListTodo size={16} />} titulo="Activas" valor={kpis.activas} />
              <Kpi icono={<Loader size={16} />} titulo="En proceso" valor={kpis.proceso} />
              <Kpi icono={<SearchCheck size={16} />} titulo="En QA" valor={kpis.qa} />
              <Kpi
                icono={<AlertTriangle size={16} />}
                titulo="Vencidas"
                valor={kpis.vencidas}
                alerta={kpis.vencidas > 0}
                onClick={() => setParam("rapida", rapida === "vencidas" ? "" : "vencidas")}
              />
              <Kpi
                icono={<Flame size={16} />}
                titulo="Urgentes / Alta activas"
                valor={kpis.urgentes}
                onClick={() => setParam("rapida", rapida === "urgentes" ? "" : "urgentes")}
              />
              <Kpi icono={<CheckCircle2 size={16} />} titulo="Terminadas este mes" valor={kpis.terminadasMes} />
            </div>

            {/* Carga por integrante */}
            <section>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-sm font-semibold text-slate-700">Carga del equipo</h2>
                <span className="text-xs text-slate-400">Clic en una persona para ver solo sus tareas</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {equipo.map((m) => (
                  <TarjetaIntegrante
                    key={m.id}
                    miembro={m}
                    esLider={m.id === celula?.lider_id}
                    tareas={delEquipo.filter((t) => t.responsable_id === m.id)}
                    mes={mesActual}
                    activo={filtros.responsable === m.id}
                    onClick={() => cambiar({ responsable: filtros.responsable === m.id ? "" : m.id })}
                  />
                ))}
              </div>
            </section>

            {/* Clasificación */}
            <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Agrupar por</span>
                <div className="flex rounded-md border border-slate-300 p-0.5 text-xs">
                  {AGRUPACIONES.map((a) => (
                    <button
                      key={a.clave}
                      onClick={() => setParam("agrupar", a.clave === "responsable" ? "" : a.clave)}
                      disabled={vista === "kanban"}
                      className={clsx(
                        "rounded px-2.5 py-1 disabled:opacity-40",
                        agrupar === a.clave ? "bg-marca-600 text-white" : "text-slate-600 hover:bg-slate-100",
                      )}
                    >
                      {a.texto}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500">Vista rápida</span>
                {RAPIDAS.map(({ clave, texto, icono: Icono }) => (
                  <button
                    key={clave || "todas"}
                    onClick={() => setParam("rapida", clave)}
                    className={clsx(
                      "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
                      rapida === clave
                        ? "border-marca-500 bg-marca-50 font-medium text-marca-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    <Icono size={13} />
                    {texto}
                    <span className="tabular-nums text-slate-400">{conteoRapidas[clave]}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <BarraFiltros
            miembros={equipo}
            ocultar={vista === "kanban" ? ["estatus"] : []}
          />
          <div className="px-4 pt-2 text-xs text-slate-500 md:px-6">
            {visibles.length} de {delEquipo.length} tareas del equipo
          </div>
          {vista === "tabla" ? (
            <TablaTareas
              tareas={visibles}
              agruparPor={agrupar}
              miembrosGrupo={equipo}
              baseNueva={base}
              mostrarGruposVacios={agrupar === "responsable" && !rapida && !filtros.responsable}
            />
          ) : (
            <Kanban tareas={visibles} />
          )}
        </>
      )}
    </>
  );
}

// -------------------------------------------------------------------- piezas
function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="m-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

function Kpi({
  icono,
  titulo,
  valor,
  alerta,
  onClick,
}: {
  icono: React.ReactNode;
  titulo: string;
  valor: number;
  alerta?: boolean;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={clsx(
        "rounded-xl border border-slate-200 bg-white p-3 text-left",
        onClick && "hover:border-marca-500",
      )}
    >
      <div className={clsx("mb-1 flex items-center gap-1.5 text-xs", alerta ? "text-red-600" : "text-slate-500")}>
        {icono}
        {titulo}
      </div>
      <div className={clsx("text-2xl font-semibold tabular-nums", alerta ? "text-red-600" : "text-slate-900")}>
        {valor}
      </div>
    </Comp>
  );
}

function TarjetaIntegrante({
  miembro: m,
  esLider,
  tareas,
  mes,
  activo,
  onClick,
}: {
  miembro: Miembro;
  esLider: boolean;
  tareas: Tarea[];
  mes: string;
  activo: boolean;
  onClick: () => void;
}) {
  const activas = tareas.filter((t) => t.estatus !== "Terminado");
  const vencidas = activas.filter(estaVencida).length;
  const terminadasMes = tareas.filter((t) => t.estatus === "Terminado" && t.fecha_cierre?.startsWith(mes)).length;

  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex flex-col gap-2 rounded-xl border bg-white p-3 text-left transition-colors",
        activo ? "border-marca-500 ring-2 ring-marca-500/20" : "border-slate-200 hover:border-slate-300",
      )}
    >
      <div className="flex items-center gap-2.5">
        <Avatar nombre={m.nombre} foto={m.foto_url} tam={34} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 truncate text-sm font-medium">
            {m.nombre}
            {esLider && <Crown size={13} className="shrink-0 text-amber-500" aria-label="Líder" />}
          </div>
          <div className="truncate text-xs text-slate-500">{m.puesto || (esLider ? "Team Leader" : "—")}</div>
        </div>
      </div>
      <div className="flex gap-3 text-xs text-slate-600">
        <span>
          <b className="text-sm text-slate-900 tabular-nums">{activas.length}</b> activas
        </span>
        <span className={vencidas ? "text-red-600" : ""}>
          <b className="text-sm tabular-nums">{vencidas}</b> vencidas
        </span>
        <span>
          <b className="text-sm text-slate-900 tabular-nums">{terminadasMes}</b> terminadas mes
        </span>
      </div>
      {/* Distribución por estatus */}
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        {tareas.length > 0 &&
          ESTATUS.map((e) => {
            const n = tareas.filter((t) => t.estatus === e).length;
            if (!n) return null;
            return (
              <div
                key={e}
                title={`${e}: ${n}`}
                style={{ width: `${(n / tareas.length) * 100}%`, backgroundColor: COLOR_ESTATUS[e] }}
              />
            );
          })}
      </div>
    </button>
  );
}

export default function MiCelulaPage() {
  return (
    <Suspense>
      <Contenido />
    </Suspense>
  );
}
