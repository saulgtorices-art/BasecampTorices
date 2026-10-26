"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronDown, ExternalLink, ListPlus, LoaderCircle } from "lucide-react";
import { COLOR_CALIFICACION, COLOR_SEVERIDAD, COLOR_ESTATUS } from "@/lib/ui";
import type { Tarea } from "@/types/db";
import type { Severidad, Vitales } from "@/lib/auditoria/tipos";

// ------------------------------------------------------------------ puntaje
export function AnilloPuntaje({ puntaje, calificacion }: { puntaje: number; calificacion: string }) {
  const color = COLOR_CALIFICACION[calificacion] ?? "#64748b";
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(Math.max(0, Math.min(100, puntaje)) / 100) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-4xl font-bold tabular-nums leading-none">{Math.round(puntaje)}</div>
        <div className="mt-0.5 text-[11px] text-slate-400">de 100</div>
        <div className="mt-1 rounded px-1.5 text-sm font-bold text-white" style={{ background: color }}>
          {calificacion}
        </div>
      </div>
    </div>
  );
}

export function colorPorcentaje(p: number | null) {
  if (p === null) return "#94a3b8";
  if (p >= 85) return COLOR_SEVERIDAD.positivo.punto;
  if (p >= 65) return COLOR_SEVERIDAD.mejora.punto;
  if (p >= 45) return COLOR_SEVERIDAD.importante.punto;
  return COLOR_SEVERIDAD.critico.punto;
}

export function Barra({ porcentaje, alto = 6 }: { porcentaje: number | null; alto?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-slate-100" style={{ height: alto }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${porcentaje ?? 0}%`, background: colorPorcentaje(porcentaje) }}
      />
    </div>
  );
}

export function Delta({ valor, sufijo = "" }: { valor: number | null; sufijo?: string }) {
  if (valor === null || Math.abs(valor) < 0.5) return null;
  const sube = valor > 0;
  return (
    <span className={clsx("text-xs font-semibold tabular-nums", sube ? "text-green-600" : "text-red-600")}>
      {sube ? "▲" : "▼"} {Math.abs(Math.round(valor))}
      {sufijo}
    </span>
  );
}

// ------------------------------------------------------------------ chips
export function ChipSeveridad({ severidad, className }: { severidad: Severidad; className?: string }) {
  const s = COLOR_SEVERIDAD[severidad];
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", className)}
      style={{ background: s.fondo, color: s.texto }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.punto }} />
      {s.nombre}
    </span>
  );
}

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600", className)}>
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ tareas
export function BotonTarea({
  tarea,
  creando,
  onCrear,
  onAbrir,
}: {
  tarea: Tarea | null | undefined;
  creando: boolean;
  onCrear: () => void;
  onAbrir: (id: string) => void;
}) {
  if (tarea)
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAbrir(tarea.id);
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 print:hidden"
        title="Abrir la tarea"
      >
        <span className="h-2 w-2 rounded-full" style={{ background: COLOR_ESTATUS[tarea.estatus] }} />
        {tarea.estatus}
      </button>
    );
  return (
    <button
      type="button"
      disabled={creando}
      onClick={(e) => {
        e.stopPropagation();
        onCrear();
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-marca-100 bg-marca-50 px-2 py-1 text-xs font-medium text-marca-700 hover:bg-marca-100 disabled:opacity-50 print:hidden"
    >
      {creando ? <LoaderCircle size={12} className="animate-spin" /> : <ListPlus size={12} />}
      Crear tarea
    </button>
  );
}

// ------------------------------------------------------------------ hallazgo
export function FilaHallazgo({
  severidad,
  titulo,
  resumen,
  derecha,
  children,
  abiertoInicial = false,
}: {
  severidad: Severidad;
  titulo: string;
  resumen?: string;
  derecha?: React.ReactNode;
  children?: React.ReactNode;
  abiertoInicial?: boolean;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  return (
    <div className="border-t border-slate-100 first:border-t-0 print:break-inside-avoid">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setAbierto((v) => !v)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setAbierto((v) => !v))}
        className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-slate-50/70"
      >
        <ChipSeveridad severidad={severidad} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-800">{titulo}</div>
          {resumen && <div className={clsx("mt-0.5 text-xs text-slate-500", !abierto && "line-clamp-1")}>{resumen}</div>}
        </div>
        {derecha}
        <ChevronDown size={16} className={clsx("mt-0.5 shrink-0 text-slate-400 transition print:hidden", abierto && "rotate-180")} />
      </div>
      <div className={clsx("px-4 pb-4 pl-[6.25rem] max-md:pl-4", abierto ? "block" : "hidden print:block")}>{children}</div>
    </div>
  );
}

