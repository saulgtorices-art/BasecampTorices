"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import Encabezado from "@/components/Encabezado";
import Avatar from "@/components/ui/Avatar";
import { useDatos } from "@/components/datos/DatosProvider";
import { CeldaTexto } from "@/components/ui/Celdas";
import type { Miembro, Rol } from "@/types/db";

export default function EquipoPage() {
  const { miembros, guardarMiembro, borrarMiembro, esAdmin, yo } = useDatos();
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [rol, setRol] = useState<Rol>("miembro");

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !correo.trim()) return;
    const ok = await guardarMiembro({ nombre: nombre.trim(), correo, rol, alias: [nombre.trim()] });
    if (ok) {
      setNombre("");
      setCorreo("");
      setRol("miembro");
    }
  }

  const editar = (m: Miembro, cambios: Partial<Miembro>) =>
    guardarMiembro({ id: m.id, nombre: m.nombre, correo: m.correo, ...cambios });

  return (
    <>
      <Encabezado
        titulo="Equipo"
        subtitulo={
          esAdmin
            ? "Solo los correos registrados aquí pueden entrar con Google."
            : "Solo un administrador puede modificar el equipo."
        }
      />
      <div className="max-w-4xl p-4 md:p-6">
        {esAdmin && (
          <form
            onSubmit={agregar}
            className="mb-6 flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-3"
          >
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre (ej. Sebastián)"
              className="campo max-w-[200px]"
            />
            <input
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="correo@gmail.com"
              className="campo max-w-xs"
            />
            <select value={rol} onChange={(e) => setRol(e.target.value as Rol)} className="campo w-32">
              <option value="miembro">Miembro</option>
              <option value="admin">Admin</option>
            </select>
            <button className="btn-primario" disabled={!nombre.trim() || !correo.trim()}>
              Agregar miembro
            </button>
          </form>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Nombre</th>
                <th className="px-3 py-2 text-left font-medium">Correo</th>
                <th className="px-3 py-2 text-left font-medium">Alias (importación)</th>
                <th className="px-3 py-2 font-medium">Rol</th>
                <th className="px-3 py-2 font-medium">Activo</th>
                <th className="px-3 py-2 font-medium">Login</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {miembros.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-2">
                    <div className="flex items-center gap-1">
                      <Avatar nombre={m.nombre} />
                      {esAdmin ? (
                        <CeldaTexto valor={m.nombre} requerido onGuardar={(v) => v && editar(m, { nombre: v })} />
                      ) : (
                        <span className="px-2">{m.nombre}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2">
                    {esAdmin ? (
                      <CeldaTexto
                        valor={m.correo}
                        requerido
                        onGuardar={(v) => v && editar(m, { correo: v.toLowerCase() })}
                      />
                    ) : (
                      <span className="px-2 text-slate-600">{m.correo}</span>
                    )}
                  </td>
                  <td className="px-2">
                    {esAdmin ? (
                      <CeldaTexto
                        valor={m.alias.join(", ")}
                        placeholder="Saúl, Saul"
                        onGuardar={(v) =>
                          editar(m, {
                            alias: (v ?? "")
                              .split(",")
                              .map((a) => a.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    ) : (
                      <span className="px-2 text-slate-500">{m.alias.join(", ")}</span>
                    )}
                  </td>
                  <td className="text-center">
                    <select
                      value={m.rol}
                      disabled={!esAdmin || m.id === yo.id}
                      onChange={(e) => editar(m, { rol: e.target.value as Rol })}
                      className="rounded bg-transparent px-1 py-1 text-sm"
                    >
                      <option value="miembro">Miembro</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      checked={m.activo}
                      disabled={!esAdmin || m.id === yo.id}
                      onChange={(e) => editar(m, { activo: e.target.checked })}
                      className="h-4 w-4 accent-marca-600"
                    />
                  </td>
                  <td className="text-center text-xs">
                    {m.auth_user_id ? (
                      <span className="text-green-600">Vinculado</span>
                    ) : (
                      <span className="text-slate-400">Pendiente</span>
                    )}
                  </td>
                  <td className="w-10 text-center">
                    {esAdmin && m.id !== yo.id && (
                      <button
                        title="Borrar (sus tareas quedan sin asignar)"
                        onClick={() =>
                          confirm(`¿Borrar a ${m.nombre}? Sus tareas quedarán sin responsable y se borrarán sus registros de tiempo. Si solo dejó el equipo, mejor desactívalo.`) &&
                          borrarMiembro(m.id)
                        }
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
