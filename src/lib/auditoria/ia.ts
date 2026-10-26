// Redacción con Claude: veredictos, resumen, hallazgos cualitativos a partir
// de las capturas, próximos pasos y lagunas. Los puntajes NO los decide la IA;
// salen de los checks deterministas. Sin ANTHROPIC_API_KEY el reporte se arma
// con textos base (puntaje.ts).

import type { DatosPagina } from "./html";
import {
  CATEGORIAS,
  type Area,
  type Capturas,
  type Categoria,
  type Hallazgo,
  type HallazgoIA,
  type Nivel,
  type PasoSiguiente,
  type Puntajes,
  type Veredicto,
} from "./tipos";

export interface Narrativa {
  resumen: string;
  veredictos: Record<Categoria, Veredicto>;
  hallazgosIA: HallazgoIA[];
  proximosPasos: PasoSiguiente[];
  lagunas: string[];
  modelo: string;
}

const MODELO_DEFECTO = "claude-sonnet-5-5";

const SISTEMA = `Eres un consultor senior de UX/UI y conversión que audita sitios web de empresas en México para una agencia de marketing.
Escribes en español de México, directo y concreto, sin relleno ni anglicismos innecesarios. Hablas al equipo de la agencia (diseño, desarrollo, contenido).
Recibes resultados de checks automáticos (ya puntuados; no cambies puntajes ni contradigas datos medidos) y capturas del primer pantallazo en móvil y escritorio.
Tu trabajo: interpretar, priorizar y aportar lo que las métricas no ven (claridad de la propuesta de valor, jerarquía visual, legibilidad, confianza, consistencia visual del primer pantallazo).
No inventes datos que no estén en la entrada. Si algo no se puede afirmar con lo que ves, dilo como laguna.
Responde SOLO con un objeto JSON válido, sin texto antes ni después y sin bloques de código.`;

function formato(): string {
  return `Formato exacto de la respuesta:
{
  "resumen": "3 a 4 frases: estado general, el problema que más cuesta conversiones y la prioridad #1",
  "veredictos": {
    "ux": { "titular": "frase corta y contundente (máx. 90 caracteres)", "texto": "2 a 3 frases con datos de la entrada" },
    "ui": { ... }, "responsive": { ... }, "accesibilidad": { ... }, "tecnico": { ... }
  },
  "hallazgos_ia": [
    { "categoria": "ux|ui|responsive|accesibilidad|tecnico", "titulo": "…", "detalle": "qué se ve en la captura o en el contenido y por qué importa", "recomendacion": "qué hacer, concreto", "severidad": "critico|importante|mejora|positivo" }
  ],
  "proximos_pasos": [
    { "titulo": "acción", "detalle": "cómo hacerlo y qué resultado esperar", "esfuerzo": "bajo|medio|alto", "area": "Diseño UX/UI|Desarrollo|Contenido/SEO", "hallazgos": ["ids de checks relacionados"] }
  ],
  "lagunas": ["qué no se pudo comprobar y con qué dato se cerraría (p. ej. Search Console, GA4, Clarity, prueba con usuarios)"]
}
Reglas: 3 a 6 hallazgos_ia basados en las capturas y el contenido (no repitas los checks automáticos); 4 a 6 próximos pasos ordenados por prioridad; 2 a 5 lagunas.`;
}

function imagen(dataUrl: string | null | undefined) {
  const m = dataUrl?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  return m ? { type: "image" as const, source: { type: "base64" as const, media_type: m[1], data: m[2] } } : null;
}

