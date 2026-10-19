"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ExternalLink, Trash2, X } from "lucide-react";
import { useDatos } from "@/components/datos/DatosProvider";
import EtiquetaSelect from "@/components/ui/EtiquetaSelect";
import SelectorMiembro from "@/components/ui/SelectorMiembro";
import { CeldaFecha } from "@/components/ui/Celdas";
import { COLOR_ESTATUS, COLOR_PRIORIDAD, estaVencida, formatoFechaHora } from "@/lib/ui";
import { ESTATUS, PRIORIDADES, type Tarea, type TareaEditable } from "@/types/db";

import { PestanaComentarios, PestanaHistorial, PestanaTiempo } from "./Pestanas";
import PestanaArchivos from "./PestanaArchivos";

type Pestana = "detalle" | "archivos" | "comentarios" | "tiempo" | "historial";

const PESTANAS: { clave: Pestana; texto: string }[] = [
  { clave: "detalle", texto: "Detalle" },
  { clave: "archivos", texto: "Archivos" },
  { clave: "comentarios", texto: "Comentarios" },
  { clave: "tiempo", texto: "Tiempo" },
  { clave: "historial", texto: "Historial" },
];

/** Panel lateral con el detalle completo de la tarea abierta. */
export default function PanelTarea() {
  const { tareaAbiertaId, abrirTarea, tareas } = useDatos();
  const tarea = tareas.find((t) => t.id === tareaAbiertaId) ?? null;
  const [pestana, setPestana] = useState<Pestana>("detalle");

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as HTMLElement).closest("input,textarea,select")) abrirTarea(null);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abrirTarea]);

  if (!tareaAbiertaId) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/10" onClick={() => abrirTarea(null)} />
      <aside className="fixed top-0 right-0 bottom-0 z-50 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl">
        {!tarea ? (
          <div className="p-6 text-sm text-slate-500">
            Esta tarea ya no existe.
            <button className="btn-secundario ml-3" onClick={() => abrirTarea(null)}>
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <Encabezado tarea={tarea} />
            <nav className="flex gap-1 border-b border-slate-200 px-4">
              {PESTANAS.map((p) => (
                <button
                  key={p.clave}
                  onClick={() => setPestana(p.clave)}
                  className={clsx(
                    "-mb-px border-b-2 px-3 py-2 text-sm",
                    pestana === p.clave
                      ? "border-marca-600 font-medium text-marca-700"
                      : "border-transparent text-slate-500 hover:text-slate-800",
                  )}
                >
                  {p.texto}
                </button>
              ))}
            </nav>
            <div className="flex-1 overflow-y-auto p-5">
              {pestana === "detalle" && <Detalle tarea={tarea} />}
              {pestana === "archivos" && <PestanaArchivos key={tarea.id} tarea={tarea} />}
              {pestana === "comentarios" && <PestanaComentarios key={tarea.id} tarea={tarea} />}
              {pestana === "tiempo" && <PestanaTiempo key={tarea.id} tarea={tarea} />}
              {pestana === "historial" && <PestanaHistorial key={tarea.id} tarea={tarea} />}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function Encabezado({ tarea }: { tarea: Tarea }) {
  const { abrirTarea, actualizarTarea, borrarTarea, esAdmin, clientePorId } = useDatos();
  const [titulo, setTitulo] = useState(tarea.titulo);
  const [previo, setPrevio] = useState(tarea.titulo);
  if (tarea.titulo !== previo) {
    setPrevio(tarea.titulo);
    setTitulo(tarea.titulo);
  }

  return (
    <header className="flex items-start gap-2 border-b border-slate-100 p-4">
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-xs text-slate-500">{clientePorId.get(tarea.cliente_id)?.nombre}</div>
        <textarea
          value={titulo}
          rows={2}
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={() => {
            const t = titulo.trim();
            if (!t) setTitulo(tarea.titulo);
            else if (t !== tarea.titulo) actualizarTarea(tarea.id, { titulo: t });
          }}
          className="w-full resize-none rounded-md px-1 text-lg font-semibold outline-none focus:ring-2 focus:ring-marca-100"
        />
      </div>
      {esAdmin && (
        <button
          title="Borrar tarea"
          onClick={() => confirm(`¿Borrar la tarea "${tarea.titulo}"?`) && borrarTarea(tarea.id)}
          className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={18} />
        </button>
      )}
      <button
        title="Cerrar (Esc)"
        onClick={() => abrirTarea(null)}
        className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <X size={18} />
      </button>
    </header>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] items-center gap-3 py-1.5">
      <span className="text-sm text-slate-500">{etiqueta}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Detalle({ tarea }: { tarea: Tarea }) {
  const { actualizarTarea, clientes, miembroPorId } = useDatos();
  const guardar = (c: TareaEditable) => actualizarTarea(tarea.id, c);

  return (
    <div className="flex flex-col">
      <Fila etiqueta="Cliente">
        <select
          value={tarea.cliente_id}
          onChange={(e) => guardar({ cliente_id: e.target.value })}
          className="campo"
        >
          {clientes
            .filter((c) => c.activo || c.id === tarea.cliente_id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
        </select>
      </Fila>
      <Fila etiqueta="Responsable">
        <SelectorMiembro valor={tarea.responsable_id} onCambiar={(v) => guardar({ responsable_id: v })} />
      </Fila>
      <Fila etiqueta="Estatus">
        <div className="w-56">
          <EtiquetaSelect
            compacta
            valor={tarea.estatus}
            opciones={ESTATUS}
            colores={COLOR_ESTATUS}
            onCambiar={(v) => guardar({ estatus: v })}
          />
        </div>
      </Fila>
      <Fila etiqueta="Prioridad">
        <div className="w-56">
          <EtiquetaSelect
            compacta
            valor={tarea.prioridad}
            opciones={PRIORIDADES}
            colores={COLOR_PRIORIDAD}
            onCambiar={(v) => guardar({ prioridad: v })}
          />
        </div>
      </Fila>
      <Fila etiqueta="Requiere QA">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={tarea.qa}
            onChange={(e) => guardar({ qa: e.target.checked })}
            className="h-4 w-4 accent-marca-600"
          />
          {tarea.qa ? "Sí" : "No"}
        </label>
      </Fila>
      <Fila etiqueta="Fecha de inicio">
        <div className="w-44 rounded-md border border-slate-300">
          <CeldaFecha valor={tarea.fecha_inicio} onGuardar={(v) => guardar({ fecha_inicio: v })} />
        </div>
      </Fila>
      <Fila etiqueta="Fecha de entrega">
        <div className="flex items-center gap-2">
          <div className="w-44 rounded-md border border-slate-300">
            <CeldaFecha
              valor={tarea.fecha_entrega}
              alerta={estaVencida(tarea)}
              onGuardar={(v) => guardar({ fecha_entrega: v })}
            />
          </div>
          {estaVencida(tarea) && <span className="text-xs font-medium text-red-600">Vencida</span>}
        </div>
      </Fila>
      <Fila etiqueta="Fecha de cierre">
        <div className="w-44 rounded-md border border-slate-300">
          <CeldaFecha valor={tarea.fecha_cierre} onGuardar={(v) => guardar({ fecha_cierre: v })} />
        </div>
      </Fila>
      <Fila etiqueta="Proyecto">
        <CampoTexto
          valor={tarea.proyecto}
          lista="lista-proyectos"
          placeholder="Ej. Migración VPS"
          onGuardar={(v) => guardar({ proyecto: v })}
        />
      </Fila>
      <Fila etiqueta="Documento principal">
        <div className="flex items-center gap-2">
          <CampoTexto
            valor={tarea.documento_url}
            placeholder="https://…"
            onGuardar={(v) => guardar({ documento_url: v })}
          />
          {tarea.documento_url && (
            <a
              href={tarea.documento_url}
              target="_blank"
              rel="noreferrer"
              className="btn-secundario shrink-0"
              title="Abrir documento"
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </Fila>

      <div className="mt-4">
        <label className="etiqueta">Comentarios / notas</label>
        <CampoTexto
          multilinea
          valor={tarea.comentarios}
          placeholder="Notas generales de la tarea"
          onGuardar={(v) => guardar({ comentarios: v })}
        />
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Creada {formatoFechaHora(tarea.created_at)}
        {tarea.creado_por && ` por ${miembroPorId.get(tarea.creado_por)?.nombre ?? "—"}`} · Actualizada{" "}
        {formatoFechaHora(tarea.updated_at)}
      </p>
    </div>
  );
}

function CampoTexto({
  valor,
  onGuardar,
  placeholder,
  lista,
  multilinea,
}: {
  valor: string | null;
  onGuardar: (v: string | null) => void;
  placeholder?: string;
  lista?: string;
  multilinea?: boolean;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  const [previo, setPrevio] = useState(valor);
  if (valor !== previo) {
    setPrevio(valor);
    setTexto(valor ?? "");
  }
  const guardar = () => {
    const limpio = texto.trim() || null;
    if (limpio !== (valor ?? null)) onGuardar(limpio);
  };
  if (multilinea)
    return (
      <textarea
        value={texto}
        rows={4}
        placeholder={placeholder}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardar}
        className="campo resize-y"
      />
    );
  return (
    <input
      value={texto}
      list={lista}
      placeholder={placeholder}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="campo"
    />
  );
}
