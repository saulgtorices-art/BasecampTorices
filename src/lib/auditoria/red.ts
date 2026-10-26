// Descargas seguras para el motor de auditoría (solo servidor).
// La URL la escribe un usuario, así que antes de cada salto se valida que el
// host no apunte a la red interna (localhost, 10.x, metadatos de la nube…).

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 ToricesAuditor/1.0";

const MAX_BYTES = 4 * 1024 * 1024;

export class ErrorRed extends Error {}

function ipPrivada(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const mapeada = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapeada ? ipPrivada(mapeada[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/** Lanza ErrorRed si la URL no es http(s) pública. */
export async function validarUrlPublica(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ErrorRed("Solo se auditan URLs http(s).");
  if (url.username || url.password) throw new ErrorRed("La URL no puede llevar usuario ni contraseña.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal"))
    throw new ErrorRed("Esa dirección no es pública.");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
  if (ips.length === 0) throw new ErrorRed(`No se encontró el dominio ${host}.`);
  if (ips.some(ipPrivada)) throw new ErrorRed("Esa dirección no es pública.");
}

/** Normaliza lo que escribe el usuario ("acme.com/contacto") a una URL absoluta. */
export function normalizarUrl(entrada: string): string {
  let t = entrada.trim();
  if (!/^https?:\/\//i.test(t)) t = "https://" + t.replace(/^\/+/, "");
  const u = new URL(t);
  u.hash = "";
  return u.toString();
}

export interface Respuesta {
  url: string;
  urlFinal: string;
  status: number;
  headers: Headers;
  cuerpo: string;
  bytes: number;
  ttfbMs: number;
  redirecciones: string[];
}

/** GET con redirecciones manuales (máx. 6), validando cada salto. */
export async function descargar(
  url: string,
  { timeoutMs = 20000, maxBytes = MAX_BYTES, cuerpo = true }: { timeoutMs?: number; maxBytes?: number; cuerpo?: boolean } = {},
): Promise<Respuesta> {
  const redirecciones: string[] = [];
  let actual = new URL(url);
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), timeoutMs);
  try {
    for (let salto = 0; salto <= 6; salto++) {
      await validarUrlPublica(actual);
      const inicio = performance.now();
      const r = await fetch(actual, {
        redirect: "manual",
        signal: control.signal,
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-MX,es;q=0.9,en;q=0.6",
          "Accept-Encoding": "gzip, deflate, br",
        },
      });
      const ttfbMs = Math.round(performance.now() - inicio);
      const destino = r.headers.get("location");
      if (r.status >= 300 && r.status < 400 && destino) {
        await r.body?.cancel();
        redirecciones.push(`${r.status} → ${new URL(destino, actual).toString()}`);
        actual = new URL(destino, actual);
        continue;
      }
      let texto = "";
      let bytes = 0;
      if (cuerpo && r.body) {
        const lector = r.body.getReader();
        const partes: Uint8Array[] = [];
        for (;;) {
          const { done, value } = await lector.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes) {
            await lector.cancel();
            break;
          }
          partes.push(value);
        }
        texto = new TextDecoder("utf-8").decode(Buffer.concat(partes));
      } else {
        await r.body?.cancel();
      }
      return { url, urlFinal: actual.toString(), status: r.status, headers: r.headers, cuerpo: texto, bytes, ttfbMs, redirecciones };
    }
    throw new ErrorRed("Demasiadas redirecciones.");
  } catch (e) {
    if (e instanceof ErrorRed) throw e;
    if ((e as Error).name === "AbortError") throw new ErrorRed(`La página tardó más de ${timeoutMs / 1000} s en responder.`);
    throw new ErrorRed(`No se pudo abrir ${actual.host}: ${(e as Error).message}`);
  } finally {
    clearTimeout(reloj);
  }
}