const NIVELES: Nivel[] = ["alto", "medio", "bajo"];
const AREAS: Area[] = ["Diseño UX/UI", "Desarrollo", "Contenido/SEO"];
const SEVS = ["critico", "importante", "mejora", "positivo"] as const;
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function redactarConIA(entrada: {
  url: string;
  pagina: DatosPagina | null;
  hallazgos: Hallazgo[];
  puntajes: Puntajes;
  total: number;
  capturas: Capturas;
  vitales: unknown;
}): Promise<Narrativa | null> {
  const llave = process.env.ANTHROPIC_API_KEY;
  if (!llave) return null;
  const modelo = process.env.ANTHROPIC_MODEL || MODELO_DEFECTO;

  const p = entrada.pagina;
  const datos = {
    url: entrada.url,
    puntaje_total: entrada.total,
    puntajes: entrada.puntajes,
    pagina: p && {
      title: p.titulo,
      description: p.descripcion,
      h1: p.h1,
      encabezados: p.encabezados.slice(0, 25).map((e) => `H${e.nivel} ${e.texto}`),
      menu: p.navegacion.slice(0, 15).map((e) => e.texto),
      ctas: [...new Set(p.ctas.map((c) => `${c.texto}${c.enHero ? " (arriba)" : ""}`))].slice(0, 12),
      senales_confianza: p.confianza,
      palabras: p.palabras,
      parece_spa: p.pareceSPA,
    },
    vitales: entrada.vitales,
    checks: entrada.hallazgos.map((h) => ({ id: h.id, categoria: h.categoria, titulo: h.titulo, estado: h.estado, severidad: h.severidad, detalle: h.detalle })),
  };

  const contenido: unknown[] = [];
  const movil = imagen(entrada.capturas.movil);
  const escritorio = imagen(entrada.capturas.escritorio);
  if (movil) contenido.push({ type: "text", text: "Captura del primer pantallazo en móvil:" }, movil);
  if (escritorio) contenido.push({ type: "text", text: "Captura del primer pantallazo en escritorio:" }, escritorio);
  if (!movil && !escritorio) contenido.push({ type: "text", text: "(No hay capturas disponibles; no opines sobre lo visual que no puedas inferir del HTML.)" });
  contenido.push({ type: "text", text: `Datos de la auditoría:\n${JSON.stringify(datos)}\n\n${formato()}` });

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 120_000);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: control.signal,
      headers: { "content-type": "application/json", "x-api-key": llave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: modelo, max_tokens: 6000, system: SISTEMA, messages: [{ role: "user", content: contenido }] }),
    });
    const json = await r.json().catch(() => null);
    if (!r.ok) throw new Error(json?.error?.message ?? `HTTP ${r.status}`);
    const texto: string = (json?.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    const crudo = JSON.parse(texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1));
    return validar(crudo, modelo, entrada.hallazgos);
  } catch (e) {
    console.error("[auditoria] IA:", (e as Error).message);
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

// Nunca confiar a ciegas en la forma del JSON: se valida campo por campo.
function validar(c: Record<string, unknown>, modelo: string, hallazgos: Hallazgo[]): Narrativa | null {
  const ver = (c.veredictos ?? {}) as Record<string, { titular?: unknown; texto?: unknown }>;
  const veredictos = {} as Record<Categoria, Veredicto>;
  for (const cat of CATEGORIAS) {
    const titular = txt(ver[cat]?.titular, 140);
    const texto = txt(ver[cat]?.texto, 900);
    if (!titular || !texto) return null;
    veredictos[cat] = { titular, texto };
  }
  const ids = new Set(hallazgos.map((h) => h.id));
  const hallazgosIA: HallazgoIA[] = (Array.isArray(c.hallazgos_ia) ? c.hallazgos_ia : [])
    .slice(0, 8)
    .map((h: Record<string, unknown>, i: number) => ({
      id: `ia-${i + 1}`,
      categoria: (CATEGORIAS as readonly string[]).includes(h.categoria as string) ? (h.categoria as Categoria) : "ux",
      titulo: txt(h.titulo, 140),
      detalle: txt(h.detalle, 700),
      recomendacion: txt(h.recomendacion, 600),
      severidad: (SEVS as readonly string[]).includes(h.severidad as string) ? (h.severidad as HallazgoIA["severidad"]) : "mejora",
    }))
    .filter((h: HallazgoIA) => h.titulo && h.detalle);
  const proximosPasos: PasoSiguiente[] = (Array.isArray(c.proximos_pasos) ? c.proximos_pasos : [])
    .slice(0, 8)
    .map((p: Record<string, unknown>) => ({
      titulo: txt(p.titulo, 140),
      detalle: txt(p.detalle, 600),
      esfuerzo: NIVELES.includes(p.esfuerzo as Nivel) ? (p.esfuerzo as Nivel) : "medio",
      area: AREAS.includes(p.area as Area) ? (p.area as Area) : "Diseño UX/UI",
      hallazgos: (Array.isArray(p.hallazgos) ? p.hallazgos : []).filter((x: unknown) => typeof x === "string" && ids.has(x)),
    }))
    .filter((p: PasoSiguiente) => p.titulo);
  const lagunas = (Array.isArray(c.lagunas) ? c.lagunas : []).map((l: unknown) => txt(l, 400)).filter(Boolean).slice(0, 6);
  const resumen = txt(c.resumen, 1200);
  if (!resumen) return null;
  return { resumen, veredictos, hallazgosIA, proximosPasos, lagunas, modelo };
}
