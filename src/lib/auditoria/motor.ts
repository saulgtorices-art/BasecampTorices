// Orquesta una auditoría completa y guarda el resultado en `auditorias`.
// Se ejecuta en segundo plano (after() en la ruta POST) y va escribiendo el
// paso actual en `progreso` para que el reporte muestre el avance.

import * as cheerio from "cheerio";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contexto } from "./checks";
import { analizarHtml, type DatosPagina } from "./html";
import { redactarConIA } from "./ia";
import { consultarPageSpeed, type PageSpeed } from "./pagespeed";
import { calcularPuntajes, evaluarChecks, pasosBase, quickWins, resumenBase, veredictosBase } from "./puntaje";
import { descargar, ErrorRed, type Respuesta } from "./red";
import type { Capturas, PaginaClave, ResultadoAuditoria } from "./tipos";

const PRIORIDAD_PAGINAS = /contacto|cotiza|producto|servicio|cat[aá]logo|nosotros|empresa|tienda|soluciones|precios/i;

async function paginasClave(pagina: DatosPagina | null, urlFinal: string): Promise<PaginaClave[]> {
  if (!pagina) return [];
  const actual = new URL(urlFinal);
  actual.hash = "";
  const candidatas = pagina.navegacion
    .filter((e) => {
      const u = new URL(e.href);
      return u.pathname !== actual.pathname && !/\.(pdf|jpe?g|png|zip|docx?)$/i.test(u.pathname) && !u.pathname.includes("/wp-admin");
    })
    .sort((a, b) => Number(PRIORIDAD_PAGINAS.test(b.texto + b.href)) - Number(PRIORIDAD_PAGINAS.test(a.texto + a.href)))
    .slice(0, 6);
  return Promise.all(
    candidatas.map(async (e): Promise<PaginaClave> => {
      try {
        const r = await descargar(e.href, { timeoutMs: 12000, maxBytes: 1_500_000 });
        const $ = cheerio.load(r.cuerpo);
        return {
          url: r.urlFinal,
          texto: e.texto,
          status: r.status,
          titulo: $("title").first().text().trim().slice(0, 140) || null,
          h1: $("h1").first().text().replace(/\s+/g, " ").trim().slice(0, 140) || null,
        };
      } catch (err) {
        return { url: e.href, texto: e.texto, status: null, titulo: null, h1: null, error: (err as Error).message };
      }
    }),
  );
}

async function robotsYSitemap(origen: string) {
  const robots = await descargar(`${origen}/robots.txt`, { timeoutMs: 8000, maxBytes: 300_000 }).catch(() => null);
  const robotsOk = robots && robots.status < 400 && !/<html/i.test(robots.cuerpo.slice(0, 500)) ? { status: robots.status, texto: robots.cuerpo } : robots ? { status: robots.status, texto: "" } : null;
  const declarado = robotsOk?.texto.match(/^\s*sitemap:\s*(\S+)/im)?.[1];
  let sitemap = false;
  for (const u of [declarado, `${origen}/sitemap.xml`, `${origen}/sitemap_index.xml`].filter(Boolean) as string[]) {
    const r = await descargar(u, { timeoutMs: 8000, maxBytes: 200_000 }).catch(() => null);
    if (r && r.status < 400 && /<(urlset|sitemapindex)/i.test(r.cuerpo)) {
      sitemap = true;
      break;
    }
  }
  return { robots: robotsOk, sitemap };
}

async function httpRedirigeAHttps(urlFinal: string): Promise<boolean | null> {
  const u = new URL(urlFinal);
  if (u.protocol !== "https:") return null;
  u.protocol = "http:";
  try {
    const r = await descargar(u.toString(), { timeoutMs: 8000, cuerpo: false });
    return r.urlFinal.startsWith("https://");
  } catch {
    return null;
  }
}

