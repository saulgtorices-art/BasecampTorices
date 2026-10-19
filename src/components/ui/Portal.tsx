"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Pinta a sus hijos directo en <body>. Úsalo para modales: si el modal vive
 * dentro de un contenedor con `backdrop-blur`/`transform` (como el Encabezado),
 * `position: fixed` queda atrapado en ese contenedor y se ve recortado.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  return montado ? createPortal(children, document.body) : null;
}
