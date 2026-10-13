"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import Encabezado from "@/components/Encabezado";
import { useDatos } from "@/components/datos/DatosProvider";
import { CeldaTexto } from "@/components/ui/Celdas";

export default function ClientesPage() {
  const { clientes, tareas, guardarCliente, borrarCliente, esAdmin } = useDatos();
  const [nombre, setNombre] = useState("");
  const [dominio, setDominio] = useState("");

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    const ok = await guardarCliente({ nombre: nombre.trim(), dominio: dominio.trim() || null });
    if (ok) {
      setNombre("");
      setDominio("");
    }
  }

  const conteo = (id: string) => tareas.filter((t) => t.cliente_id === id).length;

  return (
    <>
      <Encabezado titulo="Clientes" subtitulo="Cualquier miembro puede agregar y editar; solo admin borra." />
      <div className="max-w-3xl p-4 md:p-6">
        <form onSubmit={agregar} className="mb-6 flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-3">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre del cliente"
            className="campo max-w-xs"
          />
          <input
            value={dominio}
            onChange={(e) => setDominio(e.target.value)}
            placeholder="dominio.com"
            className="campo max-w-xs"
          />
          <button className="btn-primario" disabled={!nombre.trim()}>
            Agregar cliente
          </button>
        </form>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Nombre</th>
                <th className="px-3 py-2 text-left font-medium">Dominio</th>
                <th className="px-3 py-2 font-medium">Tareas</th>
                <th className="px-3 py-2 font-medium">Activo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-1">
                    <CeldaTexto
                      valor={c.nombre}
                      requerido
                      onGuardar={(v) => v && guardarCliente({ id: c.id, nombre: v })}
                    />
                  </td>
                  <td className="px-1">
                    <CeldaTexto
                      valor={c.dominio}
                      placeholder="—"
                      onGuardar={(v) => guardarCliente({ id: c.id, nombre: c.nombre, dominio: v })}
                    />
                  </td>
                  <td className="text-center text-slate-500">{conteo(c.id)}</td>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      checked={c.activo}
                      onChange={(e) => guardarCliente({ id: c.id, nombre: c.nombre, activo: e.target.checked })}
                      className="h-4 w-4 accent-marca-600"
                    />
                  </td>
                  <td className="w-10 text-center">
                    {esAdmin && (
                      <button
                        title={conteo(c.id) ? "Tiene tareas: desactívalo en lugar de borrarlo" : "Borrar"}
                        disabled={conteo(c.id) > 0}
                        onClick={() => confirm(`¿Borrar el cliente "${c.nombre}"?`) && borrarCliente(c.id)}
                        className="text-slate-400 hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {clientes.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">
                    Aún no hay clientes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
