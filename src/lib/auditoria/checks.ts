// Catálogo de checks de la auditoría UX/UI.
// Cada check tiene categoría, peso (puntos dentro de su categoría), severidad
// si falla, impacto/esfuerzo (para la matriz) y área responsable. La
// evaluación es determinista: la IA solo redacta encima de estos resultados.

import type { DatosPagina } from "./html";
import { audit, muestras, type AuditLH, type PageSpeed } from "./pagespeed";
import type { Area, Categoria, EstadoCheck, Nivel, PaginaClave } from "./tipos";

export interface Contexto {
  url: string;
  urlFinal: string;
  pagina: DatosPagina | null;
  status: number | null;
  headers: Headers | null;
  ttfbMs: number | null;
  /** null = no se pudo probar; true = http:// redirige a https:// */
  httpARedirige: boolean | null;
  robots: { status: number; texto: string } | null;
  sitemap: boolean | null;
  movil: PageSpeed | null;
  escritorio: PageSpeed | null;
  paginas: PaginaClave[];
}

export interface Evaluacion {
  estado: EstadoCheck;
  detalle: string;
  evidencia?: string[];
  /** Fracción de puntos obtenidos (ok = 1, falla = 0, parcial = 0.5 por defecto). */
  fraccion?: number;
}

export interface DefCheck {
  id: string;
  categoria: Categoria;
  titulo: string;
  peso: number;
  severidad: "critico" | "importante" | "mejora";
  impacto: Nivel;
  esfuerzo: Nivel;
  area: Area;
  fuente: "html" | "pagespeed" | "red";
  recomendacion: string;
  evaluar: (c: Contexto) => Evaluacion;
}

// ----------------------------------------------------------------- helpers
const ok = (detalle: string, evidencia?: string[]): Evaluacion => ({ estado: "ok", detalle, evidencia });
const falla = (detalle: string, evidencia?: string[]): Evaluacion => ({ estado: "falla", detalle, evidencia });
const parcial = (detalle: string, evidencia?: string[], fraccion = 0.5): Evaluacion => ({
  estado: "parcial",
  detalle,
  evidencia,
  fraccion,
});
const na = (detalle: string): Evaluacion => ({ estado: "na", detalle });

const SIN_HTML = na("No se pudo leer el HTML de la página.");
const SIN_PSI = na("PageSpeed Insights no devolvió datos para esta URL.");

const seg = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const pct = (n: number, d: number) => (d === 0 ? "0%" : `${Math.round((n / d) * 100)}%`);

function conHtml(f: (p: DatosPagina, c: Contexto) => Evaluacion) {
  return (c: Contexto) => (c.pagina ? f(c.pagina, c) : SIN_HTML);
}

/** Audits de Lighthouse: se prefiere móvil y se cae a escritorio. */
function lh(c: Contexto, ...ids: string[]): AuditLH | null {
  return (c.movil && audit(c.movil.audits, ...ids)) || (c.escritorio && audit(c.escritorio.audits, ...ids)) || null;
}

function porPuntajeLH(ids: string[], textoOk: string, textoFalla: (a: AuditLH) => string) {
  return (c: Contexto): Evaluacion => {
    if (!c.movil?.resumen.ok && !c.escritorio?.resumen.ok) return SIN_PSI;
    const a = lh(c, ...ids);
    if (!a || a.score === null || a.scoreDisplayMode === "notApplicable") return na("Lighthouse no aplicó este audit a la página.");
    if (a.score >= 0.9) return ok(textoOk);
    const ev = muestras(a);
    return a.score >= 0.5 ? parcial(textoFalla(a), ev) : falla(textoFalla(a), ev);
  };
}

/** Vitales: prioriza datos de campo (usuarios reales) sobre laboratorio. */
function vital(c: Contexto, campo: "lcp" | "cls" | "inp") {
  const ps = c.movil?.resumen.ok ? c.movil.resumen : c.escritorio?.resumen.ok ? c.escritorio.resumen : null;
  if (!ps) return null;
  const f = ps.campo?.[campo];
  if (typeof f === "number") return { valor: f, fuente: ps.campo!.fuente === "url" ? "usuarios reales (CrUX)" : "usuarios reales del dominio (CrUX)" };
  if (campo === "inp") return typeof ps.laboratorio.tbt === "number" ? { valor: ps.laboratorio.tbt, fuente: "TBT de laboratorio", tbt: true } : null;
  const l = ps.laboratorio[campo];
  return typeof l === "number" ? { valor: l, fuente: `laboratorio (${ps.estrategia === "mobile" ? "móvil" : "escritorio"})` } : null;
}