export async function ejecutarAuditoria(db: SupabaseClient, id: string, url: string) {
  const inicio = Date.now();
  const paso = (progreso: string) => db.from("auditorias").update({ progreso }).eq("id", id);

  try {
    await paso("Descargando la página y corriendo PageSpeed en móvil y escritorio…");
    const psiMovil = consultarPageSpeed(url, "mobile");
    const psiEscritorio = consultarPageSpeed(url, "desktop");

    let respuesta: Respuesta | null = null;
    let errorDescarga: string | null = null;
    try {
      respuesta = await descargar(url);
    } catch (e) {
      errorDescarga = (e as Error).message;
      if (e instanceof ErrorRed && /no es pública|Solo se auditan|usuario ni contraseña/.test(errorDescarga)) throw e;
    }
    const urlFinal = respuesta?.urlFinal ?? url;
    const esHtml = !!respuesta && /html/i.test(respuesta.headers.get("content-type") ?? "text/html");
    // 403/429/503 suelen ser un firewall que bloquea bots: no se analiza la página de bloqueo.
    const bloqueada = !!respuesta && [401, 403, 429, 503].includes(respuesta.status);
    const pagina = respuesta && !bloqueada && respuesta.status < 400 && esHtml && respuesta.cuerpo ? analizarHtml(respuesta.cuerpo, urlFinal) : null;

    await paso("Revisando páginas del menú, robots.txt y sitemap…");
    const origen = new URL(urlFinal).origin;
    const [paginas, rs, httpARedirige] = await Promise.all([paginasClave(pagina, urlFinal), robotsYSitemap(origen), httpRedirigeAHttps(urlFinal)]);

    await paso("Esperando resultados de PageSpeed Insights…");
    const [movil, escritorio]: [PageSpeed, PageSpeed] = await Promise.all([psiMovil, psiEscritorio]);
    if (!respuesta && !movil.resumen.ok && !escritorio.resumen.ok) {
      throw new Error(errorDescarga ?? "No se pudo abrir la página.");
    }

    const ctx: Contexto = {
      url,
      urlFinal,
      pagina,
      status: bloqueada ? null : (respuesta?.status ?? null),
      headers: bloqueada ? null : (respuesta?.headers ?? null),
      ttfbMs: respuesta?.ttfbMs ?? null,
      httpARedirige,
      robots: rs.robots,
      sitemap: rs.sitemap,
      movil: movil.resumen.ok ? movil : null,
      escritorio: escritorio.resumen.ok ? escritorio : null,
      paginas,
    };

    const hallazgos = evaluarChecks(ctx);
    const { puntajes, total, calificacion } = calcularPuntajes(hallazgos);
    const capturas: Capturas = { movil: movil.captura, escritorio: escritorio.captura };

    await paso("Redactando veredictos y próximos pasos con IA…");
    const ia = await redactarConIA({
      url: urlFinal,
      pagina,
      hallazgos,
      puntajes,
      total,
      capturas,
      vitales: { movil: movil.resumen, escritorio: escritorio.resumen },
    });

    const lagunas = [
      ...(ia?.lagunas ?? []),
      "Sin datos de comportamiento: conectar Search Console, GA4 y Microsoft Clarity permitiría ver consultas, embudos, clics muertos y mapas de calor.",
      ...(pagina?.pareceSPA ? ["El sitio arma su contenido con JavaScript: los checks de HTML pueden no ver todo lo que ve el usuario."] : []),
      ...(bloqueada ? [`El servidor respondió ${respuesta!.status} a la descarga automática (posible firewall o protección anti-bots); los checks de HTML quedaron sin evaluar.`] : []),
      ...(!pagina && !bloqueada ? [`No se pudo leer el HTML (${errorDescarga ?? `respuesta ${respuesta?.status ?? "vacía"}`}); solo se usó PageSpeed.`] : []),
      ...[movil, escritorio].filter((x) => !x.resumen.ok).map((x) => x.resumen.error ?? "PageSpeed no respondió."),
    ];

    const resultado: ResultadoAuditoria = {
      version: 1,
      url,
      urlFinal,
      titulo: pagina?.titulo ?? null,
      resumen: ia?.resumen ?? resumenBase(total, puntajes, hallazgos),
      generadoConIA: !!ia,
      modeloIA: ia?.modelo,
      veredictos: ia?.veredictos ?? veredictosBase(hallazgos, puntajes),
      hallazgos,
      hallazgosIA: ia?.hallazgosIA ?? [],
      quickWins: quickWins(hallazgos),
      proximosPasos: ia?.proximosPasos.length ? ia.proximosPasos : pasosBase(hallazgos),
      lagunas: [...new Set(lagunas)],
      paginas,
      pagespeed: { movil: movil.resumen, escritorio: escritorio.resumen },
      red: {
        ttfbMs: respuesta?.ttfbMs ?? null,
        status: respuesta?.status ?? null,
        redirecciones: respuesta?.redirecciones ?? [],
        bytesHtml: respuesta?.bytes ?? null,
      },
      duracionMs: Date.now() - inicio,
    };

    const { error } = await db
      .from("auditorias")
      .update({ estado: "lista", progreso: null, puntaje: total, calificacion, puntajes, resultado, capturas, error: null })
      .eq("id", id);
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("[auditoria]", id, e);
    await db
      .from("auditorias")
      .update({ estado: "error", progreso: null, error: (e as Error).message.slice(0, 500) })
      .eq("id", id);
  }
}
