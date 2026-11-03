"use client";

import { useState } from "react";
import { Mail, Send } from "lucide-react";
import { useDatos } from "@/components/datos/DatosProvider";
import { supabaseNavegador } from "@/lib/supabase/client";
import { TIPOS_CORREO } from "@/lib/correo-tipos";
import type { TipoNotificacion } from "@/types/db";

const PREDETERMINADOS: TipoNotificacion[] = ["mencion", "asignacion", "ticket", "eliminada", "importacion"];

/** Cada persona elige qué avisos le llegan también por correo. */
export default function AvisosCorreo() {
  const supabase = supabaseNavegador();
  const { yo, esAdmin, avisar } = useDatos();
  const [tipos, setTipos] = useState<TipoNotificacion[]>(yo.correo_tipos ?? PREDETERMINADOS);
  const [probando, setProbando] = useState(false);

  async function guardar(nuevos: TipoNotificacion[]) {
    const anteriores = tipos;
    setTipos(nuevos);
    const { error } = await supabase.rpc("actualizar_avisos_correo", { p_tipos: nuevos });
    if (error) {
      setTipos(anteriores);
      avisar(error.message);
    }
  }

  async function probar() {
    setProbando(true);
    const r = await fetch("/api/avisos-correo/prueba", { method: "POST" });
    const j = (await r.json().catch(() => ({}))) as { enviado?: string; error?: string };
    setProbando(false);
    if (r.ok) avisar(`Listo: revisa ${j.enviado} (y la carpeta de spam la primera vez).`, "ok");
    else avisar(j.error ?? "No se pudo enviar el correo de prueba.");
  }

  const visibles = TIPOS_CORREO.filter((t) => !t.soloLider || esAdmin);
  const todos = visibles.every((t) => tipos.includes(t.tipo));

  return (
    <section className="max-w-xl px-4 pb-8 md:px-6">
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <Mail size={18} className="mt-0.5 text-marca-600" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold">Avisos por correo</h2>
            <p className="text-xs text-slate-500">
              Además de la campanita, te llegan a <b>{yo.correo}</b>. Se guarda al marcar.
            </p>
          </div>
          <button
            type="button"
            className="text-xs text-marca-700 hover:underline"
            onClick={() => {
              const otros = tipos.filter((x) => !visibles.some((v) => v.tipo === x));
              guardar(todos ? otros : [...otros, ...visibles.map((v) => v.tipo)]);
            }}
          >
            {todos ? "Ninguno" : "Todos"}
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {visibles.map((t) => (
            <label key={t.tipo} className="flex cursor-pointer items-center gap-3 py-2">
              <input
                type="checkbox"
                checked={tipos.includes(t.tipo)}
                onChange={(e) => guardar(e.target.checked ? [...tipos, t.tipo] : tipos.filter((x) => x !== t.tipo))}
                className="h-4 w-4 accent-marca-600"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm">{t.texto}</div>
                <div className="text-xs text-slate-500">{t.detalle}</div>
              </div>
            </label>
          ))}
        </div>
        <button type="button" className="btn-secundario" onClick={probar} disabled={probando}>
          <Send size={14} /> {probando ? "Enviando…" : "Enviarme un correo de prueba"}
        </button>
      </div>
    </section>
  );
}