export function Recomendacion({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border-l-4 border-marca-500 bg-marca-50/60 px-3 py-2 text-sm text-slate-700">
      <div className="mb-0.5 text-[11px] font-semibold tracking-wide text-marca-700 uppercase">Recomendación</div>
      {children}
    </div>
  );
}

export function Evidencia({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-2 space-y-1">
      {items.map((x, i) => (
        <li key={i} className="truncate rounded bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600" title={x}>
          {/^https?:\/\//.test(x) ? (
            <a href={x} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-marca-700">
              {x} <ExternalLink size={10} />
            </a>
          ) : (
            x
          )}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ vitales
const UMBRALES = {
  lcp: [2500, 4000],
  cls: [0.1, 0.25],
  inp: [200, 500],
  tbt: [200, 600],
  fcp: [1800, 3000],
  ttfb: [800, 1800],
} as const;

function colorVital(k: keyof typeof UMBRALES, v: number | null) {
  if (v === null) return "#94a3b8";
  const [bien, mal] = UMBRALES[k];
  return v <= bien ? COLOR_SEVERIDAD.positivo.punto : v <= mal ? COLOR_SEVERIDAD.mejora.punto : COLOR_SEVERIDAD.critico.punto;
}

function formatoVital(k: keyof typeof UMBRALES, v: number | null) {
  if (v === null) return "—";
  if (k === "cls") return v.toFixed(2);
  if (k === "lcp" || k === "fcp") return `${(v / 1000).toFixed(1)} s`;
  return `${Math.round(v)} ms`;
}

export function Vital({ nombre, clave, valor, nota }: { nombre: string; clave: keyof typeof UMBRALES; valor: number | null; nota?: string }) {
  const color = colorVital(clave, valor);
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {nombre}
      </div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums" style={{ color: valor === null ? undefined : color }}>
        {formatoVital(clave, valor)}
      </div>
      {nota && <div className="text-[10px] text-slate-400">{nota}</div>}
    </div>
  );
}

export function vitalesConFuente(campo: (Vitales & { fuente: string }) | null, lab: Vitales) {
  return {
    lcp: campo?.lcp ?? lab.lcp,
    lcpFuente: campo?.lcp != null ? "campo" : "laboratorio",
    cls: campo?.cls ?? lab.cls,
    clsFuente: campo?.cls != null ? "campo" : "laboratorio",
    inp: campo?.inp ?? null,
    tbt: lab.tbt,
  };
}

export function MedidorLH({ nombre, valor }: { nombre: string; valor: number | null }) {
  const color = valor === null ? "#94a3b8" : valor >= 90 ? COLOR_SEVERIDAD.positivo.punto : valor >= 50 ? COLOR_SEVERIDAD.mejora.punto : COLOR_SEVERIDAD.critico.punto;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold tabular-nums"
        style={{ color, boxShadow: `inset 0 0 0 3px ${color}`, background: `${color}10` }}
      >
        {valor ?? "—"}
      </div>
      <div className="text-center text-[10px] leading-tight text-slate-500">{nombre}</div>
    </div>
  );
}

export function Seccion({
  id,
  titulo,
  subtitulo,
  acciones,
  children,
  className,
}: {
  id?: string;
  titulo: string;
  subtitulo?: string;
  acciones?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={clsx("scroll-mt-20 rounded-xl border border-slate-200 bg-white print:break-inside-avoid-page", className)}>
      <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 px-4 py-3">
        <div className="mr-auto">
          <h2 className="text-base font-semibold">{titulo}</h2>
          {subtitulo && <p className="text-xs text-slate-500">{subtitulo}</p>}
        </div>
        {acciones}
      </div>
      {children}
    </section>
  );
}
