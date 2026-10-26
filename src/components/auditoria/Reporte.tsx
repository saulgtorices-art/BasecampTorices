"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  ArrowLeft,
  CircleAlert,
  ExternalLink,
  ListPlus,
  LoaderCircle,
  Monitor,
  Printer,
  RefreshCw,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";
import Encabezado from "@/components/Encabezado";
import { useDatos } from "@/components/datos/DatosProvider";
import { supabaseNavegador } from "@/lib/supabase/client";
import { formatoFechaHora } from "@/lib/ui";
import type { Auditoria, AuditoriaTarea, Prioridad } from "@/types/db";
import {
  CATEGORIAS,
  NOMBRE_CATEGORIA,
  PESO_CATEGORIA,
  type Categoria,
  type Cuadrante,
  type Hallazgo,
  type HallazgoIA,
  type Severidad,
} from "@/lib/auditoria/tipos";
import { useGenerarAuditoria } from "./BotonAuditoria";
import { estaAbandonada, MS_ABANDONO } from "./useAuditorias";
import {
  AnilloPuntaje,
  Barra,
  BotonTarea,
  Chip,
  ChipSeveridad,
  Delta,
  Evidencia,
  FilaHallazgo,
  MedidorLH,
  Recomendacion,
  Seccion,
  Vital,
  vitalesConFuente,
  colorPorcentaje,
} from "./partes";

const ORDEN: Record<Severidad, number> = { critico: 0, importante: 1, mejora: 2, ia: 3, pendiente: 4, positivo: 5 };
const PRIORIDAD: Partial<Record<Severidad, Prioridad>> = { critico: "Alta", importante: "Media", mejora: "Baja" };

const CUADRANTES: { id: Cuadrante; titulo: string; nota: string; color: string }[] = [
  { id: "quick-win", titulo: "Quick wins", nota: "Alto impacto · poco esfuerzo", color: "#16A34A" },
  { id: "proyecto", titulo: "Proyectos", nota: "Alto impacto · más esfuerzo", color: "#2552e0" },
  { id: "mejora-menor", titulo: "Mejoras menores", nota: "Menor impacto · poco esfuerzo", color: "#D97706" },
  { id: "despues", titulo: "Para después", nota: "Menor impacto · mucho esfuerzo", color: "#94A3B8" },
];

type Previa = Pick<Auditoria, "id" | "puntaje" | "calificacion" | "puntajes" | "created_at" | "resultado">;

const PASOS = [
  "Descargando la página y corriendo PageSpeed",
  "Revisando páginas del menú",
  "Esperando resultados de PageSpeed",
  "Redactando veredictos",
];

