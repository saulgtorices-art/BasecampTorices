"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Popover con posición fija (no lo recorta el overflow de la tabla).
 * Se cierra al hacer clic fuera, con Escape o al hacer scroll.
 */
export default function Popover({
  ancla,
  abierto,
  onCerrar,
  children,
  ancho = 200,
}: {
  ancla: HTMLElement | null;
  abierto: boolean;
  onCerrar: () => void;
  children: React.ReactNode;
  ancho?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!abierto || !ancla) return;
    const r = ancla.getBoundingClientRect();
    const alto = ref.current?.offsetHeight ?? 200;
    let top = r.bottom + 4;
    if (top + alto > window.innerHeight - 8) top = Math.max(8, r.top - alto - 4);
    let left = r.left + r.width / 2 - ancho / 2;
    left = Math.min(Math.max(8, left), window.innerWidth - ancho - 8);
    setPos({ top, left });
  }, [abierto, ancla, ancho]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || ancla?.contains(e.target as Node)) return;
      onCerrar();
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    const scroll = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      onCerrar();
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [abierto, ancla, onCerrar]);

  if (!abierto) return null;
  return createPortal(
    <div
      ref={ref}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: ancho }}
      className="fixed z-[90] rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"
    >
      {children}
    </div>,
    document.body,
  );
}
