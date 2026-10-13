"use client";

import { useCallback, useSyncExternalStore } from "react";

export type PreferenciaTema = "claro" | "oscuro" | "sistema";

import { CLAVE_TEMA as CLAVE } from "./temaScript";

function leerPreferencia(): PreferenciaTema {
  try {
    const v = localStorage.getItem(CLAVE);
    if (v === "claro" || v === "oscuro" || v === "sistema") return v;
  } catch {}
  return "sistema";
}

function esOscuro(p: PreferenciaTema) {
  return p === "oscuro" || (p === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches);
}

function aplicar(p: PreferenciaTema, animar: boolean) {
  const raiz = document.documentElement;
  if (animar) {
    raiz.classList.add("cambiando-tema");
    window.setTimeout(() => raiz.classList.remove("cambiando-tema"), 250);
  }
  raiz.classList.toggle("dark", esOscuro(p));
}

const oyentes = new Set<() => void>();
function emitir() {
  oyentes.forEach((f) => f());
}

function suscribir(f: () => void) {
  oyentes.add(f);
  const media = matchMedia("(prefers-color-scheme: dark)");
  const alCambiarSistema = () => {
    if (leerPreferencia() === "sistema") aplicar("sistema", true);
    f();
  };
  media.addEventListener("change", alCambiarSistema);
  const alStorage = (e: StorageEvent) => {
    if (e.key === CLAVE) {
      aplicar(leerPreferencia(), true);
      f();
    }
  };
  window.addEventListener("storage", alStorage);
  return () => {
    oyentes.delete(f);
    media.removeEventListener("change", alCambiarSistema);
    window.removeEventListener("storage", alStorage);
  };
}

/** Preferencia de tema + si el tema efectivo es oscuro. */
export function useTema() {
  const preferencia = useSyncExternalStore(suscribir, leerPreferencia, () => "sistema" as const);
  const oscuro = useSyncExternalStore(
    suscribir,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

  const cambiar = useCallback((p: PreferenciaTema) => {
    try {
      localStorage.setItem(CLAVE, p);
    } catch {}
    aplicar(p, true);
    emitir();
  }, []);

  /** Alterna claro ↔ oscuro (sale de "sistema"). */
  const alternar = useCallback(() => {
    cambiar(document.documentElement.classList.contains("dark") ? "claro" : "oscuro");
  }, [cambiar]);

  return { preferencia, oscuro, cambiar, alternar };
}
