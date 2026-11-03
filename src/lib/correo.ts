import nodemailer from "nodemailer";

// Envío de avisos por correo con una cuenta de Gmail (contraseña de aplicación).
// Variables (Vercel → Settings → Environment Variables):
//   CORREO_USUARIO     cuenta que envía, ej. avisos.torices@gmail.com
//   CORREO_CONTRASENA  contraseña de aplicación de 16 letras (no la contraseña normal)
//   CORREO_SMTP_HOST   opcional, por defecto smtp.gmail.com (puerto 465)

export function correoConfigurado() {
  return !!(process.env.CORREO_USUARIO && process.env.CORREO_CONTRASENA);
}

let transporte: nodemailer.Transporter | null = null;

export async function enviarCorreo(c: { para: string; asunto: string; html: string; texto: string }) {
  if (!correoConfigurado()) throw new Error("Faltan CORREO_USUARIO y CORREO_CONTRASENA en Vercel.");
  transporte ??= nodemailer.createTransport({
    host: process.env.CORREO_SMTP_HOST || "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.CORREO_USUARIO, pass: process.env.CORREO_CONTRASENA!.replace(/\s+/g, "") },
  });
  await transporte.sendMail({
    from: { name: "Basecamp Torices", address: process.env.CORREO_USUARIO! },
    to: c.para,
    subject: c.asunto,
    text: c.texto,
    html: c.html,
  });
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** Correo sencillo con el texto del aviso y un botón para abrirlo en la app. */
export function plantillaAviso(p: {
  para: string;
  actor: string | null;
  texto: string;
  contexto?: string | null;
  enlace: string;
  boton: string;
  ajustes: string;
}) {
  const linea = `${p.actor ? `${p.actor} ` : ""}${p.texto}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0">
<tr><td style="padding:20px 24px 4px;font-size:13px;color:#64748b">Grupo Torices · Marketing</td></tr>
<tr><td style="padding:4px 24px 0;font-size:16px;line-height:1.5">Hola ${esc(p.para)},</td></tr>
<tr><td style="padding:8px 24px 0;font-size:16px;line-height:1.5">${p.actor ? `<b>${esc(p.actor)}</b> ` : ""}${esc(p.texto)}</td></tr>
${p.contexto ? `<tr><td style="padding:6px 24px 0;font-size:13px;color:#64748b">${esc(p.contexto)}</td></tr>` : ""}
<tr><td style="padding:20px 24px 24px"><a href="${esc(p.enlace)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:bold">${esc(p.boton)}</a></td></tr>
</table>
<p style="font-size:12px;color:#94a3b8;margin:14px 0 0">Elige qué avisos te llegan por correo en <a href="${esc(p.ajustes)}" style="color:#64748b">Mi perfil</a>.</p>
</td></tr></table></body></html>`;
  const texto = `${linea}\n${p.contexto ? `${p.contexto}\n` : ""}\n${p.boton}: ${p.enlace}\n\nElige qué avisos te llegan por correo: ${p.ajustes}`;
  return { html, texto, asunto: linea.length > 110 ? `${linea.slice(0, 107)}…` : linea };
}

/** URL pública de la app (para los enlaces del correo). */
export function urlApp(peticion: Request) {
  const fija = process.env.APP_URL?.replace(/\/$/, "");
  if (fija) return fija;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return new URL(peticion.url).origin;
}
