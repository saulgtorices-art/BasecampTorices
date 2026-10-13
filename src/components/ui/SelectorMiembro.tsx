"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import Popover from "./Popover";
import Avatar from "./Avatar";
import { useDatos } from "@/components/datos/DatosProvider";

export default function SelectorMiembro({
  valor,
  onCambiar,
  conNombre = true,
}: {
  valor: string | null;
  onCambiar: (id: string | null) => void;
  conNombre?: boolean;
}) {
  const { miembros, miembroPorId } = useDatos();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const actual = valor ? miembroPorId.get(valor) : null;

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-slate-100"
      >
        <Avatar nombre={actual?.nombre} />
        {conNombre && (
          <span className={clsx("truncate", !actual && "text-slate-400")}>
            {actual?.nombre ?? "Sin asignar"}
          </span>
        )}
      </button>
      <Popover ancla={ref.current} abierto={abierto} onCerrar={() => setAbierto(false)} ancho={220}>
        <div className="flex max-h-72 flex-col overflow-auto">
          {miembros
            .filter((m) => m.activo || m.id === valor)
            .map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setAbierto(false);
                  if (m.id !== valor) onCambiar(m.id);
                }}
                className={clsx(
                  "flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100",
                  m.id === valor && "bg-marca-50",
                )}
              >
                <Avatar nombre={m.nombre} />
                <span className="truncate">{m.nombre}</span>
              </button>
            ))}
          {valor && (
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
                onCambiar(null);
              }}
              className="mt-1 rounded border-t border-slate-100 px-2 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-100"
            >
              Quitar responsable
            </button>
          )}
        </div>
      </Popover>
    </>
  );
}
