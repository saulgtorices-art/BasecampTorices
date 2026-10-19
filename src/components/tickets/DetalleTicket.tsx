"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowRightCircle, Ban, CheckCircle2, ExternalLink, FileText, Hand, Loader2, Send, Trash2, X } from "lucide-react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useDatos } from "@/components/datos/DatosProvider";
import Avatar from "@/components/ui/Avatar";
import { COLOR_ESTATUS, COLOR_PRIORIDAD, formatoFechaHora } from "@/lib/ui";
import { PRIORIDADES, type ComentarioTicket, type Prioridad, type Ticket } from "@/types/db";
import { COLOR_ESTADO, estadoSla, estaAbierto, folio } from "./util";

const esImagen = (m: string | null) => !!m && m.startsWith("image/");

export default function DetalleTicket({ ticket, onCerrar }: { ticket: Ticket; onCerrar: () => void }) {
  const supabase = supabaseNavegador();
  const { yo, esAdmin, miembros, miembroPorId, clientes, clientePorId, tareas, abrirTarea, avisar } = useDatos();

  const soyAsignado = ticket.asignado_id === yo.id;
  const soySolicitante = ticket.solicitante_id === yo.id;
  const puedeGestionar = esAdmin || soyAsignado;
  const abierto = estaAbierto(ticket);
  const tarea = ticket.tarea_id ? tareas.find((t) => t.id === ticket.tarea_id) : null;
  const sla = estadoSla(ticket);

  const [urls, setUrls] = useState<Record<string, string>>({});
  const [comentarios, setComentarios] = useState<ComentarioTicket[]>([]);
  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState<"normal" | "convertir" | "rechazar">("normal");
  const [motivo, setMotivo] = useState("");
  const [conv, setConv] = useState({
    cliente: ticket.cliente_id ?? "",
    responsable: ticket.asignado_id ?? yo.id,
    entrega: ticket.vence_at
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date(ticket.vence_at))
      : "",
  });
  const [ocupado, setOcupado] = useState(false);

  // Evidencias
  useEffect(() => {
    const rutas = (ticket.adjuntos ?? []).map((a) => a.ruta);
    if (!rutas.length) return;
    supabase.storage
      .from("adjuntos")
      .createSignedUrls(rutas, 3600)
      .then(({ data }) => {
        const m: Record<string, string> = {};
        for (const d of data ?? []) if (d.path && d.signedUrl) m[d.path] = d.signedUrl;
        setUrls(m);
      });
  }, [ticket.adjuntos, supabase]);

  // Conversación en vivo
  useEffect(() => {
    const cargar = () =>
      supabase
        .from("comentarios_ticket")
        .select("*")
        .eq("ticket_id", ticket.id)
        .order("created_at")
        .then(({ data }) => setComentarios((data as ComentarioTicket[]) ?? []));
    cargar();
    const canal = supabase
      .channel(`comentarios-ticket-${ticket.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comentarios_ticket", filter: `ticket_id=eq.${ticket.id}` },
        cargar,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, ticket.id]);

  async function actualizar(cambios: Partial<Ticket>) {
    const { error } = await supabase.from("tickets").update(cambios).eq("id", ticket.id);
    if (error) avisar(error.message);
    return !error;
  }

  async function convertir() {
    setOcupado(true);
    const { data, error } = await supabase.rpc("convertir_ticket_en_tarea", {
      p_ticket: ticket.id,
      p_responsable: conv.responsable || null,
      p_cliente: conv.cliente || null,
      p_fecha_entrega: conv.entrega || null,
    });
    setOcupado(false);
    if (error) return avisar(error.message);
    setModo("normal");
    avisar(`${folio(ticket.numero)} ahora es una tarea`, "ok");
    if (data) abrirTarea(data as string);
  }

  async function rechazar() {
    if (!motivo.trim()) return avisar("Escribe el motivo para que quien lo pidió sepa por qué.");
    setOcupado(true);
    const ok = await actualizar({ estado: "Rechazado", motivo_rechazo: motivo.trim() });
    setOcupado(false);
    if (ok) {
      setModo("normal");
      setMotivo("");
    }
  }

  async function comentar() {
    const t = texto.trim();
    if (!t) return;
    const { error } = await supabase.from("comentarios_ticket").insert({ ticket_id: ticket.id, miembro_id: yo.id, texto: t });
    if (error) return avisar(error.message);
    setTexto("");
  }

  async function borrarTicket() {
    if (!confirm(`¿Borrar ${folio(ticket.numero)}? No se puede deshacer.`)) return;
    const { error } = await supabase.from("tickets").delete().eq("id", ticket.id);
    if (error) return avisar(error.message);
    if (ticket.adjuntos?.length && !ticket.tarea_id)
      await supabase.storage.from("adjuntos").remove(ticket.adjuntos.map((a) => a.ruta));
    onCerrar();
  }

  const solicitante = ticket.solicitante_id ? miembroPorId.get(ticket.solicitante_id) : null;
  const activos = useMemo(() => miembros.filter((m) => m.activo), [miembros]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/10" onClick={onCerrar} />
      <aside className="fixed top-0 right-0 bottom-0 z-50 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start gap-2 border-b border-slate-100 p-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono font-semibold text-slate-500">{folio(ticket.numero)}</span>
              <span
                className="rounded px-1.5 py-0.5 font-semibold text-white"
                style={{ background: COLOR_ESTADO[ticket.estado] }}
              >
                {ticket.estado}
              </span>
              <span
                className="rounded px-1.5 py-0.5 font-semibold text-white"
                style={{ background: COLOR_PRIORIDAD[ticket.urgencia] }}
              >
                {ticket.urgencia}
              </span>
              <span className="text-slate-500">{ticket.categoria}</span>
            </div>
            <h2 className="text-lg leading-snug font-semibold">{ticket.titulo}</h2>
          </div>
          {esAdmin && (
            <button onClick={borrarTicket} title="Borrar ticket" className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
              <Trash2 size={18} />
            </button>
          )}
          <button onClick={onCerrar} title="Cerrar" className="rounded p-2 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {/* SLA */}
          <div
            className={clsx(
              "mb-4 rounded-lg px-3 py-2 text-sm font-medium",
              sla.tono === "vencido" && "bg-red-50 text-red-700",
              sla.tono === "alerta" && "bg-amber-50 text-amber-700",
              sla.tono === "ok" && "bg-green-50 text-green-700",
              sla.tono === "cerrado" && "bg-slate-50 text-slate-600",
            )}
          >
            ⏱ {sla.texto}
            {ticket.vence_at && abierto && (
              <span className="ml-1 font-normal opacity-80">· límite {formatoFechaHora(ticket.vence_at)}</span>
            )}
          </div>

          {ticket.estado === "Rechazado" && ticket.motivo_rechazo && (
            <div className="mb-4 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <b>Motivo del rechazo:</b> {ticket.motivo_rechazo}
            </div>
          )}

          {/* Acciones */}
          {abierto && puedeGestionar && modo === "normal" && (
            <div className="mb-4 flex flex-wrap gap-2">
              {!ticket.tarea_id && (
                <button onClick={() => setModo("convertir")} className="btn-primario">
                  <ArrowRightCircle size={15} /> Convertir en tarea
                </button>
              )}
              {ticket.estado === "Nuevo" && (
                <button onClick={() => actualizar({ estado: "En revisión" })} className="btn-secundario">
                  En revisión
                </button>
              )}
              {!ticket.tarea_id && (
                <button onClick={() => setModo("rechazar")} className="btn-peligro">
                  <Ban size={15} /> Rechazar
                </button>
              )}
              {ticket.tarea_id && ticket.estado !== "Resuelto" && (
                <button onClick={() => actualizar({ estado: "Resuelto" })} className="btn-secundario">
                  <CheckCircle2 size={15} /> Marcar resuelto
                </button>
              )}
            </div>
          )}
          {abierto && !ticket.asignado_id && !soySolicitante && modo === "normal" && (
            <button onClick={() => actualizar({ asignado_id: yo.id })} className="btn-secundario mb-4">
              <Hand size={15} /> Tomar este ticket
            </button>
          )}
          {!abierto && puedeGestionar && (
            <button onClick={() => actualizar({ estado: ticket.tarea_id ? "Aceptado" : "Nuevo" })} className="btn-secundario mb-4">
              Reabrir ticket
            </button>
          )}

          {modo === "convertir" && (
            <div className="mb-4 rounded-lg border border-marca-500 bg-marca-50/40 p-3">
              <div className="mb-2 text-sm font-semibold">Convertir en tarea</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <label className="etiqueta">Cliente *</label>
                  <select value={conv.cliente} onChange={(e) => setConv({ ...conv, cliente: e.target.value })} className="campo">
                    <option value="">Selecciona…</option>
                    {clientes
                      .filter((c) => c.activo || c.id === conv.cliente)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="etiqueta">Responsable</label>
                  <select
                    value={conv.responsable}
                    onChange={(e) => setConv({ ...conv, responsable: e.target.value })}
                    className="campo"
                  >
                    <option value="">Sin asignar</option>
                    {activos.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="etiqueta">Entrega</label>
                  <input
                    type="date"
                    value={conv.entrega}
                    onChange={(e) => setConv({ ...conv, entrega: e.target.value })}
                    className="campo"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                La tarea hereda título, urgencia, descripción y evidencias. Al terminarla, el ticket se resuelve solo.
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setModo("normal")} className="btn-secundario">
                  Cancelar
                </button>
                <button onClick={convertir} disabled={!conv.cliente || ocupado} className="btn-primario">
                  {ocupado && <Loader2 size={14} className="animate-spin" />} Crear tarea
                </button>
              </div>
            </div>
          )}

          {modo === "rechazar" && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50/40 p-3">
              <label className="etiqueta">Motivo del rechazo *</label>
              <textarea
                autoFocus
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="campo resize-y"
                placeholder="Ej. Ya existe la tarea X, o no está dentro del alcance"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={() => setModo("normal")} className="btn-secundario">
                  Cancelar
                </button>
                <button onClick={rechazar} disabled={ocupado} className="btn-peligro">
                  Rechazar ticket
                </button>
              </div>
            </div>
          )}

          {ticket.tarea_id && (
            <button
              onClick={() => abrirTarea(ticket.tarea_id)}
              className="mb-4 flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <ExternalLink size={15} className="text-marca-600" />
              <span className="min-w-0 flex-1 truncate">
                Tarea: <b>{tarea?.titulo ?? "ver tarea"}</b>
              </span>
              {tarea && (
                <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: COLOR_ESTATUS[tarea.estatus] }}>
                  {tarea.estatus}
                </span>
              )}
            </button>
          )}

          {/* Datos */}
          <dl className="mb-4 grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-2 text-sm">
            <dt className="text-slate-500">Pidió</dt>
            <dd className="flex items-center gap-2">
              <Avatar nombre={solicitante?.nombre} tam={20} />
              {solicitante?.nombre ?? "—"} <span className="text-xs text-slate-400">· {formatoFechaHora(ticket.created_at)}</span>
            </dd>

            <dt className="text-slate-500">Asignado a</dt>
            <dd>
              {esAdmin && abierto ? (
                <select
                  value={ticket.asignado_id ?? ""}
                  onChange={(e) => actualizar({ asignado_id: e.target.value || null })}
                  className="campo"
                >
                  <option value="">Sin asignar</option>
                  {activos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="flex items-center gap-2">
                  <Avatar nombre={ticket.asignado_id ? miembroPorId.get(ticket.asignado_id)?.nombre : null} tam={20} />
                  {ticket.asignado_id ? (miembroPorId.get(ticket.asignado_id)?.nombre ?? "—") : "Sin asignar"}
                </span>
              )}
            </dd>

            <dt className="text-slate-500">Urgencia</dt>
            <dd>
              {abierto && (puedeGestionar || (soySolicitante && ticket.estado === "Nuevo")) ? (
                <div className="flex flex-wrap gap-1">
                  {PRIORIDADES.map((p) => (
                    <button
                      key={p}
                      onClick={() => p !== ticket.urgencia && actualizar({ urgencia: p as Prioridad })}
                      className={clsx(
                        "rounded px-2 py-0.5 text-xs font-semibold",
                        p === ticket.urgencia ? "text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                      )}
                      style={p === ticket.urgencia ? { background: COLOR_PRIORIDAD[p] } : {}}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              ) : (
                ticket.urgencia
              )}
            </dd>

            <dt className="text-slate-500">Cliente</dt>
            <dd>{ticket.cliente_id ? (clientePorId.get(ticket.cliente_id)?.nombre ?? "—") : "Interno"}</dd>
          </dl>

          {ticket.descripcion && (
            <div className="mb-4">
              <div className="etiqueta">Detalles</div>
              <p className="text-sm whitespace-pre-wrap break-words">{ticket.descripcion}</p>
            </div>
          )}

          {(ticket.adjuntos ?? []).length > 0 && (
            <div className="mb-5">
              <div className="etiqueta">Evidencias</div>
              <div className="grid grid-cols-3 gap-2">
                {ticket.adjuntos.map((a) =>
                  esImagen(a.mime) && urls[a.ruta] ? (
                    <a key={a.ruta} href={urls[a.ruta]} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={urls[a.ruta]} alt={a.nombre} className="h-24 w-full rounded-lg border border-slate-200 object-cover" />
                    </a>
                  ) : (
                    <a
                      key={a.ruta}
                      href={urls[a.ruta]}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-24 flex-col justify-center rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs hover:bg-slate-100"
                    >
                      <FileText size={16} className="mb-1 text-slate-500" />
                      <span className="line-clamp-2">{a.nombre}</span>
                    </a>
                  ),
                )}
              </div>
            </div>
          )}

          {/* Conversación */}
          <div className="etiqueta">Conversación</div>
          <ul className="mb-3 flex flex-col gap-2">
            {comentarios.length === 0 && <li className="text-sm text-slate-400">Sin mensajes. Pregunta o aclara algo aquí.</li>}
            {comentarios.map((c) => {
              const autor = c.miembro_id ? miembroPorId.get(c.miembro_id) : null;
              return (
                <li key={c.id} className="flex gap-2">
                  <Avatar nombre={autor?.nombre ?? "?"} tam={24} />
                  <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-1.5">
                    <div className="text-xs text-slate-500">
                      <b className="text-slate-700">{autor?.nombre ?? "—"}</b> · {formatoFechaHora(c.created_at)}
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words">{c.texto}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <textarea
              rows={1}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  comentar();
                }
              }}
              placeholder="Escribe un mensaje… (Enter envía)"
              className="campo resize-none"
            />
            <button onClick={comentar} disabled={!texto.trim()} className="btn-primario">
              <Send size={15} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
