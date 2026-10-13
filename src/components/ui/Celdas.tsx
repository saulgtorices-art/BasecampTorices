"use client";

import { useState } from "react";
import clsx from "clsx";

/** Input de texto que guarda al salir o con Enter; Escape cancela. */
export function CeldaTexto({
  valor,
  onGuardar,
  placeholder,
  className,
  lista,
  requerido,
}: {
  valor: string | null;
  onGuardar: (v: string | null) => void;
  placeholder?: string;
  className?: string;
  lista?: string;
  requerido?: boolean;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  const [previo, setPrevio] = useState(valor);
  // Si el valor cambia desde fuera (realtime), lo reflejamos.
  if (valor !== previo) {
    setPrevio(valor);
    setTexto(valor ?? "");
  }

  function guardar() {
    const limpio = texto.trim();
    if (requerido && !limpio) {
      setTexto(valor ?? "");
      return;
    }
    const nuevo = limpio === "" ? null : limpio;
    if (nuevo !== (valor ?? null)) onGuardar(nuevo);
  }

  return (
    <input
      value={texto}
      list={lista}
      placeholder={placeholder}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setTexto(valor ?? "");
          setTimeout(() => (e.target as HTMLInputElement).blur());
        }
      }}
      className={clsx("celda-input text-sm", className)}
    />
  );
}

/** Fecha editable: guarda cuando la fecha es completa y válida, o al vaciarla. */
export function CeldaFecha({
  valor,
  onGuardar,
  alerta,
}: {
  valor: string | null;
  onGuardar: (v: string | null) => void;
  alerta?: boolean;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  const [previo, setPrevio] = useState(valor);
  if (valor !== previo) {
    setPrevio(valor);
    setTexto(valor ?? "");
  }

  function intentar(v: string) {
    if (v === "") {
      if (valor !== null) onGuardar(null);
      return;
    }
    const anio = Number(v.slice(0, 4));
    if (/^\d{4}-\d{2}-\d{2}$/.test(v) && anio >= 2000 && anio <= 2100 && v !== valor) onGuardar(v);
  }

  return (
    <input
      type="date"
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        intentar(e.target.value);
      }}
      className={clsx(
        "celda-input text-xs",
        !texto && "text-slate-300",
        alerta && "font-semibold text-red-600",
      )}
    />
  );
}
