// Extrae del HTML (tal como lo entrega el servidor) los datos que usan los
// checks. No ejecuta JavaScript: si el sitio arma todo en el navegador, la
// auditoría lo marca como laguna y se apoya en Lighthouse.

import * as cheerio from "cheerio";

export interface Imagen {
  src: string;
  alt: string | null;
  width: boolean;
  height: boolean;
  srcset: boolean;
  lazy: boolean;
}

export interface Enlace {
  href: string;
  texto: string;
  interno: boolean;
}

export interface Formulario {
  campos: number;
  sinEtiqueta: string[];
  obligatorios: number;
}

export interface DatosPagina {
  titulo: string | null;
  descripcion: string | null;
  lang: string | null;
  viewport: string | null;
  canonical: string | null;
  robots: string | null;
  ogImagen: string | null;
  favicon: boolean;
  h1: string[];
  encabezados: { nivel: number; texto: string }[];
  imagenes: Imagen[];
  enlaces: Enlace[];
  navegacion: Enlace[];
  formularios: Formulario[];
  ctas: { texto: string; enHero: boolean; tipo: "boton" | "enlace" }[];
  telefonos: string[];
  whatsapp: boolean;
  correo: boolean;
  avisoPrivacidad: boolean;
  idsDuplicados: string[];
  tieneMain: boolean;
  saltarContenido: boolean;
  botonesSinNombre: number;
  enlacesSinTexto: number;
  jsonLd: string[];
  fuentes: string[];
  carrusel: string | null;
  palabras: number;
  scripts: number;
  estilos: number;
  /** El cuerpo trae casi nada de texto pero sí un contenedor de app (React, Vue…). */
  pareceSPA: boolean;
  /** Señales de confianza: testimonios, clientes, certificaciones, garantía… */
  confianza: string[];
}

const VERBOS_CTA =
  /\b(cotiza|cotizar|cotizaci[oó]n|contact[ao]|cont[aá]ctanos|llama|ll[aá]manos|compra|comprar|agenda|agendar|solicita|solicitar|reserva|reservar|pide|pedir|descarga|descargar|suscr[ií]bete|reg[ií]strate|empieza|comienza|prueba|demo|whatsapp|escr[ií]benos|quiero|obt[eé]n|ver cat[aá]logo|ver productos|comprar ahora|get started|contact|buy|book|request|quote)\b/i;

const SENALES_CONFIANZA: [RegExp, string][] = [
  [/testimonio|opiniones|rese[nñ]as|lo que dicen/i, "Testimonios / reseñas"],
  [/clientes|conf[ií]an en nosotros|marcas que/i, "Clientes / logos"],
  [/certificad|iso ?9001|norma|acreditad/i, "Certificaciones"],
  [/garant[ií]a/i, "Garantía"],
  [/a[nñ]os de experiencia|desde 19\d\d|desde 20\d\d|trayectoria/i, "Trayectoria"],
  [/casos de [eé]xito|proyectos realizados|portafolio/i, "Casos / portafolio"],
];

const limpiar = (s: string) => s.replace(/\s+/g, " ").trim();

