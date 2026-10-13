"use client";

import { Square, Timer } from "lucide-react";
import { useDatos } from "@/components/datos/DatosProvider";
import { formatoCronometro, useAhora } from "@/lib/useAhora";

/** Indicador flotante del temporizador activo del usuario. */
export default function BarraTemporizador() {
  const { temporizador, tareas, abrirTarea, detenerTemporizador } = useDatos();
  const ahora = useAhora(!!temporizador);
  if (!temporizador) return null;
  const tarea = tareas.find((t) => t.id === temporizador.tarea_id);

  return (
    <div className="fixed bottom-4 left-1/2 z-[70] flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-full bg-slate-900 py-1.5 pr-1.5 pl-4 text-sm text-white shadow-xl">
      <Timer size={16} className="shrink-0 animate-pulse text-green-400" />
      <span className="font-mono tabular-nums">
        {formatoCronometro(ahora - new Date(temporizador.inicio).getTime())}
      </span>
      <button
        onClick={() => abrirTarea(temporizador.tarea_id)}
        className="max-w-xs truncate text-slate-300 hover:text-white hover:underline"
      >
        {tarea?.titulo ?? "Tarea"}
      </button>
      <button
        onClick={() => detenerTemporizador()}
        className="flex items-center gap-1 rounded-full bg-red-500 px-3 py-1 text-xs font-medium hover:bg-red-600"
      >
        <Square size={11} fill="currentColor" /> Detener
      </button>
    </div>
  );
}
