"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { FileText, Loader2, Paperclip, Ticket as IconoTicket, X } from "lucide-react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useDatos } from "@/components/datos/DatosProvider";
import Portal from "@/components/ui/Portal";
import { COLOR_PRIORIDAD } from "@/lib/ui";
import { CATEGORIAS_TICKET, PRIORIDADES, type AdjuntoComentario, type CategoriaTicket, type Prioridad } from "@/types/db";
import { DESCRIPCION_URGENCIA, SLA_TEXTO } from "./util";

const MAX_BYTES = 50 * 1024 * 1024;

function nombreSeguro(nombre: string) {
  return (
    nombre
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .slice(-120) || "archivo"
  );
}

/** Botón + modal para levantar un ticket (pedir una tarea). */
export default function NuevoTicket({ onCreado }: { onCreado?: (id: string) => void }) {
  const supabase = supabaseNavegador();
  const { yo, esAdmin, clientes, miembros, avisar } = useDatos();
  const [abierto, setAbierto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [categoria, setCategoria] = useState<CategoriaTicket>("Soporte");
  const [urgencia, setUrgencia] = useState<Prioridad>("Media");
  const [asignadoId, setAsignadoId] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [guardando, setGuardando] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);

  function cerrar() {
    setAbierto(false);
    setTitulo("");
    setDescripcion("");
    setArchivos([]);
    setUrgencia("Media");
  }

  function agregar(lista: FileList | File[]) {
    const ok = Array.from(lista).filter((f) => {
      if (f.size > MAX_BYTES) avisar(`"${f.name}" pesa más de 50 MB.`);
      return f.size <= MAX_BYTES;
    });
    setArchivos((a) => [...a, ...ok].slice(0, 10));
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || guardando) return;
    setGuardando(true);
    const id = crypto.randomUUID();

    const adjuntos: AdjuntoComentario[] = [];
    for (const f of archivos) {
      const ruta = `tickets/${id}/${crypto.randomUUID()}-${nombreSeguro(f.name)}`;
      const { error } = await supabase.storage.from("adjuntos").upload(ruta, f, { contentType: f.type || undefined });
      if (error) avisar(`No se pudo subir "${f.name}": ${error.message}`);
      else adjuntos.push({ ruta, nombre: f.name, mime: f.type || null, tamano: f.size });
    }

    const { error } = await supabase.from("tickets").insert({
      id,
      titulo: titulo.trim(),
      descripcion: descripcion.trim(),
      cliente_id: clienteId || null,
      categoria,
      urgencia,
      asignado_id: asignadoId || null,
      solicitante_id: yo.id,
      adjuntos,
    });
    setGuardando(false);
    if (error) {
      if (adjuntos.length) await supabase.storage.from("adjuntos").remove(adjuntos.map((a) => a.ruta));
      return avisar(error.message);
    }
    avisar("Ticket levantado. Te avisaremos cuando lo revisen.", "ok");
    cerrar();
    onCreado?.(id);
  }

  return (
    <>
      <button className="btn-primario" onClick={() => setAbierto(true)}>
        <IconoTicket size={16} /> Levantar ticket
      </button>
      {abierto && (
        <Portal>
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/30 p-4 pt-[6vh]">
          <form
            onSubmit={crear}
            onKeyDown={(e) => e.key === "Escape" && cerrar()}
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault();
                agregar(e.clipboardData.files);
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length) agregar(e.dataTransfer.files);
            }}
            className="w-full max-w-xl rounded-xl bg-white p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-center">
              <h2 className="text-base font-semibold">Levantar ticket</h2>
              <button type="button" onClick={cerrar} className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <label className="etiqueta">¿Qué necesitas? *</label>
            <input
              autoFocus
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="campo mb-3"
              placeholder="Ej. El formulario de contacto no envía correos"
            />

            <label className="etiqueta">Detalles</label>
            <textarea
              rows={4}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="campo mb-3 resize-y"
              placeholder="Qué pasa, dónde, pasos para reproducirlo, links… (puedes pegar capturas con Ctrl+V)"
            />

            <label className="etiqueta">Urgencia *</label>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRIORIDADES.map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setUrgencia(p)}
                  className={clsx(
                    "rounded-lg border-2 p-2 text-left transition",
                    urgencia === p ? "shadow-sm" : "border-slate-200 opacity-70 hover:opacity-100",
                  )}
                  style={urgencia === p ? { borderColor: COLOR_PRIORIDAD[p], background: COLOR_PRIORIDAD[p] + "14" } : {}}
                >
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR_PRIORIDAD[p] }} />
                    {p}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-tight text-slate-500">{DESCRIPCION_URGENCIA[p]}</div>
                  <div className="mt-1 text-[11px] font-medium text-slate-700">Respuesta: {SLA_TEXTO[p]}</div>
                </button>
              ))}
            </div>

            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="etiqueta">Cliente</label>
                <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="campo">
                  <option value="">Sin cliente / interno</option>
                  {clientes
                    .filter((c) => c.activo)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="etiqueta">Tipo</label>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value as CategoriaTicket)}
                  className="campo"
                >
                  {CATEGORIAS_TICKET.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="etiqueta">Pedírselo a</label>
                <select value={asignadoId} onChange={(e) => setAsignadoId(e.target.value)} className="campo">
                  <option value="">{esAdmin ? "Sin asignar" : "Que lo asigne un admin"}</option>
                  {miembros
                    .filter((m) => m.activo && m.id !== yo.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="mb-4">
              <button
                type="button"
                onClick={() => archivoRef.current?.click()}
                className="btn-secundario"
              >
                <Paperclip size={14} /> Adjuntar evidencias
              </button>
              <input
                ref={archivoRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) agregar(e.target.files);
                  e.target.value = "";
                }}
              />
              {archivos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {archivos.map((f, i) => (
                    <span key={i} className="flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pr-1 pl-2 text-xs">
                      <FileText size={12} />
                      <span className="max-w-40 truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setArchivos((a) => a.filter((_, j) => j !== i))}
                        className="rounded-full p-0.5 hover:bg-slate-200"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={cerrar} className="btn-secundario">
                Cancelar
              </button>
              <button disabled={!titulo.trim() || guardando} className="btn-primario">
                {guardando && <Loader2 size={14} className="animate-spin" />} Levantar ticket
              </button>
            </div>
          </form>
        </div>
        </Portal>
      )}
    </>
  );
}