export default function Reporte({ id }: { id: string }) {
  const supabase = supabaseNavegador();
  const { clientePorId, miembroPorId, tareas, crearTarea, abrirTarea, avisar, yo } = useDatos();
  const { generar, generando } = useGenerarAuditoria();
  const [a, setA] = useState<Auditoria | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [vinculos, setVinculos] = useState<Map<string, string>>(new Map());
  const [creando, setCreando] = useState<Set<string>>(new Set());
  const [ahora, setAhora] = useState(() => Date.now());

  // ---------------------------------------------------------------- carga
  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from("auditorias").select("*").eq("id", id).maybeSingle();
    if (error || !data) {
      setNoExiste(true);
      return;
    }
    setA(data as Auditoria);
  }, [supabase, id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const enCurso = a?.estado === "en_proceso" && !estaAbandonada(a);
  useEffect(() => {
    if (!enCurso) return;
    const t = setInterval(() => {
      setAhora(Date.now());
      void cargar();
    }, 4000);
    return () => clearInterval(t);
  }, [enCurso, cargar]);

  useEffect(() => {
    if (a?.estado !== "lista") return;
    void (async () => {
      const [p, v] = await Promise.all([
        supabase
          .from("auditorias")
          .select("id, puntaje, calificacion, puntajes, created_at, resultado")
          .eq("cliente_id", a.cliente_id)
          .eq("estado", "lista")
          .lt("created_at", a.created_at)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("auditoria_tareas").select("*").eq("auditoria_id", a.id),
      ]);
      setPrevia((p.data as Previa) ?? null);
      setVinculos(new Map(((v.data ?? []) as AuditoriaTarea[]).map((x) => [x.hallazgo_id, x.tarea_id])));
    })();
  }, [supabase, a?.estado, a?.cliente_id, a?.created_at, a?.id]);

  const r = a?.resultado ?? null;
  const cliente = a ? clientePorId.get(a.cliente_id) : undefined;
  const tareaPorId = useMemo(() => new Map(tareas.map((t) => [t.id, t])), [tareas]);
  const hallazgoPorId = useMemo(() => new Map((r?.hallazgos ?? []).map((h) => [h.id, h])), [r]);

  // ---------------------------------------------------------------- tareas
  async function crearDesde(clave: string, datos: { titulo: string; severidad: Severidad; detalle: string; recomendacion: string; area?: string }) {
    if (!a || creando.has(clave) || vinculos.has(clave)) return;
    setCreando((s) => new Set(s).add(clave));
    try {
      const enlace = `${window.location.origin}/auditorias/${a.id}`;
      const t = await crearTarea({
        cliente_id: a.cliente_id,
        titulo: `UX/UI · ${datos.titulo}`.slice(0, 200),
        prioridad: PRIORIDAD[datos.severidad] ?? "Media",
        proyecto: "Auditoría UX/UI",
        documento_url: enlace,
        comentarios: [
          datos.detalle,
          `Recomendación: ${datos.recomendacion}`,
          datos.area ? `Área: ${datos.area}` : "",
          `Auditoría del ${formatoFechaHora(a.created_at)} (${a.url})`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
      if (!t) return;
      const { error } = await supabase
        .from("auditoria_tareas")
        .insert({ auditoria_id: a.id, hallazgo_id: clave, tarea_id: t.id, creado_por: yo.id });
      if (error) avisar(error.message);
      setVinculos((m) => new Map(m).set(clave, t.id));
      avisar("Tarea creada", "ok");
    } finally {
      setCreando((s) => {
        const n = new Set(s);
        n.delete(clave);
        return n;
      });
    }
  }

  const crearDesdeHallazgo = (h: Hallazgo) =>
    crearDesde(h.id, { titulo: h.titulo, severidad: h.severidad, detalle: h.detalle, recomendacion: h.recomendacion, area: h.area });
  const crearDesdeIA = (h: HallazgoIA) =>
    crearDesde(h.id, { titulo: h.titulo, severidad: h.severidad, detalle: h.detalle, recomendacion: h.recomendacion });

  const botonTarea = (clave: string, crear: () => void) => (
    <BotonTarea
      tarea={vinculos.has(clave) ? tareaPorId.get(vinculos.get(clave)!) : null}
      creando={creando.has(clave)}
      onCrear={crear}
      onAbrir={abrirTarea}
    />
  );

  // ---------------------------------------------------------------- comparación
  const comparacion = useMemo(() => {
    if (!previa?.resultado || !r || previa.puntaje === null || a?.puntaje == null) return null;
    const antes = new Map(previa.resultado.hallazgos.map((h) => [h.id, h]));
    const resueltos = r.hallazgos.filter((h) => h.estado === "ok" && ["falla", "parcial"].includes(antes.get(h.id)?.estado ?? ""));
    const nuevos = r.hallazgos.filter((h) => ["falla", "parcial"].includes(h.estado) && antes.get(h.id)?.estado === "ok");
    return { delta: Number(a.puntaje) - Number(previa.puntaje), resueltos, nuevos };
  }, [previa, r, a?.puntaje]);

  // ---------------------------------------------------------------- render
  const acciones = a && (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Link href="/auditorias" className="btn-secundario">
        <ArrowLeft size={14} /> Todas
      </Link>
      {a.estado !== "en_proceso" || estaAbandonada(a) ? (
        <button className="btn-secundario" disabled={generando} onClick={() => generar(a.cliente_id, a.url)}>
          {generando ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Volver a auditar
        </button>
      ) : null}
      {a.estado === "lista" && (
        <button className="btn-primario" onClick={() => window.print()}>
          <Printer size={14} /> Imprimir / PDF
        </button>
      )}
    </div>
  );

  if (noExiste)
    return (
      <>
        <Encabezado titulo="Auditoría no encontrada" />
        <div className="p-6 text-sm text-slate-500">
          No existe o no tienes acceso. <Link href="/auditorias" className="text-marca-700 underline">Ver auditorías</Link>
        </div>
      </>
    );

  if (!a)
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <LoaderCircle className="animate-spin" />
      </div>
    );

  const titulo = `Auditoría UX/UI · ${cliente?.nombre ?? ""}`;
  const subtitulo = `${a.url.replace(/^https?:\/\//, "")} · ${formatoFechaHora(a.created_at)}${
    a.creado_por && miembroPorId.get(a.creado_por) ? ` · ${miembroPorId.get(a.creado_por)!.nombre}` : ""
  }`;

  // ------------------------------------------------ en proceso / error
  if (a.estado !== "lista" || !r) {
    const fallo = a.estado === "error" || estaAbandonada(a);
    const segundos = Math.max(0, Math.round((ahora - new Date(a.created_at).getTime()) / 1000));
    const pasoActual = PASOS.findIndex((p) => a.progreso?.startsWith(p.slice(0, 18)));
    return (
      <>
        <Encabezado titulo={titulo} subtitulo={subtitulo}>
          {acciones}
        </Encabezado>
        <div className="mx-auto max-w-xl p-6">
          {fallo ? (
            <div className="rounded-xl border border-red-200 bg-white p-6">
              <div className="flex items-center gap-2 font-semibold text-red-700">
                <CircleAlert size={18} /> La auditoría no se completó
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {a.error ?? `Se interrumpió sin avance por más de ${MS_ABANDONO / 60000} minutos (límite de tiempo del servidor).`}
              </p>
              <p className="mt-3 text-xs text-slate-400">
                Revisa que la URL abra en el navegador y vuelve a intentarlo con «Volver a auditar».
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <LoaderCircle className="animate-spin text-marca-600" size={22} />
                <div>
                  <div className="font-semibold">Auditando {a.url.replace(/^https?:\/\//, "")}</div>
                  <div className="text-xs text-slate-500">
                    {segundos} s · suele tardar entre 1 y 3 minutos. Puedes salir; el reporte queda guardado.
                  </div>
                </div>
              </div>
              <ol className="mt-5 space-y-2 text-sm">
                {PASOS.map((p, i) => (
                  <li
                    key={p}
                    className={clsx(
                      "flex items-center gap-2",
                      i < pasoActual ? "text-slate-400 line-through" : i === pasoActual ? "font-medium text-slate-800" : "text-slate-400",
                    )}
                  >
                    <span
                      className={clsx(
                        "h-2 w-2 rounded-full",
                        i < pasoActual ? "bg-green-500" : i === pasoActual ? "animate-pulse bg-marca-600" : "bg-slate-200",
                      )}
                    />
                    {p}
                  </li>
                ))}
              </ol>
              {a.progreso && <p className="mt-4 text-xs text-slate-500">{a.progreso}</p>}
            </div>
          )}
        </div>
      </>
    );
  }

  // ------------------------------------------------ reporte
  const puntajes = a.puntajes!;
  const ordenados = [...r.hallazgos].sort((x, y) => ORDEN[x.severidad] - ORDEN[y.severidad] || y.peso - x.peso);
  const pendientes = ordenados.filter((h) => h.estado === "falla" || h.estado === "parcial");
  const conteo = (s: Severidad) => r.hallazgos.filter((h) => h.severidad === s).length + r.hallazgosIA.filter((h) => h.severidad === s).length;
  const quick = r.quickWins.map((qid) => hallazgoPorId.get(qid)).filter(Boolean) as Hallazgo[];
  const movil = r.pagespeed.movil;
  const escritorio = r.pagespeed.escritorio;
  const vm = movil?.ok ? vitalesConFuente(movil.campo, movil.laboratorio) : null;

  return (
    <>
      <Encabezado titulo={titulo} subtitulo={subtitulo}>
        {acciones}
      </Encabezado>

      <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6 print:max-w-none print:p-0">
        {/* =========================================================== resumen */}
        <section className="grid gap-5 rounded-xl border border-slate-200 bg-white p-5 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,20rem)]">
          <div className="flex flex-col items-center gap-2">
            <AnilloPuntaje puntaje={Number(a.puntaje)} calificacion={a.calificacion!} />
            {comparacion && (
              <div className="text-center text-xs text-slate-500">
                <Delta valor={comparacion.delta} /> vs. {formatoFechaHora(previa!.created_at)}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
              Diagnóstico
              {r.generadoConIA && (
                <span className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 font-medium normal-case tracking-normal text-violet-700">
                  <Sparkles size={11} /> Redactado con IA
                </span>
              )}
            </div>
            <p className="text-[15px] leading-relaxed text-slate-700">{r.resumen}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(["critico", "importante", "mejora", "positivo"] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                  <ChipSeveridad severidad={s} />
                  <span className="font-semibold tabular-nums">{conteo(s)}</span>
                </span>
              ))}
            </div>
            {comparacion && (comparacion.resueltos.length > 0 || comparacion.nuevos.length > 0) && (
              <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Desde la auditoría anterior:{" "}
                {comparacion.resueltos.length > 0 && (
                  <span className="text-green-700">
                    {comparacion.resueltos.length} resuelto(s) ({comparacion.resueltos.slice(0, 3).map((h) => h.titulo).join("; ")})
                  </span>
                )}
                {comparacion.resueltos.length > 0 && comparacion.nuevos.length > 0 && " · "}
                {comparacion.nuevos.length > 0 && (
                  <span className="text-red-700">
                    {comparacion.nuevos.length} nuevo(s) ({comparacion.nuevos.slice(0, 3).map((h) => h.titulo).join("; ")})
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            {CATEGORIAS.map((c) => (
              <a key={c} href={`#cat-${c}`} className="block rounded-md px-1 py-0.5 hover:bg-slate-50">
                <div className="mb-1 flex items-baseline gap-2 text-xs">
                  <span className="mr-auto font-medium text-slate-700">{NOMBRE_CATEGORIA[c]}</span>
                  {previa?.puntajes && (
                    <Delta valor={puntajes[c].obtenido - previa.puntajes[c].obtenido} />
                  )}
                  <span className="tabular-nums text-slate-500">
                    <b className="text-slate-800">{puntajes[c].porcentaje === null ? "—" : puntajes[c].obtenido.toFixed(1)}</b>/{PESO_CATEGORIA[c]}
                  </span>
                </div>
                <Barra porcentaje={puntajes[c].porcentaje} />
              </a>
            ))}
          </div>
        </section>

        {/* =========================================================== capturas y vitales */}
        <Seccion
          titulo="Lo que ve el usuario"
          subtitulo={`Primer pantallazo y Core Web Vitals${vm ? ` (${vm.lcpFuente === "campo" ? "usuarios reales, CrUX" : "laboratorio"})` : ""} · PageSpeed Insights${movil?.version ? ` · Lighthouse ${movil.version}` : ""}`}
        >
          <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
            <div className="flex flex-col items-center">
              {a.capturas?.movil ? (
                <div className="w-48 overflow-hidden rounded-[1.6rem] border-[6px] border-slate-800 bg-slate-800 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.capturas.movil} alt="Captura en móvil" className="block w-full rounded-[1.1rem]" />
                </div>
              ) : (
                <div className="flex h-72 w-48 items-center justify-center rounded-3xl border border-dashed border-slate-300 text-xs text-slate-400">
                  Sin captura móvil
                </div>
              )}
              <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                <Smartphone size={12} /> Móvil
              </div>
            </div>
            <div className="min-w-0 space-y-4">
              {a.capturas?.escritorio && (
                <div>
                  <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
                      <span className="h-2 w-2 rounded-full bg-slate-300" />
                      <span className="h-2 w-2 rounded-full bg-slate-300" />
                      <span className="h-2 w-2 rounded-full bg-slate-300" />
                      <span className="ml-2 truncate text-[10px] text-slate-400">{r.urlFinal}</span>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.capturas.escritorio} alt="Captura en escritorio" className="block max-h-80 w-full object-cover object-top" />
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <Monitor size={12} /> Escritorio
                  </div>
                </div>
              )}
              {vm ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Vital nombre="LCP · carga" clave="lcp" valor={vm.lcp} nota={vm.lcpFuente} />
                  <Vital nombre="CLS · estabilidad" clave="cls" valor={vm.cls} nota={vm.clsFuente} />
                  {vm.inp !== null ? (
                    <Vital nombre="INP · respuesta" clave="inp" valor={vm.inp} nota="campo" />
                  ) : (
                    <Vital nombre="TBT · bloqueo" clave="tbt" valor={vm.tbt} nota="laboratorio" />
                  )}
                  <Vital nombre="TTFB · servidor" clave="ttfb" valor={r.red.ttfbMs} nota="medido por la auditoría" />
                </div>
              ) : (
                <p className="text-sm text-slate-500">{movil?.error ?? "PageSpeed no devolvió datos de móvil."}</p>
              )}
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-3">
                {[
                  { n: "Móvil", p: movil },
                  { n: "Escritorio", p: escritorio },
                ].map(({ n, p }) => (
                  <div key={n}>
                    <div className="mb-2 text-xs font-medium text-slate-500">{n}</div>
                    <div className="flex flex-wrap gap-3">
                      <MedidorLH nombre="Rendimiento" valor={p?.puntajes.rendimiento ?? null} />
                      <MedidorLH nombre="Accesib." valor={p?.puntajes.accesibilidad ?? null} />
                      <MedidorLH nombre="Prácticas" valor={p?.puntajes.buenasPracticas ?? null} />
                      <MedidorLH nombre="SEO" valor={p?.puntajes.seo ?? null} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Seccion>

        {/* =========================================================== quick wins */}
        {quick.length > 0 && (
          <Seccion
            titulo="Quick wins"
            subtitulo="Alto impacto y poco esfuerzo: empezar por aquí."
            acciones={
              quick.some((h) => !vinculos.has(h.id)) && (
                <button
                  className="btn-secundario text-xs print:hidden"
                  onClick={async () => {
                    for (const h of quick) if (!vinculos.has(h.id)) await crearDesdeHallazgo(h);
                  }}
                >
                  <ListPlus size={13} /> Crear todas las tareas
                </button>
              )
            }
          >
            <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-3">
              {quick.map((h, i) => (
                <div key={h.id} className="flex flex-col gap-2 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-50 text-xs font-bold text-green-700">
                      {i + 1}
                    </span>
                    <ChipSeveridad severidad={h.severidad} />
                    <Chip className="ml-auto">{NOMBRE_CATEGORIA[h.categoria]}</Chip>
                  </div>
                  <div className="text-sm font-medium">{h.titulo}</div>
                  <div className="text-xs text-slate-500">{h.detalle}</div>
                  <div className="text-xs text-slate-700">
                    <Zap size={11} className="mr-1 inline text-green-600" />
                    {h.recomendacion}
                  </div>
                  <div className="mt-auto flex items-center gap-2 pt-1">
                    <Chip>{h.area}</Chip>
                    <span className="ml-auto">{botonTarea(h.id, () => crearDesdeHallazgo(h))}</span>
                  </div>
                </div>
              ))}
            </div>
          </Seccion>
        )}

        {/* =========================================================== categorías */}
        {CATEGORIAS.map((c) => (
          <SeccionCategoria
            key={c}
            categoria={c}
            porcentaje={puntajes[c].porcentaje}
            obtenido={puntajes[c].obtenido}
            veredicto={r.veredictos[c]}
            hallazgos={ordenados.filter((h) => h.categoria === c)}
            hallazgosIA={r.hallazgosIA.filter((h) => h.categoria === c)}
            botonTarea={botonTarea}
            crearDesdeHallazgo={crearDesdeHallazgo}
            crearDesdeIA={crearDesdeIA}
          />
        ))}

        {/* =========================================================== matriz */}
        {pendientes.length > 0 && (
          <Seccion titulo="Matriz impacto / esfuerzo" subtitulo="Todos los hallazgos pendientes, agrupados para planear el sprint.">
            <div className="grid gap-px bg-slate-100 sm:grid-cols-2">
              {CUADRANTES.map((q) => {
                const items = pendientes.filter((h) => h.cuadrante === q.id);
                return (
                  <div key={q.id} className="bg-white p-4">
                    <div className="mb-2 flex items-baseline gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: q.color }} />
                      <span className="font-semibold" style={{ color: q.color }}>
                        {q.titulo}
                      </span>
                      <span className="text-xs text-slate-400">{q.nota}</span>
                      <span className="ml-auto text-xs font-semibold text-slate-500">{items.length}</span>
                    </div>
                    <ul className="space-y-1">
                      {items.map((h) => (
                        <li key={h.id} className="flex items-center gap-2 text-xs text-slate-600">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorPorcentaje(h.estado === "falla" ? 0 : 50) }} />
                          <a href={`#h-${h.id}`} className="truncate hover:text-marca-700">
                            {h.titulo}
                          </a>
                        </li>
                      ))}
                      {items.length === 0 && <li className="text-xs text-slate-300">—</li>}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Seccion>
        )}

        {/* =========================================================== próximos pasos */}
        {r.proximosPasos.length > 0 && (
          <Seccion titulo="Próximos pasos" subtitulo="Orden sugerido de trabajo.">
            <ol>
              {r.proximosPasos.map((p, i) => {
                const clave = `paso-${i + 1}`;
                const sev: Severidad = i < 2 ? "importante" : "mejora";
                return (
                  <li key={clave} className="flex items-start gap-3 border-t border-slate-100 px-4 py-3 first:border-t-0 print:break-inside-avoid">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-marca-600 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{p.titulo}</div>
                      <div className="mt-0.5 text-xs text-slate-600">{p.detalle}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Chip>Esfuerzo {p.esfuerzo}</Chip>
                        <Chip>{p.area}</Chip>
                        {(p.hallazgos ?? []).map((hid) => (
                          <a key={hid} href={`#h-${hid}`}>
                            <Chip className="hover:bg-slate-200">{hallazgoPorId.get(hid)?.titulo ?? hid}</Chip>
                          </a>
                        ))}
                      </div>
                    </div>
                    {botonTarea(clave, () =>
                      crearDesde(clave, { titulo: p.titulo, severidad: sev, detalle: p.detalle, recomendacion: p.detalle, area: p.area }),
                    )}
                  </li>
                );
              })}
            </ol>
          </Seccion>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          {/* =========================================================== páginas */}
          <Seccion titulo="Páginas clave del menú" subtitulo="Respuesta, title y H1 de las páginas enlazadas en la navegación.">
            {r.paginas.length === 0 ? (
              <p className="p-4 text-sm text-slate-400">No se revisaron páginas internas.</p>
            ) : (
              <ul>
                {r.paginas.map((p) => (
                  <li key={p.url} className="flex items-start gap-3 border-t border-slate-100 px-4 py-2.5 text-xs first:border-t-0">
                    <span
                      className={clsx(
                        "mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono font-semibold",
                        p.status && p.status < 400 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700",
                      )}
                    >
                      {p.status ?? "ERR"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-marca-700">
                        {p.texto} <ExternalLink size={10} />
                      </a>
                      <div className="truncate text-slate-500">{p.titulo ?? p.error ?? "Sin title"}</div>
                      <div className={clsx("truncate", p.h1 ? "text-slate-400" : "text-amber-600")}>{p.h1 ? `H1: ${p.h1}` : "Sin H1"}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          {/* =========================================================== lagunas */}
          <Seccion titulo="Lagunas de la investigación" subtitulo="Lo que esta auditoría no pudo comprobar.">
            <ul className="space-y-2 p-4 text-sm text-slate-600">
              {r.lagunas.map((l, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                  {l}
                </li>
              ))}
              {r.hallazgos.filter((h) => h.estado === "na").length > 0 && (
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                  <span>
                    Sin evaluar:{" "}
                    {r.hallazgos
                      .filter((h) => h.estado === "na")
                      .map((h) => h.titulo)
                      .join("; ")}
                    .
                  </span>
                </li>
              )}
            </ul>
          </Seccion>
        </div>

        {/* =========================================================== anexo */}
        <Seccion titulo="Anexo: cómo se calculó el puntaje" subtitulo="Cada categoría = puntos obtenidos ÷ puntos evaluables × su peso. Los checks sin datos no cuentan.">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Categoría</th>
                  <th className="px-3 py-2 text-left font-medium">Check</th>
                  <th className="px-3 py-2 text-left font-medium">Fuente</th>
                  <th className="px-3 py-2 text-right font-medium">Puntos</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIAS.flatMap((c) => [
                  <tr key={c} className="border-t border-slate-200 bg-slate-50/60 font-semibold">
                    <td className="px-3 py-1.5" colSpan={3}>
                      {NOMBRE_CATEGORIA[c]} · peso {PESO_CATEGORIA[c]}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {puntajes[c].obtenido.toFixed(1)} / {PESO_CATEGORIA[c]}
                    </td>
                  </tr>,
                  ...r.hallazgos
                    .filter((h) => h.categoria === c)
                    .map((h) => (
                      <tr key={h.id} className="border-t border-slate-100">
                        <td className="px-3 py-1.5">
                          <ChipSeveridad severidad={h.severidad} />
                        </td>
                        <td className="px-3 py-1.5 text-slate-700">
                          {h.titulo} <span className="font-mono text-[10px] text-slate-400">{h.id}</span>
                        </td>
                        <td className="px-3 py-1.5 text-slate-500">{h.fuente === "pagespeed" ? "PageSpeed" : h.fuente === "red" ? "Red" : "HTML"}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{h.estado === "na" ? "—" : `${h.puntos} / ${h.peso}`}</td>
                      </tr>
                    )),
                ])}
              </tbody>
            </table>
          </div>
        </Seccion>

        <p className="pb-6 text-center text-[11px] text-slate-400">
          {r.urlFinal} · {Math.round(r.duracionMs / 1000)} s
          {r.modeloIA ? ` · Redacción: ${r.modeloIA}` : " · Sin IA (configura ANTHROPIC_API_KEY)"}
          {r.red.redirecciones.length > 0 && ` · Redirecciones: ${r.red.redirecciones.join(", ")}`}
        </p>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ categoría
function SeccionCategoria({
  categoria,
  porcentaje,
  obtenido,
  veredicto,
  hallazgos,
  hallazgosIA,
  botonTarea,
  crearDesdeHallazgo,
  crearDesdeIA,
}: {
  categoria: Categoria;
  porcentaje: number | null;
  obtenido: number;
  veredicto: { titular: string; texto: string };
  hallazgos: Hallazgo[];
  hallazgosIA: HallazgoIA[];
  botonTarea: (clave: string, crear: () => void) => React.ReactNode;
  crearDesdeHallazgo: (h: Hallazgo) => void;
  crearDesdeIA: (h: HallazgoIA) => void;
}) {
  const [verBien, setVerBien] = useState(false);
  const pendientes = hallazgos.filter((h) => h.estado === "falla" || h.estado === "parcial");
  const bien = hallazgos.filter((h) => h.estado === "ok");
  const iaPend = hallazgosIA.filter((h) => h.severidad !== "positivo");
  const iaBien = hallazgosIA.filter((h) => h.severidad === "positivo");

  return (
    <section id={`cat-${categoria}`} className="scroll-mt-20 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid gap-4 border-b border-slate-100 p-5 md:grid-cols-[10rem_minmax(0,1fr)]">
        <div>
          <div className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{NOMBRE_CATEGORIA[categoria]}</div>
          <div className="mt-1 text-3xl font-bold tabular-nums" style={{ color: colorPorcentaje(porcentaje) }}>
            {porcentaje === null ? "—" : obtenido.toFixed(1)}
            <span className="text-base font-medium text-slate-400">/{PESO_CATEGORIA[categoria]}</span>
          </div>
          <div className="mt-2">
            <Barra porcentaje={porcentaje} />
          </div>
        </div>
        <div>
          <h3 className="text-lg leading-snug font-semibold text-slate-800">{veredicto.titular}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{veredicto.texto}</p>
        </div>
      </div>

      {pendientes.map((h) => (
        <div key={h.id} id={`h-${h.id}`} className="scroll-mt-20">
          <FilaHallazgo
            severidad={h.severidad}
            titulo={h.titulo}
            resumen={h.detalle}
            derecha={
              <span className="hidden items-center gap-2 sm:flex">
                <span className="text-xs tabular-nums text-slate-400">
                  {h.puntos}/{h.peso}
                </span>
                {botonTarea(h.id, () => crearDesdeHallazgo(h))}
              </span>
            }
          >
            <Evidencia items={h.evidencia} />
            <div className="mt-3">
              <Recomendacion>{h.recomendacion}</Recomendacion>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Chip>Impacto {h.impacto}</Chip>
              <Chip>Esfuerzo {h.esfuerzo}</Chip>
              <Chip>{h.area}</Chip>
              <Chip>{h.fuente === "pagespeed" ? "PageSpeed Insights" : h.fuente === "red" ? "Red / servidor" : "HTML"}</Chip>
              <span className="ml-auto sm:hidden">{botonTarea(h.id, () => crearDesdeHallazgo(h))}</span>
            </div>
          </FilaHallazgo>
        </div>
      ))}

      {iaPend.map((h) => (
        <div key={h.id} id={`h-${h.id}`}>
          <FilaHallazgo
            severidad={h.severidad}
            titulo={h.titulo}
            resumen={h.detalle}
            derecha={
              <span className="flex items-center gap-2">
                <ChipSeveridad severidad="ia" className="hidden sm:inline-flex" />
                <span className="hidden sm:inline">{botonTarea(h.id, () => crearDesdeIA(h))}</span>
              </span>
            }
          >
            <Recomendacion>{h.recomendacion}</Recomendacion>
            <div className="mt-2 flex items-center gap-1.5">
              <Chip>Observación cualitativa (IA) · no suma puntos</Chip>
              <span className="ml-auto sm:hidden">{botonTarea(h.id, () => crearDesdeIA(h))}</span>
            </div>
          </FilaHallazgo>
        </div>
      ))}

      {pendientes.length === 0 && iaPend.length === 0 && (
        <p className="px-5 py-4 text-sm text-green-700">Sin pendientes en esta categoría.</p>
      )}

      {bien.length + iaBien.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-2.5">
          <button onClick={() => setVerBien((v) => !v)} className="text-xs font-medium text-green-700 hover:underline print:hidden">
            {verBien ? "Ocultar" : "Ver"} lo que está bien ({bien.length + iaBien.length})
          </button>
          <ul className={clsx("mt-2 space-y-1", verBien ? "block" : "hidden print:block")}>
            {bien.map((h) => (
              <li key={h.id} className="flex gap-2 text-xs text-slate-600">
                <span className="text-green-600">✓</span>
                <span>
                  <b className="font-medium text-slate-700">{h.titulo}.</b> {h.detalle}
                </span>
              </li>
            ))}
            {iaBien.map((h) => (
              <li key={h.id} className="flex gap-2 text-xs text-slate-600">
                <span className="text-green-600">✓</span>
                <span>
                  <b className="font-medium text-slate-700">{h.titulo}.</b> {h.detalle}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
