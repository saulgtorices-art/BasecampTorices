import clsx from "clsx";
import { COLOR_CALIFICACION } from "@/lib/ui";

/** Píldora "59 · D" con el color de la calificación. */
export default function Calificacion({
  puntaje,
  calificacion,
  className,
}: {
  puntaje: number | null;
  calificacion: string | null;
  className?: string;
}) {
  if (puntaje === null || !calificacion) return null;
  const color = COLOR_CALIFICACION[calificacion] ?? "#64748b";
  return (
    <span
      className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", className)}
      style={{ color, background: `${color}14`, boxShadow: `inset 0 0 0 1px ${color}40` }}
    >
      {Math.round(puntaje)}
      <span className="opacity-60">·</span>
      {calificacion}
    </span>
  );
}
