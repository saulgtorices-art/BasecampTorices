// PageSpeed Insights API v5: Lighthouse (laboratorio) + CrUX (campo).
// Docs: https://developers.google.com/speed/docs/insights/v5/get-started
// Funciona sin llave, pero con cuota muy baja: define PAGESPEED_API_KEY.

import type { ResultadoPageSpeed, Vitales } from "./tipos";

export interface AuditLH {
  id: string;
  title: string;
  score: number | null;
  scoreDisplayMode?: string;
  displayValue?: string;
  numericValue?: number;
  details?: { type?: string; items?: Record<string, unknown>[]; data?: string };
}

export interface PageSpeed {
  resumen: ResultadoPageSpeed;
  audits: Record<string, AuditLH>;
  captura: string | null;
}

type MetricaCrux = { percentile?: number; category?: string };
type Crux = { metrics?: Record<string, MetricaCrux>; overall_category?: string } | undefined;

function campo(crux: Crux): Omit<Vitales, "tbt" | "fcp"> & { categoria: string | null; fcp: number | null } | null {
  const m = crux?.metrics;
  if (!m || Object.keys(m).length === 0) return null;
  const p = (k: string) => (typeof m[k]?.percentile === "number" ? m[k]!.percentile! : null);
  const cls = p("CUMULATIVE_LAYOUT_SHIFT_SCORE");
  return {
    lcp: p("LARGEST_CONTENTFUL_PAINT_MS"),
    cls: cls === null ? null : cls / 100,
    inp: p("INTERACTION_TO_NEXT_PAINT"),
    fcp: p("FIRST_CONTENTFUL_PAINT_MS"),
    categoria: crux?.overall_category ?? null,
  };
}

export async function consultarPageSpeed(url: string, estrategia: "mobile" | "desktop"): Promise<PageSpeed> {
  const params = new URLSearchParams({ url, strategy: estrategia, locale: "es" });
  for (const c of ["performance", "accessibility", "best-practices", "seo"]) params.append("category", c);
  if (process.env.PAGESPEED_API_KEY) params.set("key", process.env.PAGESPEED_API_KEY);

  const vacio: PageSpeed = {
    resumen: {
      ok: false,
      estrategia,
      puntajes: { rendimiento: null, accesibilidad: null, buenasPracticas: null, seo: null },
      laboratorio: { lcp: null, cls: null, inp: null, tbt: null, fcp: null },
      campo: null,
      version: null,
    },
    audits: {},
    captura: null,
  };

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 110_000);
  try {
    const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {
      signal: control.signal,
      cache: "no-store",
    });
    const json = await r.json().catch(() => null);
    if (!r.ok || !json?.lighthouseResult) {
      const msg = json?.error?.message ?? `HTTP ${r.status}`;
      return { ...vacio, resumen: { ...vacio.resumen, error: `PageSpeed (${estrategia}): ${msg}` } };
    }
    const lh = json.lighthouseResult;
    const audits = (lh.audits ?? {}) as Record<string, AuditLH>;
    const cat = lh.categories ?? {};
    const puntaje = (k: string) => (typeof cat[k]?.score === "number" ? Math.round(cat[k].score * 100) : null);
    const num = (k: string) => (typeof audits[k]?.numericValue === "number" ? audits[k].numericValue! : null);

    const deUrl = campo(json.loadingExperience);
    const deOrigen = campo(json.originLoadingExperience);
    const c = deUrl ?? deOrigen;

    return {
      resumen: {
        ok: true,
        estrategia,
        puntajes: {
          rendimiento: puntaje("performance"),
          accesibilidad: puntaje("accessibility"),
          buenasPracticas: puntaje("best-practices"),
          seo: puntaje("seo"),
        },
        laboratorio: {
          lcp: num("largest-contentful-paint"),
          cls: num("cumulative-layout-shift"),
          inp: null,
          tbt: num("total-blocking-time"),
          fcp: num("first-contentful-paint"),
        },
        campo: c ? { ...c, tbt: null, fuente: deUrl ? "url" : "origen" } : null,
        version: lh.lighthouseVersion ?? null,
      },
      audits,
      captura: audits["final-screenshot"]?.details?.data ?? null,
    };
  } catch (e) {
    const msg = (e as Error).name === "AbortError" ? "no respondió en 110 s" : (e as Error).message;
    return { ...vacio, resumen: { ...vacio.resumen, error: `PageSpeed (${estrategia}): ${msg}` } };
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Busca el primer audit que exista de una lista de ids. Lighthouse 13 movió
 * varios audits a "insights" (p. ej. render-blocking-resources →
 * render-blocking-insight), así que cada check pide ambos nombres.
 */
export function audit(audits: Record<string, AuditLH>, ...ids: string[]): AuditLH | null {
  for (const id of ids) {
    const a = audits[id];
    if (a && a.scoreDisplayMode !== "error") return a;
  }
  return null;
}

/** Elementos que reporta un audit (nodos, recursos…) como texto corto. */
export function muestras(a: AuditLH | null, max = 5): string[] {
  const items = a?.details?.items ?? [];
  const out: string[] = [];
  for (const it of items) {
    const nodo = it.node as { snippet?: string; nodeLabel?: string } | undefined;
    const txt =
      nodo?.nodeLabel && nodo?.snippet
        ? `${nodo.nodeLabel} — ${nodo.snippet}`
        : (nodo?.snippet ?? (typeof it.url === "string" ? it.url : null) ?? (typeof it.source === "string" ? it.source : null));
    if (txt) out.push(String(txt).slice(0, 220));
    if (out.length >= max) break;
  }
  return out;
}
