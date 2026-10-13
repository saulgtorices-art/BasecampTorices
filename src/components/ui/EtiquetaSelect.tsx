"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import Popover from "./Popover";

/** Pastilla de color (estatus / prioridad) con selector al hacer clic. */
export function Etiqueta({
  valor,
  color,
  className,
}: {
  valor: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      style={{ backgroundColor: color }}
      className={clsx(
        "inline-flex w-full items-center justify-center truncate px-2 py-1 text-xs font-medium text-white",
        className,
      )}
      title={valor}
    >
      {valor}
    </span>
  );
}

export default function EtiquetaSelect<T extends string>({
  valor,
  opciones,
  colores,
  onCambiar,
  compacta,
}: {
  valor: T;
  opciones: readonly T[];
  colores: Record<T, string>;
  onCambiar: (v: T) => void;
  compacta?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className={clsx("block w-full", compacta ? "rounded" : "h-full")}
      >
        <Etiqueta valor={valor} color={colores[valor]} className={compacta ? "rounded" : "h-full py-2"} />
      </button>
      <Popover ancla={ref.current} abierto={abierto} onCerrar={() => setAbierto(false)} ancho={210}>
        <div className="flex flex-col gap-1">
          {opciones.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                setAbierto(false);
                if (o !== valor) onCambiar(o);
              }}
              className={clsx("rounded ring-offset-1", o === valor && "ring-2 ring-slate-400")}
            >
              <Etiqueta valor={o} color={colores[o]} className="rounded py-1.5" />
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}
