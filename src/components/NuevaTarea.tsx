"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useDatos } from "@/components/datos/DatosProvider";
import Portal from "@/components/ui/Portal";
import { ESTATUS, PRIORIDADES, type Estatus, type Prioridad } from "@/types/db";

/** Botón + modal para crear una tarea con los datos mínimos. */
export default function NuevaTarea({
  responsableInicial,
  estatusInicial = "Backlog",
}: {
  responsableInicial?: string | null;
  estatusInicial?: Estatus;
}) {
  const { clientes, miembros, crearTarea, abrirTarea, yo } = useDatos();
  const [abierto, setAbierto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [responsableId, setResponsableId] = useState<string>(responsableInicial ?? yo.id);
  const [estatus, setEstatus] = useState<Estatus>(estatusInicial);
  const [prioridad, setPrioridad] = useState<Prioridad>("Media");
  const [entrega, setEntrega] = useState("");
  const [guardando, setGuardando] = useState(false);

  const activos = clientes.filter((c) => c.activo);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !clienteId) return;
    setGuardando(true);
    const t = await crearTarea({
      titulo: titulo.trim(),
      cliente_id: clienteId,
      responsable_id: responsableId || null,
      estatus,
      prioridad,
      fecha_entrega: entrega || null,
    });
    setGuardando(false);
    if (t) {
      setAbierto(false);
      setTitulo("");
      setEntrega("");
      abrirTarea(t.id);
    }
  }

  return (
    <>
      <button className="btn-primario" onClick={() => setAbierto(true)}>
        <Plus size={16} /> Nueva tarea
      </button>
      {abierto && (
        <Portal>
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/30 p-4 pt-[12vh]">
          <form
            onSubmit={crear}
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
            onKeyDown={(e) => e.key === "Escape" && setAbierto(false)}
          >
            <h2 className="mb-4 text-base font-semibold">Nueva tarea</h2>
            <label className="etiqueta">Tarea *</label>
            <input
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="campo mb-3"
              placeholder="¿Qué hay que hacer?"
            />
            <label className="etiqueta">Cliente *</label>
            <select
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              className="campo mb-3"
              required
            >
              <option value="">Selecciona…</option>
              {activos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            {activos.length === 0 && (
              <p className="-mt-2 mb-3 text-xs text-amber-600">
                No hay clientes. Créalos en Catálogos → Clientes.
              </p>
            )}
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="etiqueta">Responsable</label>
                <select
                  value={responsableId}
                  onChange={(e) => setResponsableId(e.target.value)}
                  className="campo"
                >
                  <option value="">Sin asignar</option>
                  {miembros
                    .filter((m) => m.activo)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="etiqueta">Entrega</label>
                <input type="date" value={entrega} onChange={(e) => setEntrega(e.target.value)} className="campo" />
              </div>
              <div>
                <label className="etiqueta">Estatus</label>
                <select value={estatus} onChange={(e) => setEstatus(e.target.value as Estatus)} className="campo">
                  {ESTATUS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="etiqueta">Prioridad</label>
                <select
                  value={prioridad}
                  onChange={(e) => setPrioridad(e.target.value as Prioridad)}
                  className="campo"
                >
                  {PRIORIDADES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secundario" onClick={() => setAbierto(false)}>
                Cancelar
              </button>
              <button className="btn-primario" disabled={guardando || !titulo.trim() || !clienteId}>
                {guardando ? "Creando…" : "Crear tarea"}
              </button>
            </div>
          </form>
        </div>
        </Portal>
      )}
    </>
  );
}
