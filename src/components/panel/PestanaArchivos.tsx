"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import {
  Download,
  ExternalLink,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Link2,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useDatos } from "@/components/datos/DatosProvider";
import Avatar from "@/components/ui/Avatar";
import { formatoFechaHora } from "@/lib/ui";
import type { AdjuntoTarea, Tarea } from "@/types/db";
import { useFilasTarea } from "./useFilasTarea";

const BUCKET = "adjuntos";
const MAX_BYTES = 50 * 1024 * 1024; // igual que el límite del bucket
const ORDEN = { columna: "created_at", asc: false };

function formatoTamano(bytes: number | null) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Nombre seguro para la ruta en Storage (sin acentos, espacios ni símbolos raros). */
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

function Icono({ a }: { a: AdjuntoTarea }) {
  const props = { size: 18, className: "shrink-0 text-slate-500" };
  if (a.tipo === "link") return <Link2 {...props} className="shrink-0 text-marca-600" />;
  const m = a.mime ?? "";
  const ext = a.nombre.split(".").pop()?.toLowerCase() ?? "";
  if (m.startsWith("image/")) return <FileImage {...props} />;
  if (m.includes("pdf") || ["doc", "docx", "txt", "md"].includes(ext)) return <FileText {...props} />;
  if (m.includes("sheet") || m.includes("excel") || ["xls", "xlsx", "csv"].includes(ext))
    return <FileSpreadsheet {...props} />;
  if (["zip", "rar", "7z", "gz"].includes(ext)) return <FileArchive {...props} />;
  return <File {...props} />;
}