export function analizarHtml(html: string, urlBase: string): DatosPagina {
  const $ = cheerio.load(html);
  const base = new URL(urlBase);
  const host = base.hostname.replace(/^www\./, "");
  const abs = (h: string) => {
    try {
      return new URL(h, base);
    } catch {
      return null;
    }
  };

  const meta = (sel: string) => limpiar($(sel).first().attr("content") ?? "") || null;

  // ---------------------------------------------------------------- encabezados
  const encabezados: DatosPagina["encabezados"] = [];
  $("h1,h2,h3,h4,h5,h6").each((_, el) => {
    encabezados.push({ nivel: Number(el.tagName.slice(1)), texto: limpiar($(el).text()).slice(0, 140) });
  });

  // ---------------------------------------------------------------- imágenes
  const imagenes: Imagen[] = [];
  $("img").each((_, el) => {
    const $el = $(el);
    const src = $el.attr("src") || $el.attr("data-src") || $el.attr("data-lazy-src") || "";
    if (/^data:image\/(gif|svg)/.test(src) && !$el.attr("data-src")) return; // píxeles espaciadores
    imagenes.push({
      src: src.slice(0, 200),
      alt: $el.attr("alt") === undefined ? null : limpiar($el.attr("alt")!),
      width: $el.attr("width") !== undefined,
      height: $el.attr("height") !== undefined,
      srcset: !!($el.attr("srcset") || $el.attr("data-srcset") || $el.parent().is("picture")),
      lazy: $el.attr("loading") === "lazy" || !!$el.attr("data-src"),
    });
  });

  // ---------------------------------------------------------------- enlaces
  const enlaces: Enlace[] = [];
  let enlacesSinTexto = 0;
  $("a[href]").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href")!.trim();
    const texto = limpiar($el.text()) || $el.attr("aria-label") || $el.attr("title") || $el.find("img[alt]").attr("alt") || "";
    if (!texto.trim()) enlacesSinTexto++;
    const u = abs(href);
    const interno = !!u && /^https?:$/.test(u.protocol) && u.hostname.replace(/^www\./, "") === host;
    enlaces.push({ href: u?.toString() ?? href, texto: limpiar(texto).slice(0, 80), interno });
  });

  const navegacion: Enlace[] = [];
  const vistos = new Set<string>();
  $("nav a[href], header a[href], [role=navigation] a[href]").each((_, el) => {
    const u = abs($(el).attr("href")!);
    const texto = limpiar($(el).text());
    if (!u || !texto || !/^https?:$/.test(u.protocol)) return;
    if (u.hostname.replace(/^www\./, "") !== host) return;
    u.hash = "";
    const k = u.toString();
    if (vistos.has(k)) return;
    vistos.add(k);
    navegacion.push({ href: k, texto: texto.slice(0, 60), interno: true });
  });

  // ---------------------------------------------------------------- formularios
  const formularios: Formulario[] = [];
  const etiquetasFor = new Set(
    $("label[for]")
      .toArray()
      .map((l) => $(l).attr("for")!),
  );
  $("form").each((_, f) => {
    const campos = $(f).find("input, select, textarea").filter((_, c) => {
      const t = ($(c).attr("type") ?? "").toLowerCase();
      return !["hidden", "submit", "button", "reset", "image"].includes(t);
    });
    const sinEtiqueta: string[] = [];
    let obligatorios = 0;
    campos.each((_, c) => {
      const $c = $(c);
      if ($c.attr("required") !== undefined || $c.attr("aria-required") === "true") obligatorios++;
      const id = $c.attr("id");
      const etiquetado =
        (!!id && etiquetasFor.has(id)) ||
        $c.closest("label").length > 0 ||
        !!$c.attr("aria-label") ||
        !!$c.attr("aria-labelledby") ||
        !!$c.attr("title");
      if (!etiquetado) sinEtiqueta.push($c.attr("name") || $c.attr("placeholder") || c.tagName);
    });
    formularios.push({ campos: campos.length, sinEtiqueta, obligatorios });
  });

  // ---------------------------------------------------------------- CTAs
  // "Hero": lo que está en el header o en el primer tercio del documento.
  const todos = $("body *").toArray();
  const limiteHero = Math.max(40, Math.floor(todos.length * 0.3));
  const posicion = new Map(todos.map((el, i) => [el, i]));
  const ctas: DatosPagina["ctas"] = [];
  $("a[href], button, input[type=submit]").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href") ?? "";
    const etiqueta = limpiar($el.text() || $el.attr("value") || $el.attr("aria-label") || $el.find("img[alt]").attr("alt") || "");
    const texto = etiqueta || (/wa\.me|whatsapp/.test(href) ? "WhatsApp" : href.startsWith("tel:") ? "Llamar" : "");
    const esCta = VERBOS_CTA.test(texto) || /wa\.me|api\.whatsapp|tel:/.test(href);
    if (!esCta || texto.length > 60) return;
    // Un enlace normal del menú ("Contacto") no cuenta como CTA salvo que tenga estilo de botón.
    const claseBoton = /btn|button|boton|cta/i.test(($el.attr("class") ?? "") + " " + ($el.parent().attr("class") ?? ""));
    if ($el.closest("nav, [role=navigation]").length > 0 && !claseBoton && !/wa\.me|tel:/.test(href)) return;
    const enHero = (posicion.get(el) ?? Infinity) < limiteHero || $el.closest("header").length > 0;
    ctas.push({ texto, enHero, tipo: el.tagName === "a" ? "enlace" : "boton" });
  });

  // ---------------------------------------------------------------- ids duplicados
  const conteoIds = new Map<string, number>();
  $("[id]").each((_, el) => {
    const id = $(el).attr("id")!;
    conteoIds.set(id, (conteoIds.get(id) ?? 0) + 1);
  });
  const idsDuplicados = [...conteoIds].filter(([, n]) => n > 1).map(([id, n]) => `#${id} ×${n}`);

  let botonesSinNombre = 0;
  $("button").each((_, el) => {
    const $el = $(el);
    if (!limpiar($el.text()) && !$el.attr("aria-label") && !$el.attr("aria-labelledby") && !$el.attr("title"))
      botonesSinNombre++;
  });

  // ---------------------------------------------------------------- datos estructurados
  const jsonLd: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const datos = JSON.parse($(el).text());
      const lista = Array.isArray(datos) ? datos : datos["@graph"] ?? [datos];
      for (const d of lista) {
        const t = d?.["@type"];
        if (t) jsonLd.push(...(Array.isArray(t) ? t : [t]).map(String));
      }
    } catch {
      jsonLd.push("(JSON-LD inválido)");
    }
  });

  // ---------------------------------------------------------------- tipografías
  const fuentes = new Set<string>();
  $('link[href*="fonts.googleapis.com"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    for (const m of href.matchAll(/family=([^&:]+)/g)) fuentes.add(decodeURIComponent(m[1].replace(/\+/g, " ")));
  });
  const css = $("style").text();
  for (const m of css.matchAll(/@font-face\s*{[^}]*font-family:\s*['"]?([^;'"]+)/g)) fuentes.add(m[1].trim());

  // ---------------------------------------------------------------- carrusel
  const marcadoCarrusel = html.match(/\b(swiper|slick-slider|owl-carousel|carousel|splide|flickity|glide__|rev_slider|elementor-slides)\b/i);

  // ---------------------------------------------------------------- texto
  const $cuerpo = $("body").clone();
  $cuerpo.find("script,style,noscript,svg,template").remove();
  const texto = limpiar($cuerpo.text());
  const palabras = texto ? texto.split(" ").length : 0;
  const pareceSPA = palabras < 60 && $("#root, #app, #__next, [data-reactroot], #___gatsby, app-root").length > 0;

  const confianza = SENALES_CONFIANZA.filter(([re]) => re.test(texto)).map(([, n]) => n);

  const hrefs = enlaces.map((e) => e.href.toLowerCase());
  return {
    titulo: limpiar($("title").first().text()) || null,
    descripcion: meta('meta[name="description" i]'),
    lang: $("html").attr("lang")?.trim() || null,
    viewport: meta('meta[name="viewport" i]'),
    canonical: $('link[rel="canonical" i]').attr("href") ?? null,
    robots: meta('meta[name="robots" i]'),
    ogImagen: meta('meta[property="og:image" i]'),
    favicon: $('link[rel~="icon" i], link[rel="apple-touch-icon" i]').length > 0,
    h1: $("h1")
      .toArray()
      .map((el) => limpiar($(el).text()).slice(0, 140)),
    encabezados,
    imagenes,
    enlaces,
    navegacion: navegacion.slice(0, 30),
    formularios,
    ctas,
    telefonos: [...new Set(hrefs.filter((h) => h.startsWith("tel:")).map((h) => h.slice(4)))],
    whatsapp: hrefs.some((h) => /wa\.me|whatsapp\.com/.test(h)),
    correo: hrefs.some((h) => h.startsWith("mailto:")),
    avisoPrivacidad: enlaces.some((e) => /privacidad|privacy/i.test(e.texto + " " + e.href)),
    idsDuplicados,
    tieneMain: $("main, [role=main]").length > 0,
    saltarContenido: $('a[href^="#"]')
      .toArray()
      .slice(0, 5)
      .some((el) => /saltar|ir al contenido|skip/i.test($(el).text())),
    botonesSinNombre,
    enlacesSinTexto,
    jsonLd: [...new Set(jsonLd)],
    fuentes: [...fuentes],
    carrusel: marcadoCarrusel?.[1] ?? null,
    palabras,
    scripts: $("script[src]").length,
    estilos: $('link[rel="stylesheet" i]').length,
    pareceSPA,
    confianza,
  };
}
