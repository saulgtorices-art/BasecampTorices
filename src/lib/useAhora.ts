"use client";

import { useEffect, useState } from "react";

/** Devuelve Date.now() actualizado cada `ms` milisegundos (solo si `activo`). */
export function useAhora(activo = true, ms = 1000) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!activo) return;
    const id = setInterval(() => setAhora(Date.now()), ms);
    return () => clearInterval(id);
  }, [activo, ms]);
  return ahora;
}

export function formatoCronometro(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [h, m, ss].map((n) => String(n).padStart(2, "0")).join(":");
}
