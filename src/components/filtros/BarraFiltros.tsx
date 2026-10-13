"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import clsx from "clsx";
import { useDatos } from "@/components/datos/DatosProvider";
import { ESTATUS, PRIORIDADES } from "@/types/db";
import { useFiltros, type CampoFecha, type Filtros } from "./useFiltros";

type Ocultable = "cliente" | "responsable" | "estatus";

export default function BarraFiltros({ ocultar = [] }: { ocultar?: Ocultable[] }) {
  const { clientes, miembros, proyectos } = useDatos();
  const { filtros, cambiar, limpiar, activos } = useFiltros();
  const [texto, setTexto] = useState(filtros.q);

  // Búsqueda con pequeño retraso para no reescribir la URL en cada tecla.
  useEffect(() => {
    const id = setTimeout(() => {
      if (texto !== filtros.q) cambiar({ q: texto });
    }, 250);
    return () => clearTimeout(id);
  }, [texto, filtros.q, cambiar]);

  const sel = (clave: keyof Filtros, valor: string, children: React.ReactNode, ancho = "w-auto max-w-56") => (
    <select
      value={valor}
      onChange={(e) => cambiar({ [clave]: e.target.value })}
      className={clsx("campo py-1", ancho, valor && "border-marca-500 bg-marca-50 text-marca-700")}
    >
      {children}
    </select>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 md:px-6">
      <div className="relative">
        <Search size={15} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar…"
          className="campo w-52 py-1 pl-8"
        />
      </div>

      {!ocultar.includes("cliente") &&
        sel(
          "cliente",
          filtros.cliente,
          <>
            <option value="">Todos los clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </>,
        )}

      {!ocultar.includes("responsable") &&
        sel(
          "responsable",
          filtros.responsable,
          <>
            <option value="">Todos los responsables</option>
            <option value="sin">Sin asignar</option>
            {miembros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </>,
        )}

      {!ocultar.includes("estatus") &&
        sel(
          "estatus",
          filtros.estatus,
          <>
            <option value="">Todos los estatus</option>
            {ESTATUS.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </>,
        )}

      {sel(
        "prioridad",
        filtros.prioridad,
        <>
          <option value="">Toda prioridad</option>
          {PRIORIDADES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </>,
      )}

      {sel(
        "proyecto",
        filtros.proyecto,
        <>
          <option value="">Todos los proyectos</option>
          <option value="sin">Sin proyecto</option>
          {proyectos.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </>,
      )}

      <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-300 bg-white px-1.5">
        <select
          value={filtros.campoFecha}
          onChange={(e) => cambiar({ campoFecha: e.target.value as CampoFecha })}
          className="bg-transparent py-1 text-xs text-slate-600 outline-none"
          title="Campo de fecha a filtrar"
        >
          <option value="entrega">Entrega</option>
          <option value="inicio">Inicio</option>
          <option value="cierre">Cierre</option>
        </select>
        <input
          type="date"
          value={filtros.desde}
          onChange={(e) => cambiar({ desde: e.target.value })}
          className="bg-transparent py-1 text-xs outline-none"
          title="Desde"
        />
        <span className="text-xs text-slate-400">→</span>
        <input
          type="date"
          value={filtros.hasta}
          onChange={(e) => cambiar({ hasta: e.target.value })}
          className="bg-transparent py-1 text-xs outline-none"
          title="Hasta"
        />
      </div>

      {!ocultar.includes("estatus") && (
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={filtros.ocultarTerminadas}
            onChange={(e) => cambiar({ ocultarTerminadas: e.target.checked })}
            className="accent-marca-600"
          />
          Ocultar terminadas
        </label>
      )}

      {activos > 0 && (
        <button
          onClick={() => {
            setTexto("");
            limpiar();
          }}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
        >
          <X size={13} /> Limpiar ({activos})
        </button>
      )}
    </div>
  );
}
