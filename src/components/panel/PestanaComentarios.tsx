"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { CornerUpLeft, Download, FileText, Loader2, Paperclip, Send, Trash2, X } from "lucide-react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useDatos } from "@/components/datos/DatosProvider";
import Avatar from "@/components/ui/Avatar";
import { formatoFechaHora } from "@/lib/ui";
import type { AdjuntoComentario, ComentarioTarea, Miembro, Tarea } from "@/types/db";
import { useFilasTarea } from "./useFilasTarea";

const BUCKET = "adjuntos";
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVOS = 10;
const ORDEN_ASC = { columna: "created_at", asc: true };

const esImagen = (mime: string | null | undefined) => !!mime && mime.startsWith("image/");

function sinAcentos(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

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

function escaparRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pinta @menciones resaltadas y links clicables. */
function TextoMensaje({ texto, mencionados }: { texto: string; mencionados: Miembro[] }) {
  const partes = useMemo(() => {
    const nombres = mencionados.map((m) => escaparRegex("@" + m.nombre));
    const patron = new RegExp(`(${[...nombres, "https?://[^\\s]+"].join("|")})`, "g");
    return texto.split(patron).filter((p) => p !== "");
  }, [texto, mencionados]);

  return (
    <p className="text-sm whitespace-pre-wrap break-words">
      {partes.map((p, i) => {
        if (/^https?:\/\//.test(p))
          return (
            <a key={i} href={p} target="_blank" rel="noreferrer" className="text-marca-700 underline break-all">
              {p}
            </a>
          );
        if (p.startsWith("@") && mencionados.some((m) => "@" + m.nombre === p))
          return (
            <span key={i} className="rounded bg-marca-100 px-0.5 font-medium text-marca-700">
              {p}
            </span>
          );
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </p>
  );
}

export function PestanaComentarios({ tarea }: { tarea: Tarea }) {
  const supabase = supabaseNavegador();
  const { yo, esAdmin, miembros, miembroPorId, avisar } = useDatos();
  const { filas, cargando, recargar } = useFilasTarea<ComentarioTarea>("comentarios_tarea", tarea.id, ORDEN_ASC);

  const [texto, setTexto] = useState("");
  const [pendientes, setPendientes] = useState<{ archivo: File; vista: string | null }[]>([]);
  const [respuestaA, setRespuestaA] = useState<ComentarioTarea | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busquedaMencion, setBusquedaMencion] = useState<string | null>(null);
  const [indiceMencion, setIndiceMencion] = useState(0);

  const textoRef = useRef<HTMLTextAreaElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const porId = useMemo(() => new Map(filas.map((c) => [c.id, c])), [filas]);

  // Baja al último mensaje cuando llegan nuevos.
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [filas.length]);

  // URLs firmadas (1 h) para todas las imágenes/archivos de los mensajes.
  useEffect(() => {
    const faltan = filas.flatMap((c) => (c.adjuntos ?? []).map((a) => a.ruta)).filter((r) => !urls[r]);
    if (!faltan.length) return;
    supabase.storage
      .from(BUCKET)
      .createSignedUrls(faltan, 3600)
      .then(({ data }) => {
        if (!data) return;
        setUrls((u) => {
          const n = { ...u };
          for (const d of data) if (d.path && d.signedUrl) n[d.path] = d.signedUrl;
          return n;
        });
      });
  }, [filas, urls, supabase]);

  // Libera las vistas previas locales.
  useEffect(
    () => () => pendientes.forEach((p) => p.vista && URL.revokeObjectURL(p.vista)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const candidatosMencion = useMemo(() => {
    if (busquedaMencion === null) return [];
    const q = sinAcentos(busquedaMencion);
    return miembros.filter((m) => m.activo && sinAcentos(m.nombre).includes(q)).slice(0, 6);
  }, [busquedaMencion, miembros]);

  function agregarArchivos(lista: FileList | File[]) {
    const nuevos = Array.from(lista).filter((f) => {
      if (f.size > MAX_BYTES) {
        avisar(`"${f.name}" pesa más de 50 MB.`);
        return false;
      }
      return true;
    });
    setPendientes((p) =>
      [...p, ...nuevos.map((archivo) => ({ archivo, vista: esImagen(archivo.type) ? URL.createObjectURL(archivo) : null }))].slice(
        0,
        MAX_ARCHIVOS,
      ),
    );
    textoRef.current?.focus();
  }

  function quitarPendiente(i: number) {
    setPendientes((p) => {
      const q = p.slice();
      const [x] = q.splice(i, 1);
      if (x?.vista) URL.revokeObjectURL(x.vista);
      return q;
    });
  }

  function alEscribir(valor: string) {
    setTexto(valor);
    const cursor = textoRef.current?.selectionStart ?? valor.length;
    const m = /(?:^|\s)@([^\s@]{0,30})$/.exec(valor.slice(0, cursor));
    setBusquedaMencion(m ? m[1] : null);
    setIndiceMencion(0);
  }

  function elegirMencion(m: Miembro) {
    const el = textoRef.current;
    const cursor = el?.selectionStart ?? texto.length;
    const antes = texto.slice(0, cursor).replace(/@([^\s@]{0,30})$/, `@${m.nombre} `);
    const nuevo = antes + texto.slice(cursor);
    setTexto(nuevo);
    setBusquedaMencion(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(antes.length, antes.length);
    });
  }

  async function enviar() {
    const limpio = texto.trim();
    if ((!limpio && pendientes.length === 0) || enviando) return;
    setEnviando(true);

    const subidos: AdjuntoComentario[] = [];
    for (const { archivo } of pendientes) {
      const ruta = `${tarea.id}/comentarios/${crypto.randomUUID()}-${nombreSeguro(archivo.name)}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(ruta, archivo, { contentType: archivo.type || undefined });
      if (error) {
        avisar(`No se pudo subir "${archivo.name}": ${error.message}`);
        continue;
      }
      subidos.push({ ruta, nombre: archivo.name, mime: archivo.type || null, tamano: archivo.size });
    }

    if (!limpio && subidos.length === 0) {
      setEnviando(false);
      return;
    }

    const menciones = miembros.filter((m) => m.activo && limpio.includes("@" + m.nombre)).map((m) => m.id);
    const { error } = await supabase.from("comentarios_tarea").insert({
      tarea_id: tarea.id,
      miembro_id: yo.id,
      texto: limpio,
      adjuntos: subidos,
      respuesta_a: respuestaA?.id ?? null,
      menciones,
    });
    setEnviando(false);

    if (error) {
      if (subidos.length) await supabase.storage.from(BUCKET).remove(subidos.map((s) => s.ruta));
      return avisar(error.message);
    }
    setTexto("");
    pendientes.forEach((p) => p.vista && URL.revokeObjectURL(p.vista));
    setPendientes([]);
    setRespuestaA(null);
    recargar();
  }

  async function borrar(c: ComentarioTarea) {
    if (!confirm("¿Borrar este mensaje?")) return;
    const { error, count } = await supabase.from("comentarios_tarea").delete({ count: "exact" }).eq("id", c.id);
    if (error || count === 0) return avisar(error?.message ?? "No tienes permiso para borrar este mensaje.");
    if (c.adjuntos?.length) await supabase.storage.from(BUCKET).remove(c.adjuntos.map((a) => a.ruta));
    recargar();
  }

  async function descargar(a: AdjuntoComentario) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.ruta, 600, { download: a.nombre });
    if (error || !data) return avisar(error?.message ?? "No se pudo descargar.");
    window.location.href = data.signedUrl;
  }

  function irAMensaje(id: string) {
    const el = document.getElementById(`msg-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.classList.add("ring-2", "ring-marca-500");
    setTimeout(() => el?.classList.remove("ring-2", "ring-marca-500"), 1200);
  }

  const puedeEnviar = (texto.trim() || pendientes.length > 0) && !enviando;

  return (
    <div
      className="relative flex min-h-full flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setArrastrando(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastrando(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setArrastrando(false);
        if (e.dataTransfer.files.length) agregarArchivos(e.dataTransfer.files);
      }}
    >
      {arrastrando && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-marca-500 bg-marca-50/90 text-sm font-medium text-marca-700">
          Suelta para adjuntar al mensaje
        </div>
      )}

      {/* Mensajes */}
      <div className="flex flex-1 flex-col gap-3 pb-4">
        {cargando && <p className="text-sm text-slate-400">Cargando…</p>}
        {!cargando && filas.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            Sin mensajes todavía. Escribe abajo, pega una captura (Ctrl+V) o arrastra evidencias.
          </p>
        )}
        {filas.map((c, i) => {
          const autor = c.miembro_id ? miembroPorId.get(c.miembro_id) : null;
          const mio = c.miembro_id === yo.id;
          const puedeBorrar = esAdmin || mio;
          const previo = filas[i - 1];
          const agrupado =
            previo &&
            previo.miembro_id === c.miembro_id &&
            new Date(c.created_at).getTime() - new Date(previo.created_at).getTime() < 5 * 60 * 1000 &&
            !c.respuesta_a;
          const citado = c.respuesta_a ? porId.get(c.respuesta_a) : null;
          const mencionados = (c.menciones ?? []).map((id) => miembroPorId.get(id)).filter(Boolean) as Miembro[];
          const imagenes = (c.adjuntos ?? []).filter((a) => esImagen(a.mime));
          const otros = (c.adjuntos ?? []).filter((a) => !esImagen(a.mime));

          return (
            <div key={c.id} className={clsx("group flex gap-2", mio && "flex-row-reverse", agrupado && "-mt-2")}>
              <div className="w-7 shrink-0">{!agrupado && <Avatar nombre={autor?.nombre ?? "?"} foto={autor?.foto_url} tam={28} />}</div>
              <div className={clsx("flex min-w-0 max-w-[85%] flex-col", mio && "items-end")}>
                {!agrupado && (
                  <div className={clsx("mb-0.5 flex items-center gap-2 text-xs text-slate-500", mio && "flex-row-reverse")}>
                    <span className="font-medium text-slate-700">{mio ? "Tú" : (autor?.nombre ?? "—")}</span>
                    <span>{formatoFechaHora(c.created_at)}</span>
                  </div>
                )}
                <div
                  id={`msg-${c.id}`}
                  className={clsx(
                    "rounded-2xl px-3 py-2 transition",
                    mio ? "rounded-tr-sm bg-marca-50" : "rounded-tl-sm bg-slate-100",
                  )}
                >
                  {c.respuesta_a && (
                    <button
                      onClick={() => citado && irAMensaje(citado.id)}
                      className="mb-1.5 block w-full rounded-md border-l-2 border-marca-500 bg-white/70 px-2 py-1 text-left text-xs text-slate-500"
                    >
                      {citado ? (
                        <>
                          <b className="text-slate-700">
                            {citado.miembro_id ? (miembroPorId.get(citado.miembro_id)?.nombre ?? "—") : "—"}
                          </b>
                          <span className="line-clamp-2">
                            {citado.texto || (citado.adjuntos?.length ? "📎 Evidencia" : "")}
                          </span>
                        </>
                      ) : (
                        <i>Mensaje borrado</i>
                      )}
                    </button>
                  )}

                  {imagenes.length > 0 && (
                    <div className={clsx("mb-1 grid gap-1", imagenes.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                      {imagenes.map((a) =>
                        urls[a.ruta] ? (
                          <a key={a.ruta} href={urls[a.ruta]} target="_blank" rel="noreferrer" title={a.nombre}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={urls[a.ruta]}
                              alt={a.nombre}
                              className="max-h-56 w-full rounded-lg bg-white object-cover"
                              onLoad={() => finRef.current?.scrollIntoView({ block: "end" })}
                            />
                          </a>
                        ) : (
                          <div key={a.ruta} className="flex h-32 items-center justify-center rounded-lg bg-white">
                            <Loader2 size={18} className="animate-spin text-slate-400" />
                          </div>
                        ),
                      )}
                    </div>
                  )}

                  {otros.map((a) => (
                    <button
                      key={a.ruta}
                      onClick={() => descargar(a)}
                      className="mb-1 flex w-full items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                    >
                      <FileText size={16} className="shrink-0 text-slate-500" />
                      <span className="min-w-0 flex-1 truncate">{a.nombre}</span>
                      <Download size={14} className="shrink-0 text-slate-400" />
                    </button>
                  ))}

                  {c.texto && <TextoMensaje texto={c.texto} mencionados={mencionados} />}
                </div>
              </div>
              <div className="flex shrink-0 items-start gap-0.5 pt-5 opacity-0 transition group-hover:opacity-100">
                <button
                  title="Responder"
                  onClick={() => {
                    setRespuestaA(c);
                    textoRef.current?.focus();
                  }}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <CornerUpLeft size={14} />
                </button>
                {puedeBorrar && (
                  <button
                    title="Borrar"
                    onClick={() => borrar(c)}
                    className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>

      {/* Caja de mensaje */}
      <div className="sticky bottom-0 -mx-5 -mb-5 border-t border-slate-200 bg-white px-5 pt-3 pb-4">
        {respuestaA && (
          <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-marca-500 bg-slate-50 px-2 py-1 text-xs text-slate-600">
            <CornerUpLeft size={13} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              Respondiendo a{" "}
              <b>{respuestaA.miembro_id ? (miembroPorId.get(respuestaA.miembro_id)?.nombre ?? "—") : "—"}</b>
              <div className="truncate">{respuestaA.texto || "📎 Evidencia"}</div>
            </div>
            <button onClick={() => setRespuestaA(null)} className="text-slate-400 hover:text-slate-700">
              <X size={14} />
            </button>
          </div>
        )}

        {pendientes.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendientes.map((p, i) => (
              <div key={i} className="group/p relative">
                {p.vista ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.vista} alt={p.archivo.name} className="h-16 w-16 rounded-md border border-slate-200 object-cover" />
                ) : (
                  <div className="flex h-16 w-28 flex-col justify-center rounded-md border border-slate-200 bg-slate-50 px-2 text-xs">
                    <FileText size={14} className="mb-1 text-slate-500" />
                    <span className="truncate">{p.archivo.name}</span>
                  </div>
                )}
                <button
                  onClick={() => quitarPendiente(i)}
                  className="absolute -top-1.5 -right-1.5 rounded-full bg-slate-700 p-0.5 text-white hover:bg-red-600"
                  title="Quitar"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-end gap-2 rounded-xl border border-slate-300 p-1.5 focus-within:border-marca-500 focus-within:ring-2 focus-within:ring-marca-100">
          {candidatosMencion.length > 0 && (
            <ul className="absolute bottom-full left-0 z-20 mb-1 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {candidatosMencion.map((m, i) => (
                <li key={m.id}>
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      elegirMencion(m);
                    }}
                    className={clsx(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                      i === indiceMencion ? "bg-marca-50 text-marca-700" : "hover:bg-slate-50",
                    )}
                  >
                    <Avatar nombre={m.nombre} foto={m.foto_url} tam={20} />
                    {m.nombre}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            title="Adjuntar imagen o archivo"
            onClick={() => archivoRef.current?.click()}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <Paperclip size={18} />
          </button>
          <input
            ref={archivoRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) agregarArchivos(e.target.files);
              e.target.value = "";
            }}
          />
          <textarea
            ref={textoRef}
            value={texto}
            rows={Math.min(6, Math.max(1, texto.split("\n").length))}
            onChange={(e) => alEscribir(e.target.value)}
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault();
                agregarArchivos(e.clipboardData.files);
              }
            }}
            onKeyDown={(e) => {
              if (candidatosMencion.length) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setIndiceMencion((i) => (i + 1) % candidatosMencion.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setIndiceMencion((i) => (i - 1 + candidatosMencion.length) % candidatosMencion.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  elegirMencion(candidatosMencion[indiceMencion]!);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setBusquedaMencion(null);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                enviar();
              }
            }}
            placeholder="Escribe un mensaje… @ para mencionar · pega capturas con Ctrl+V"
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none"
          />
          <button
            onClick={enviar}
            disabled={!puedeEnviar}
            title="Enviar (Enter)"
            className="rounded-lg bg-marca-600 p-2 text-white hover:bg-marca-700 disabled:opacity-40"
          >
            {enviando ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">Enter envía · Shift+Enter nueva línea</p>
      </div>
    </div>
  );
}