export default function PestanaArchivos({ tarea }: { tarea: Tarea }) {
  const supabase = supabaseNavegador();
  const { yo, esAdmin, miembroPorId, avisar } = useDatos();
  const { filas, cargando, recargar } = useFilasTarea<AdjuntoTarea>("adjuntos_tarea", tarea.id, ORDEN);

  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [subiendo, setSubiendo] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [nombreLink, setNombreLink] = useState("");

  async function subir(archivos: FileList | File[]) {
    const lista = Array.from(archivos);
    for (const archivo of lista) {
      if (archivo.size > MAX_BYTES) {
        avisar(`"${archivo.name}" pesa más de 50 MB.`);
        continue;
      }
      setSubiendo((s) => [...s, archivo.name]);
      const ruta = `${tarea.id}/${crypto.randomUUID()}-${nombreSeguro(archivo.name)}`;
      const { error: errSubida } = await supabase.storage
        .from(BUCKET)
        .upload(ruta, archivo, { contentType: archivo.type || undefined, upsert: false });

      if (errSubida) {
        avisar(`No se pudo subir "${archivo.name}": ${errSubida.message}`);
      } else {
        const { error } = await supabase.from("adjuntos_tarea").insert({
          tarea_id: tarea.id,
          miembro_id: yo.id,
          tipo: "archivo",
          nombre: archivo.name,
          ruta,
          mime: archivo.type || null,
          tamano: archivo.size,
        });
        if (error) {
          // No dejamos archivos huérfanos en Storage.
          await supabase.storage.from(BUCKET).remove([ruta]);
          avisar(error.message);
        }
      }
      setSubiendo((s) => s.filter((n) => n !== archivo.name));
    }
    recargar();
  }

  async function agregarLink(e: React.FormEvent) {
    e.preventDefault();
    let limpio = url.trim();
    if (!limpio) return;
    if (!/^https?:\/\//i.test(limpio)) limpio = `https://${limpio}`;
    let nombre = nombreLink.trim();
    try {
      const u = new URL(limpio);
      if (!nombre) nombre = u.hostname.replace(/^www\./, "") + (u.pathname !== "/" ? u.pathname : "");
    } catch {
      return avisar("Ese link no parece válido.");
    }
    const { error } = await supabase.from("adjuntos_tarea").insert({
      tarea_id: tarea.id,
      miembro_id: yo.id,
      tipo: "link",
      nombre: nombre.slice(0, 200),
      url: limpio,
    });
    if (error) return avisar(error.message);
    setUrl("");
    setNombreLink("");
    recargar();
  }

  async function abrir(a: AdjuntoTarea, descargar = false) {
    if (a.tipo === "link") {
      window.open(a.url!, "_blank", "noopener,noreferrer");
      return;
    }
    // Abrimos la pestaña antes del await para que el navegador no la bloquee.
    const ventana = descargar ? null : window.open("", "_blank");
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(a.ruta!, 60 * 10, descargar ? { download: a.nombre } : undefined);
    if (error || !data) {
      ventana?.close();
      return avisar(error?.message ?? "No se pudo abrir el archivo.");
    }
    if (ventana) {
      ventana.opener = null;
      ventana.location.href = data.signedUrl;
    } else {
      window.location.href = data.signedUrl;
    }
  }

  async function borrar(a: AdjuntoTarea) {
    if (!confirm(`¿Quitar "${a.nombre}" de la tarea?`)) return;
    const { error, count } = await supabase.from("adjuntos_tarea").delete({ count: "exact" }).eq("id", a.id);
    if (error || count === 0) return avisar(error?.message ?? "No tienes permiso para quitar este adjunto.");
    if (a.ruta) await supabase.storage.from(BUCKET).remove([a.ruta]);
    recargar();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Zona para soltar / elegir archivos */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          if (e.dataTransfer.files.length) subir(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          "flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed p-5 text-center text-sm transition",
          arrastrando
            ? "border-marca-500 bg-marca-50 text-marca-700"
            : "border-slate-300 text-slate-500 hover:border-marca-500 hover:bg-slate-50",
        )}
      >
        <Upload size={20} />
        <span>
          <b className="text-marca-700">Elige archivos</b> o arrástralos aquí
        </span>
        <span className="text-xs text-slate-400">PDF, imágenes, Word, Excel… hasta 50 MB c/u</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) subir(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Agregar link */}
      <form onSubmit={agregarLink} className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-[2]">
          <label className="etiqueta">Link</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.google.com/…"
            className="campo"
          />
        </div>
        <div className="min-w-32 flex-1">
          <label className="etiqueta">Nombre (opcional)</label>
          <input
            value={nombreLink}
            onChange={(e) => setNombreLink(e.target.value)}
            placeholder="Ej. Brief"
            className="campo"
          />
        </div>
        <button disabled={!url.trim()} className="btn-secundario">
          <Link2 size={14} /> Agregar
        </button>
      </form>

      {/* Lista */}
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {subiendo.map((n) => (
          <li key={`subiendo-${n}`} className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-500">
            <Loader2 size={18} className="shrink-0 animate-spin" />
            <span className="truncate">Subiendo {n}…</span>
          </li>
        ))}
        {cargando && <li className="p-4 text-center text-sm text-slate-400">Cargando…</li>}
        {!cargando && filas.length === 0 && subiendo.length === 0 && (
          <li className="flex flex-col items-center gap-1 p-6 text-center text-sm text-slate-400">
            <Paperclip size={18} />
            Sin archivos ni links todavía.
          </li>
        )}
        {filas.map((a) => {
          const autor = a.miembro_id ? miembroPorId.get(a.miembro_id) : null;
          const puedeBorrar = esAdmin || a.miembro_id === yo.id;
          return (
            <li key={a.id} className="group flex items-center gap-2.5 px-3 py-2 text-sm">
              <Icono a={a} />
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => abrir(a)}
                  title={a.tipo === "link" ? a.url! : a.nombre}
                  className="block max-w-full truncate text-left font-medium hover:text-marca-700 hover:underline"
                >
                  {a.nombre}
                </button>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Avatar nombre={autor?.nombre ?? "?"} tam={14} />
                  <span>{autor?.nombre ?? "—"}</span>
                  <span>· {formatoFechaHora(a.created_at)}</span>
                  {a.tipo === "archivo" && a.tamano != null && <span>· {formatoTamano(a.tamano)}</span>}
                </div>
              </div>
              {a.tipo === "archivo" ? (
                <button
                  onClick={() => abrir(a, true)}
                  title="Descargar"
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Download size={15} />
                </button>
              ) : (
                <button
                  onClick={() => abrir(a)}
                  title="Abrir link"
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <ExternalLink size={15} />
                </button>
              )}
              {puedeBorrar && (
                <button
                  onClick={() => borrar(a)}
                  title="Quitar"
                  className="rounded p-1.5 text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