// ----------------------------------------------------------------- catálogo
export const CHECKS: DefCheck[] = [
  // ============================================================== UX (40)
  {
    id: "ux-propuesta-h1",
    categoria: "ux",
    titulo: "Un H1 claro que diga qué ofrece el sitio",
    peso: 5,
    severidad: "importante",
    impacto: "alto",
    esfuerzo: "bajo",
    area: "Contenido/SEO",
    fuente: "html",
    recomendacion:
      "Usa un solo H1 en la parte alta que diga en una frase qué vendes y para quién (p. ej. «Acero estructural con entrega en 24 h en CDMX»). Los demás títulos van como H2/H3.",
    evaluar: conHtml((p) => {
      if (p.h1.length === 0) return falla("La página no tiene H1: el visitante y Google no ven de inmediato de qué trata.");
      if (p.h1.length > 1) return parcial(`Hay ${p.h1.length} H1; debería haber uno solo.`, p.h1.slice(0, 5));
      if (p.h1[0].length < 15) return parcial(`El H1 es muy corto («${p.h1[0]}») y no explica la propuesta de valor.`, p.h1);
      return ok(`H1 único: «${p.h1[0]}».`);
    }),
  },
  {
    id: "ux-cta-hero",
    categoria: "ux",
    titulo: "Llamada a la acción visible sin hacer scroll",
    peso: 6,
    severidad: "critico",
    impacto: "alto",
    esfuerzo: "bajo",
    area: "Diseño UX/UI",
    fuente: "html",
    recomendacion:
      "Coloca un botón principal con verbo de acción (Cotizar, Llamar, Escribir por WhatsApp) en el primer pantallazo, con color de alto contraste, y repítelo al final de cada sección.",
    evaluar: conHtml((p) => {
      const hero = p.ctas.filter((x) => x.enHero);
      const textos = [...new Set(p.ctas.map((x) => x.texto))].slice(0, 6);
      if (hero.length > 0) return ok(`Hay ${hero.length} CTA en la parte alta (${[...new Set(hero.map((h) => h.texto))].slice(0, 3).join(", ")}).`, textos);
      if (p.ctas.length > 0) return parcial("Hay llamadas a la acción, pero aparecen abajo en la página, no en el primer pantallazo.", textos);
      return falla("No se detectó ninguna llamada a la acción clara (cotizar, contactar, comprar, WhatsApp…).");
    }),
  },
  {
    id: "ux-contacto",
    categoria: "ux",
    titulo: "Contacto directo a un toque (teléfono / WhatsApp)",
    peso: 5,
    severidad: "importante",
    impacto: "alto",
    esfuerzo: "bajo",
    area: "Desarrollo",
    fuente: "html",
    recomendacion:
      "Enlaza el teléfono con tel: y agrega un botón de WhatsApp (wa.me) fijo en móvil. En México gran parte de los leads B2B llega por WhatsApp.",
    evaluar: conHtml((p) => {
      const canales = [p.telefonos.length ? `teléfono (${p.telefonos[0]})` : null, p.whatsapp ? "WhatsApp" : null, p.correo ? "correo" : null].filter(Boolean) as string[];
      if (p.telefonos.length && p.whatsapp) return ok(`Canales a un toque: ${canales.join(", ")}.`);
      if (canales.length) return parcial(`Solo hay ${canales.join(" y ")} enlazado; falta ${p.whatsapp ? "teléfono con tel:" : "WhatsApp"}.`);
      return falla("No hay teléfono enlazado (tel:), WhatsApp ni correo: el usuario móvil tiene que copiar y pegar para contactar.");
    }),
  },
  {
    id: "ux-navegacion",
    categoria: "ux",
    titulo: "Menú de navegación claro y acotado",
    peso: 4,
    severidad: "importante",
    impacto: "medio",
    esfuerzo: "medio",
    area: "Diseño UX/UI",
    fuente: "html",
    recomendacion:
      "Deja entre 4 y 7 opciones principales con nombres que use el cliente (Productos, Servicios, Nosotros, Contacto). Agrupa el resto en submenús o en el pie.",
    evaluar: conHtml((p) => {
      const n = p.navegacion.length;
      const ev = p.navegacion.slice(0, 12).map((e) => e.texto);
      if (n === 0) return falla("No se encontró un menú (<nav> o <header> con enlaces internos).");
      if (n > 14) return parcial(`El encabezado tiene ${n} enlaces: demasiadas opciones compiten por la atención.`, ev);
      if (n < 3) return parcial(`El menú tiene solo ${n} enlace(s); puede faltar acceso a secciones clave.`, ev);
      return ok(`Menú con ${n} enlaces.`, ev);
    }),
  },
  {
    id: "ux-jerarquia",
    categoria: "ux",
    titulo: "Jerarquía de títulos ordenada (H1 → H2 → H3)",
    peso: 3,
    severidad: "mejora",
    impacto: "medio",
    esfuerzo: "bajo",
    area: "Desarrollo",
    fuente: "html",
    recomendacion:
      "No saltes niveles (de H1 a H4) ni uses encabezados solo por su tamaño. Ajusta el estilo con CSS y deja la etiqueta según la estructura del contenido.",
    evaluar: conHtml((p) => {
      const saltos: string[] = [];
      let previo = 0;
      for (const e of p.encabezados) {
        if (previo && e.nivel > previo + 1) saltos.push(`H${previo} → H${e.nivel}: «${e.texto.slice(0, 60)}»`);
        previo = e.nivel;
      }
      if (p.encabezados.length === 0) return falla("La página no usa encabezados; el contenido no se puede escanear.");
      if (saltos.length === 0) return ok(`${p.encabezados.length} encabezados sin saltos de nivel.`);
      return saltos.length <= 2 ? parcial(`${saltos.length} salto(s) de nivel.`, saltos) : falla(`${saltos.length} saltos de nivel en los encabezados.`, saltos.slice(0, 5));
    }),
  },
  {
    id: "ux-formularios",
    categoria: "ux",
    titulo: "Formularios cortos y fáciles de llenar",
    peso: 4,
    severidad: "importante",
    impacto: "alto",
    esfuerzo: "bajo",
    area: "Diseño UX/UI",
    fuente: "html",
    recomendacion:
      "Pide solo lo indispensable (nombre, teléfono o correo, mensaje). Cada campo extra baja la conversión. Usa etiquetas visibles, no solo placeholder.",
    evaluar: conHtml((p) => {
      const forms = p.formularios.filter((f) => f.campos > 0);
      if (forms.length === 0) return na("La página no tiene formularios.");
      const largos = forms.filter((f) => f.campos > 7);
      const sinEt = forms.flatMap((f) => f.sinEtiqueta);
      if (largos.length === 0 && sinEt.length === 0) return ok(`${forms.length} formulario(s) con ≤7 campos y etiquetas.`);
      const det = [
        largos.length ? `${largos.length} formulario(s) con más de 7 campos (${largos.map((f) => f.campos).join(", ")})` : null,
        sinEt.length ? `${sinEt.length} campo(s) sin etiqueta` : null,
      ]
        .filter(Boolean)
        .join("; ");
      return largos.length && sinEt.length ? falla(det + ".", sinEt.slice(0, 5)) : parcial(det + ".", sinEt.slice(0, 5));
    }),
  },
  {
    id: "ux-lcp",
    categoria: "ux",
    titulo: "Carga del contenido principal (LCP ≤ 2.5 s)",
    peso: 6,
    severidad: "critico",
    impacto: "alto",
    esfuerzo: "medio",
    area: "Desarrollo",
    fuente: "pagespeed",
    recomendacion:
      "Optimiza la imagen o bloque más grande del primer pantallazo: formato WebP/AVIF, tamaño real, fetchpriority=\"high\", sin lazy-load arriba del pliegue, y un hosting/CDN con buen TTFB.",
    evaluar: (c) => {
      const v = vital(c, "lcp");
      if (!v) return SIN_PSI;
      const d = `LCP de ${seg(v.valor)} según ${v.fuente}.`;
      return v.valor <= 2500 ? ok(d) : v.valor <= 4000 ? parcial(d + " Google lo considera «necesita mejorar».") : falla(d + " Google lo considera lento (> 4 s).");
    },
  },
  {
    id: "ux-cls",
    categoria: "ux",
    titulo: "Estabilidad visual (CLS ≤ 0.1)",
    peso: 4,
    severidad: "importante",
    impacto: "medio",
    esfuerzo: "bajo",
    area: "Desarrollo",
    fuente: "pagespeed",
    recomendacion:
      "Reserva espacio para imágenes, banners y anuncios (width/height o aspect-ratio) y carga las fuentes con font-display: swap para que el contenido no salte.",
    evaluar: (c) => {
      const v = vital(c, "cls");
      if (!v) return SIN_PSI;
      const d = `CLS de ${v.valor.toFixed(2)} según ${v.fuente}.`;
      return v.valor <= 0.1 ? ok(d) : v.valor <= 0.25 ? parcial(d) : falla(d + " El contenido se mueve mientras carga.");
    },
  },
  {
    id: "ux-inp",
    categoria: "ux",
    titulo: "Respuesta a clics y toques (INP ≤ 200 ms)",
    peso: 4,
    severidad: "importante",
    impacto: "medio",
    esfuerzo: "alto",
    area: "Desarrollo",
    fuente: "pagespeed",
    recomendacion:
      "Reduce JavaScript de terceros (chats, píxeles, sliders), difiere lo que no se usa al inicio y divide tareas largas para que la página responda al instante.",
    evaluar: (c) => {
      const v = vital(c, "inp");
      if (!v) return SIN_PSI;
      if ("tbt" in v) {
        const d = `Sin datos de campo; TBT de laboratorio: ${Math.round(v.valor)} ms.`;
        return v.valor <= 200 ? ok(d) : v.valor <= 600 ? parcial(d) : falla(d + " El hilo principal está bloqueado mucho tiempo.");
      }
      const d = `INP de ${Math.round(v.valor)} ms según ${v.fuente}.`;
      return v.valor <= 200 ? ok(d) : v.valor <= 500 ? parcial(d) : falla(d);
    },
  },
  {
    id: "ux-enlaces-clave",
    categoria: "ux",
    titulo: "Páginas del menú responden sin error",
    peso: 3,
    severidad: "critico",
    impacto: "alto",
    esfuerzo: "bajo",
    area: "Desarrollo",
    fuente: "red",
    recomendacion: "Corrige o redirige (301) los enlaces del menú que devuelven error. Un 404 en la navegación principal rompe el recorrido del usuario.",
    evaluar: (c) => {
      if (c.paginas.length === 0) return na("No se revisaron páginas internas.");
      const malas = c.paginas.filter((p) => p.status === null || p.status >= 400);
      if (malas.length === 0) return ok(`Las ${c.paginas.length} páginas revisadas del menú responden 200.`);
      const ev = malas.map((p) => `${p.status ?? "sin respuesta"} — ${p.url}`);
      return malas.length === 1 && c.paginas.length > 3 ? parcial("1 página del menú falla.", ev, 0.3) : falla(`${malas.length} de ${c.paginas.length} páginas del menú fallan.`, ev);
    },
  },
  {
    id: "ux-confianza",
    categoria: "ux",
    titulo: "Señales de confianza (testimonios, clientes, certificaciones)",
    peso: 3,
    severidad: "mejora",
    impacto: "medio",
    esfuerzo: "medio",
    area: "Contenido/SEO",
    fuente: "html",
    recomendacion:
      "Agrega cerca del CTA pruebas de confianza: logos de clientes, testimonios con nombre y empresa, certificaciones, años de experiencia o garantía.",
    evaluar: conHtml((p) => {
      if (p.confianza.length >= 2) return ok(`Se detectaron: ${p.confianza.join(", ")}.`);
      if (p.confianza.length === 1) return parcial(`Solo se detectó: ${p.confianza[0]}.`);
      return falla("No se encontraron testimonios, clientes, certificaciones ni garantías en la página.");
    }),
  },
  {
    id: "ux-aviso-privacidad",
    categoria: "ux",
    titulo: "Aviso de privacidad accesible",
    peso: 2,
    severidad: "importante",
    impacto: "medio",
    esfuerzo: "bajo",
    area: "Contenido/SEO",
    fuente: "html",
    recomendacion:
      "Enlaza el aviso de privacidad en el pie y junto a cada formulario. En México lo exige la Ley Federal de Protección de Datos Personales cuando se recaban datos.",
    evaluar: conHtml((p) =>
      p.avisoPrivacidad ? ok("Hay enlace al aviso de privacidad.") : falla("No se encontró enlace al aviso de privacidad."),
    ),
  },

  // ============================================================== UI (35)
  {
    id: "ui-contraste",
    categoria: "ui",
    titulo: "Contraste suficiente entre texto y fondo",
    peso: 6,
    severidad: "importante",
    impacto: "alto",
    esfuerzo: "bajo",
    area: "Diseño UX/UI",
    fuente: "pagespeed",
    recomendacion:
      "Lleva el texto normal a contraste ≥ 4.5:1 y el grande a ≥ 3:1 (WCAG AA). Los grises claros sobre blanco y el texto sobre fotos son los casos más comunes.",
    evaluar: porPuntajeLH(["color-contrast"], "El texto tiene contraste suficiente.", (a) => `Hay elementos con contraste insuficiente${a.details?.items ? ` (${a.details.items.length})` : ""}.`),
  },
  {
    id: "ui-formatos-imagen",
    categoria: "ui",
    titulo: "Imágenes en formatos modernos y bien comprimidas",
    peso: 5,
    severidad: "importante",
    impacto: "alto",
    esfuerzo: "bajo",
    area: "Desarrollo",
    fuente: "pagespeed",
    recomendacion: "Convierte JPG/PNG a WebP o AVIF y comprímelas (calidad 70–80). En WordPress basta un plugin como ShortPixel, Imagify o el CDN del hosting.",
    evaluar: porPuntajeLH(
      ["image-delivery-insight", "modern-image-formats", "uses-optimized-images"],
      "Las imágenes ya se entregan optimizadas.",
      (a) => `Las imágenes se pueden aligerar${a.displayValue ? ` (${a.displayValue})` : ""}.`,
    ),
  },
  {
    id: "ui-dimensiones-imagen",
    categoria: "ui",
    titulo: "Imágenes con ancho y alto declarados",
    peso: 3,
    severidad: "mejora",
    impacto: "medio",
    esfuerzo: "bajo",
    area: "Desarrollo",
    fuente: "html",
    recomendacion: "Agrega width y height (o aspect-ratio en CSS) a cada <img> para que el navegador reserve el espacio y el diseño no brinque.",
    evaluar: conHtml((p) => {
      const imgs = p.imagenes.filter((i) => i.src);
      if (imgs.length === 0) return na("La página no tiene imágenes <img>.");
      const sin = imgs.filter((i) => !i.width || !i.height);
      const r = 1 - sin.length / imgs.length;
      const d = `${imgs.length - sin.length} de ${imgs.length} imágenes (${pct(imgs.length - sin.length, imgs.length)}) declaran dimensiones.`;
      const ev = sin.slice(0, 5).map((i) => i.src);
      return r >= 0.9 ? ok(d) : r >= 0.5 ? parcial(d, ev, r) : falla(d, ev);
    }),
  },
  {
    id: "ui-proporcion-imagen",
    categoria: "ui",
    titulo: "Imágenes sin deformar y con resolución adecuada",
    peso: 3,
    severidad: "mejora",
    impacto: "medio",
    esfuerzo: "bajo",
    area: "Diseño UX/UI",
    fuente: "pagespeed",
    recomendacion: "Exporta las imágenes con la proporción con la que se muestran (usa object-fit: cover) y al doble de resolución para pantallas retina.",
    evaluar: (c) => {
      const a = porPuntajeLH(["image-aspect-ratio"], "", () => "")(c);
      const b = porPuntajeLH(["image-size-responsive"], "", () => "")(c);
      if (a.estado === "na" && b.estado === "na") return a;
      const malos = [a.estado !== "ok" && a.estado !== "na" ? "proporción incorrecta" : null, b.estado !== "ok" && b.estado !== "na" ? "baja resolución" : null].filter(Boolean);
      if (malos.length === 0) return ok("Proporción y resolución correctas.");
      return malos.length === 2 ? falla(`Hay imágenes con ${malos.join(" y ")}.`, [...(a.evidencia ?? []), ...(b.evidencia ?? [])].slice(0, 5)) : parcial(`Hay imágenes con ${malos[0]}.`, [...(a.evidencia ?? []), ...(b.evidencia ?? [])].slice(0, 5));
    },
  },
  {
    id: "ui-tipografias",
    categoria: "ui",
    titulo: "Sistema tipográfico acotado (≤ 3 familias)",
    peso: 3,
    severidad: "mejora",
    impacto: "medio",
    esfuerzo: "medio",
    area: "Diseño UX/UI",
    fuente: "html",
    recomendacion: "Define una familia para títulos y otra para texto (máximo 3). Más familias dan aspecto desordenado y suman peso de carga.",
    evaluar: conHtml((p) => {
      const n = p.fuentes.length;
      if (n === 0) return na("No se detectaron fuentes web en el HTML (pueden venir de un CSS externo).");
      return n <= 3 ? ok(`${n} familia(s): ${p.fuentes.join(", ")}.`) : parcial(`${n} familias tipográficas: ${p.fuentes.join(", ")}.`, p.fuentes);
    }),
  },
  {
    id: "ui-font-display",
    categoria: "ui",
    titulo: "Texto visible mientras cargan las fuentes",
    peso: 2,
    severidad: "mejora",
    impacto: "bajo",
    esfuerzo: "bajo",
    area: "Desarrollo",
    fuente: "pagespeed",
    recomendacion: "Usa font-display: swap (en Google Fonts, &display=swap) y precarga la fuente principal.",
    evaluar: porPuntajeLH(["font-display-insight", "font-display"], "Las fuentes no bloquean el texto.", () => "Hay fuentes que ocultan el texto mientras cargan."),
  },
  {
    id: "ui-carrusel",
    categoria: "ui",
    titulo: "Hero sin carrusel automático",
    peso: 2,
    severidad: "mejora",
    impacto: "medio",
    esfuerzo: "medio",
    area: "Diseño UX/UI",
    fuente: "html",
    recomendacion:
      "Sustituye el slider por un hero fijo con un mensaje y un CTA. Los carruseles reciben pocos clics después del primer slide, pesan y suelen empeorar LCP.",
    evaluar: conHtml((p) =>
      p.carrusel ? parcial(`Se detectó un carrusel («${p.carrusel}»). Verifica si está en el hero.`, [p.carrusel], 0.4) : ok("No se detectaron carruseles."),
    ),
  },
  {
    id: "ui-favicon-og",
    categoria: "ui",
    titulo: "Favicon e imagen para compartir (Open Graph)",
    peso: 2,
    severidad: "mejora",
    impacto: "bajo",
    esfuerzo: "bajo",
    area: "Diseño UX/UI",
    fuente: "html",
    recomendacion: "Agrega favicon/apple-touch-icon y una og:image de 1200×630 con la marca para que el enlace se vea bien en WhatsApp, LinkedIn y Facebook.",
    evaluar: conHtml((p) => {
      if (p.favicon && p.ogImagen) return ok("Tiene favicon y og:image.");
      if (p.favicon || p.ogImagen) return parcial(`Falta ${p.favicon ? "og:image" : "favicon"}.`);
      return falla("Faltan favicon y og:image.");
    }),
  },
  {
    id: "ui-buenas-practicas",
    categoria: "ui",
    titulo: "Buenas prácticas de Lighthouse",
    peso: 3,
    severidad: "mejora",
    impacto: "bajo",
    esfuerzo: "medio",
    area: "Desarrollo",
    fuente: "pagespeed",
    recomendacion: "Revisa los avisos de Buenas prácticas en PageSpeed: errores de consola, librerías vulnerables, APIs obsoletas e imágenes de baja resolución.",
    evaluar: (c) => {
      const s = c.movil?.resumen.puntajes.buenasPracticas ?? c.escritorio?.resumen.puntajes.buenasPracticas;
      if (typeof s !== "number") return SIN_PSI;
      return s >= 90 ? ok(`Buenas prácticas: ${s}/100.`) : s >= 70 ? parcial(`Buenas prácticas: ${s}/100.`, undefined, s / 100) : falla(`Buenas prácticas: ${s}/100.`);
    },
  },

  // ============================================================== Responsive (10)
  {
    id: "resp-viewport",
    categoria: "responsive",
    titulo: "Viewport móvil correcto y zoom permitido",
    peso: 4,
    severidad: "critico",
    impacto: "alto",
    esfuerzo: "bajo",
    area: "Desarrollo",
    fuente: "html",
    recomendacion: 'Usa <meta name="viewport" content="width=device-width, initial-scale=1"> y no bloquees el zoom (sin user-scalable=no ni maximum-scale=1).',
    evaluar: conHtml((p) => {
      if (!p.viewport) return falla("No hay meta viewport: en móvil la página se ve como escritorio en miniatura.");
      if (!/width\s*=\s*device-width/i.test(p.viewport)) return falla(`El viewport no usa width=device-width («${p.viewport}»).`);
      const max = p.viewport.match(/maximum-scale\s*=\s*([\d.]+)/i);
      if (/user-scalable\s*=\s*(no|0)/i.test(p.viewport) || (max && Number(max[1]) < 2))
        return parcial(`El viewport bloquea el zoom («${p.viewport}»), lo que afecta a personas con baja visión.`);
      return ok(`Viewport: «${p.viewport}».`);
    }),
  },
  {
    id: "resp-areas-toque",
    categoria: "responsive",
    titulo: "Áreas de toque de tamaño suficiente",
    peso: 3,
    severidad: "importante",
    impacto: "alto",
    esfuerzo: "bajo",
    area: "Diseño UX/UI",
    fuente: "pagespeed",
    recomendacion: "Botones y enlaces de al menos 44×44 px (mínimo WCAG 24×24) con separación entre sí, sobre todo en menú, pie y formularios.",
    evaluar: porPuntajeLH(["target-size", "tap-targets"], "Los elementos táctiles tienen buen tamaño y separación.", () => "Hay botones o enlaces demasiado pequeños o pegados para tocarlos con el dedo."),
  },
  {
    id: "resp-imagenes-responsivas",
    categoria: "responsive",
    titulo: "Imágenes adaptadas al tamaño de pantalla",
    peso: 3,
    severidad: "mejora",
    impacto: "medio",
    esfuerzo: "medio",
    area: "Desarrollo",
    fuente: "html",
    recomendacion: "Sirve varias resoluciones con srcset/sizes (o <picture>) para que el móvil no descargue imágenes de escritorio.",
    evaluar: conHtml((p) => {
      const imgs = p.imagenes.filter((i) => i.src && !/\.svg(\?|$)/i.test(i.src));
      if (imgs.length < 3) return na("Pocas imágenes de mapa de bits para evaluar.");
      const con = imgs.filter((i) => i.srcset).length;
      const r = con / imgs.length;
      const d = `${con} de ${imgs.length} imágenes (${pct(con, imgs.length)}) usan srcset o <picture>.`;
      return r >= 0.7 ? ok(d) : r >= 0.3 ? parcial(d, undefined, r) : falla(d);
    }),
  },
  {
    id: "resp-rendimiento-movil",
    categoria: "responsive",
    titulo: "Rendimiento en móvil",
    peso: 4,
    severidad: "importante",
    impacto: "alto",
    esfuerzo: "alto",
    area: "Desarrollo",
    fuente: "pagespeed",
    recomendacion: "Prioriza el móvil: menos scripts de terceros, imágenes ligeras, CSS crítico en línea y caché/CDN. Apunta a 70+ en PageSpeed móvil.",
    evaluar: (c) => {
      const s = c.movil?.resumen.puntajes.rendimiento;
      if (typeof s !== "number") return SIN_PSI;
      const e = c.escritorio?.resumen.puntajes.rendimiento;
      const d = `Rendimiento móvil ${s}/100${typeof e === "number" ? ` (escritorio ${e}/100)` : ""}.`;
      return s >= 90 ? ok(d) : s >= 50 ? parcial(d, undefined, s / 100) : falla(d);
    },
  },

  // ============================================================== Accesibilidad (10)
  {
    id: "a11y-alt",
    categoria: "accesibilidad",
    titulo: "Imágenes con texto alternativo",
    peso: 4,
    severidad: "importante",
    impacto: "medio",
    esfuerzo: "bajo",
    area: "Contenido/SEO",
    fuente: "html",
    recomendacion: "Describe cada imagen informativa en su alt («Viga IPR de 8 pulgadas en almacén»). Las decorativas llevan alt=\"\" vacío.",
    evaluar: conHtml((p) => {
      const imgs = p.imagenes.filter((i) => i.src);
      if (imgs.length === 0) return na("La página no tiene imágenes <img>.");
      const sin = imgs.filter((i) => i.alt === null);
      const r = 1 - sin.length / imgs.length;
      const d = `${sin.length} de ${imgs.length} imágenes no tienen atributo alt.`;
      const ev = sin.slice(0, 5).map((i) => i.src);
      return sin.length === 0 ? ok(`Las ${imgs.length} imágenes tienen alt.`) : r >= 0.8 ? parcial(d, ev, r) : falla(d, ev);
    }),
  },
  {
    id: "a11y-lang",
    categoria: "accesibilidad",
    titulo: "Idioma declarado en <html lang>",
    peso: 2,
    severidad: "mejora",
    impacto: "bajo",
    esfuerzo: "bajo",
    area: "Desarrollo",
    fuente: "html",
    recomendacion: 'Declara <html lang="es-MX"> para que lectores de pantalla y traductores usen el idioma correcto.',
    evaluar: conHtml((p) => (p.lang ? ok(`lang="${p.lang}".`) : falla("El <html> no declara idioma."))),
  },
  {
    id: "a11y-nombres",
    categoria: "accesibilidad",
    titulo: "Botones y enlaces con nombre accesible",
    peso: 3,
    severidad: "importante",
    impacto: "medio",
    esfuerzo: "bajo",
    area: "Desarrollo",
    fuente: "html",
    recomendacion: "Los botones de solo ícono (menú, redes, carrito, WhatsApp) necesitan aria-label o texto oculto que diga qué hacen.",
    evaluar: conHtml((p) => {
      const n = p.botonesSinNombre + p.enlacesSinTexto;
      if (n === 0) return ok("Todos los botones y enlaces tienen nombre.");
      const d = `${p.botonesSinNombre} botón(es) y ${p.enlacesSinTexto} enlace(s) sin nombre accesible.`;
      return n <= 3 ? parcial(d) : falla(d);
    }),
  },
  {
    id: "a11y-ids",
    categoria: "accesibilidad",
    titulo: "Sin IDs duplicados",
    peso: 1,
    severidad: "mejora",
    impacto: "bajo",
    esfuerzo: "bajo",
    area: "Desarrollo",
    fuente: "html",
    recomendacion: "Cada id debe ser único. Los duplicados rompen etiquetas de formularios, anclas y la navegación con lector de pantalla.",
    evaluar: conHtml((p) =>
      p.idsDuplicados.length === 0 ? ok("No hay IDs duplicados.") : p.idsDuplicados.length <= 3 ? parcial(`${p.idsDuplicados.length} ID(s) duplicado(s).`, p.idsDuplicados) : falla(`${p.idsDuplicados.length} IDs duplicados.`, p.idsDuplicados.slice(0, 5)),
    ),
  },
  {
    id: "a11y-estructura",
    categoria: "accesibilidad",
    titulo: "Regiones semánticas (main) y salto al contenido",
    peso: 2,
    severidad: "mejora",
    impacto: "bajo",
    esfuerzo: "bajo",
    area: "Desarrollo",
    fuente: "html",
    recomendacion: "Envuelve el contenido principal en <main> y agrega un enlace «Saltar al contenido» al inicio para quien navega con teclado.",
    evaluar: conHtml((p) =>
      p.tieneMain && p.saltarContenido ? ok("Tiene <main> y enlace para saltar al contenido.") : p.tieneMain || p.saltarContenido ? parcial(`Falta ${p.tieneMain ? "el enlace «Saltar al contenido»" : "la región <main>"}.`) : falla("No hay <main> ni enlace para saltar al contenido."),
    ),
  },
  {
    id: "a11y-lighthouse",
    categoria: "accesibilidad",
    titulo: "Puntaje de accesibilidad de Lighthouse",
    peso: 4,
    severidad: "importante",
    impacto: "medio",
    esfuerzo: "medio",
    area: "Desarrollo",
    fuente: "pagespeed",
    recomendacion: "Atiende los avisos de Accesibilidad de PageSpeed (etiquetas ARIA, contraste, orden de foco). Apunta a 90+.",
    evaluar: (c) => {
      const s = c.movil?.resumen.puntajes.accesibilidad ?? c.escritorio?.resumen.puntajes.accesibilidad;
      if (typeof s !== "number") return SIN_PSI;
      return s >= 90 ? ok(`Accesibilidad: ${s}/100.`) : s >= 70 ? parcial(`Accesibilidad: ${s}/100.`, undefined, s / 100) : falla(`Accesibilidad: ${s}/100.`);
    },
  },

  // ============================================================== Técnico (5)
  {
    id: "tec-https",
    categoria: "tecnico",
    titulo: "HTTPS y redirección desde http://",
    peso: 3,
    severidad: "critico",
    impacto: "alto",
    esfuerzo: "bajo",
    area: "Desarrollo",
    fuente: "red",
    recomendacion: "Sirve todo por HTTPS y redirige con 301 cualquier versión http:// (y www/no-www) a una sola URL canónica.",
    evaluar: (c) => {
      if (!c.urlFinal.startsWith("https://")) return falla("La página final se sirve sin HTTPS.");
      if (c.httpARedirige === false) return parcial("La página usa HTTPS, pero la versión http:// no redirige a https://.");
      return ok("HTTPS activo" + (c.httpARedirige ? " y http:// redirige a https://." : "."));
    },
  },
  {
    id: "tec-indexable",
    categoria: "tecnico",
    titulo: "La página se puede indexar",
    peso: 3,
    severidad: "critico",
    impacto: "alto",
    esfuerzo: "bajo",
    area: "Contenido/SEO",
    fuente: "html",
    recomendacion: "Quita noindex de las páginas que deben aparecer en Google (revisa el ajuste «Disuadir a los motores de búsqueda» si es WordPress).",
    evaluar: (c) => {
      const hdr = c.headers?.get("x-robots-tag") ?? "";
      const meta = c.pagina?.robots ?? "";
      if (/noindex/i.test(meta + " " + hdr)) return falla(`La página tiene noindex (${meta ? `meta robots «${meta}»` : `X-Robots-Tag «${hdr}»`}).`);
      if (c.status && c.status >= 400) return falla(`La página responde ${c.status}.`);
      return ok("Sin noindex y con respuesta correcta.");
    },
  },
  {
    id: "tec-titulo-descripcion",
    categoria: "tecnico",
    titulo: "Title y meta description",
    peso: 2,
    severidad: "importante",
    impacto: "medio",
    esfuerzo: "bajo",
    area: "Contenido/SEO",
    fuente: "html",
    recomendacion: "Title de 30–60 caracteres con el servicio principal y la marca; description de 70–160 caracteres con beneficio y llamada a la acción.",
    evaluar: conHtml((p) => {
      const prob: string[] = [];
      const t = p.titulo?.length ?? 0;
      const d = p.descripcion?.length ?? 0;
      if (!t) prob.push("sin title");
      else if (t < 30 || t > 65) prob.push(`title de ${t} caracteres`);
      if (!d) prob.push("sin meta description");
      else if (d < 70 || d > 165) prob.push(`description de ${d} caracteres`);
      const ev = [p.titulo ? `Title: ${p.titulo}` : "", p.descripcion ? `Description: ${p.descripcion}` : ""].filter(Boolean);
      if (prob.length === 0) return ok("Title y description con buena longitud.", ev);
      return !t || !d ? falla(prob.join("; ") + ".", ev) : parcial(prob.join("; ") + ".", ev);
    }),
  },
  {
    id: "tec-robots-sitemap",
    categoria: "tecnico",
    titulo: "robots.txt y sitemap.xml",
    peso: 1,
    severidad: "mejora",
    impacto: "bajo",
    esfuerzo: "bajo",
    area: "Contenido/SEO",
    fuente: "red",
    recomendacion: "Publica /robots.txt con la línea Sitemap: y un sitemap.xml actualizado; da de alta el sitemap en Search Console.",
    evaluar: (c) => {
      const robots = c.robots && c.robots.status < 400 && c.robots.texto.length > 0;
      const bloqueaTodo = robots && /^\s*disallow:\s*\/\s*$/im.test(c.robots!.texto) && /user-agent:\s*\*/i.test(c.robots!.texto);
      if (bloqueaTodo) return falla("robots.txt bloquea todo el sitio (Disallow: /).");
      if (robots && c.sitemap) return ok("robots.txt y sitemap.xml presentes.");
      if (robots || c.sitemap) return parcial(`Falta ${robots ? "sitemap.xml" : "robots.txt"}.`);
      return falla("No se encontraron robots.txt ni sitemap.xml.");
    },
  },
  {
    id: "tec-ttfb",
    categoria: "tecnico",
    titulo: "Respuesta del servidor (TTFB ≤ 800 ms)",
    peso: 2,
    severidad: "importante",
    impacto: "medio",
    esfuerzo: "medio",
    area: "Desarrollo",
    fuente: "red",
    recomendacion: "Activa caché de página completa, un CDN (Cloudflare) y revisa el plan de hosting. Un TTFB alto retrasa todo lo demás.",
    evaluar: (c) => {
      const crux = c.movil?.audits ? audit(c.movil.audits, "server-response-time") : null;
      const ms = typeof crux?.numericValue === "number" && crux.numericValue > 0 ? crux.numericValue : c.ttfbMs;
      if (typeof ms !== "number") return na("No se midió el tiempo de respuesta.");
      const d = `TTFB de ${Math.round(ms)} ms${crux?.numericValue ? " (Lighthouse)" : " (medido desde el servidor de la auditoría)"}.`;
      return ms <= 800 ? ok(d) : ms <= 1800 ? parcial(d) : falla(d);
    },
  },
  {
    id: "tec-compresion-cache",
    categoria: "tecnico",
    titulo: "Compresión y cabeceras de seguridad",
    peso: 1,
    severidad: "mejora",
    impacto: "bajo",
    esfuerzo: "bajo",
    area: "Desarrollo",
    fuente: "red",
    recomendacion: "Activa compresión Brotli/Gzip y agrega Strict-Transport-Security y X-Content-Type-Options: nosniff en el servidor o CDN.",
    evaluar: (c) => {
      if (!c.headers) return na("No se pudieron leer las cabeceras.");
      const faltan: string[] = [];
      if (!c.headers.get("content-encoding")) faltan.push("compresión (content-encoding)");
      if (!c.headers.get("strict-transport-security")) faltan.push("HSTS");
      if (!c.headers.get("x-content-type-options")) faltan.push("X-Content-Type-Options");
      if (faltan.length === 0) return ok("Compresión, HSTS y nosniff activos.");
      return faltan.length === 3 ? falla(`Faltan: ${faltan.join(", ")}.`) : parcial(`Faltan: ${faltan.join(", ")}.`, undefined, 1 - faltan.length / 3);
    },
  },
  {
    id: "tec-datos-estructurados",
    categoria: "tecnico",
    titulo: "Datos estructurados (schema.org)",
    peso: 1,
    severidad: "mejora",
    impacto: "medio",
    esfuerzo: "bajo",
    area: "Contenido/SEO",
    fuente: "html",
    recomendacion: "Agrega JSON-LD de Organization/LocalBusiness (nombre, logo, teléfono, dirección) y, si aplica, Product o Service.",
    evaluar: conHtml((p) => {
      if (p.jsonLd.includes("(JSON-LD inválido)")) return parcial("Hay un bloque JSON-LD con errores de sintaxis.", p.jsonLd);
      return p.jsonLd.length ? ok(`Tipos: ${p.jsonLd.slice(0, 6).join(", ")}.`) : falla("No hay datos estructurados JSON-LD.");
    }),
  },
  {
    id: "tec-bloqueo-render",
    categoria: "tecnico",
    titulo: "Recursos que bloquean el renderizado / JS sin usar",
    peso: 2,
    severidad: "mejora",
    impacto: "medio",
    esfuerzo: "medio",
    area: "Desarrollo",
    fuente: "pagespeed",
    recomendacion: "Difiere (defer/async) los scripts no críticos, quita plugins que no se usan y carga el CSS crítico en línea.",
    evaluar: (c) => {
      const a = porPuntajeLH(["render-blocking-insight", "render-blocking-resources"], "", () => "")(c);
      const b = porPuntajeLH(["unused-javascript"], "", () => "")(c);
      if (a.estado === "na" && b.estado === "na") return a;
      const prob = [a.estado !== "ok" && a.estado !== "na" ? "recursos que bloquean el renderizado" : null, b.estado !== "ok" && b.estado !== "na" ? "JavaScript sin usar" : null].filter(Boolean) as string[];
      const ev = [...(a.evidencia ?? []), ...(b.evidencia ?? [])].slice(0, 5);
      if (prob.length === 0) return ok("Sin bloqueos de renderizado relevantes.");
      return prob.length === 2 ? falla(`Hay ${prob.join(" y ")}.`, ev) : parcial(`Hay ${prob[0]}.`, ev);
    },
  },
];
