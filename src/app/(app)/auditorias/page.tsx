"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LoaderCircle, ScanSearch } from "lucide-react";
import Encabezado from "@/components/Encabezado";
import { useDatos } from "@/components/datos/DatosProvider";
import { useGenerarAuditoria } from "@/components/auditoria/BotonAuditoria";
import Calificacion from "@/components/auditoria/Calificacion";
import { estaAbandonada, useAuditorias } from "@/components/auditoria/useAuditorias";
import { formatoFechaHora } from "@/lib/ui";

export default function AuditoriasPage() {
  const { clientes, clientePorId, miembroPorId } = useDatos();
  const { lista, cargando, disponible } = useAuditorias();
  const { generar, generando } = useGenerarAuditoria();
  const [clienteId, setClienteId] = useState("");
  const [url, setUrl] = useState("");
  const [filtro, setFiltro] = useState("");

  const activos = useMemo(() => clientes.filter((c) => c.activo), [clientes]);
  const elegido = clientePorId.get(clienteId);
  const filas = filtro ? lista.filter((a) => a.cliente_id === filtro) : lista;

  return (
    <>
      <Encabezado
        titulo="Auditorías UX/UI"
        subtitulo="PageSpeed (móvil y escritorio) + revisión del HTML + redacción con IA. Puntaje sobre 100: UX 40 · UI 35 · Responsive 10 · Accesibilidad 10 · Técnico 5."
      />
      <div className="max-w-5xl p-4 md:p-6">
        {!disponible ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Falta aplicar la migración <code>20261026000001_auditorias_ux.sql</code> en Supabase.
          </div>
        ) : (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (clienteId) void generar(clienteId, url);
              }}
              className="mb-6 grid gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]"
            >
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="campo" required>
                <option value="">Cliente…</option>
                {activos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={elegido?.dominio ? `${elegido.dominio} (o una página específica)` : "URL a auditar (opcional si el cliente tiene dominio)"}
                className="campo"
              />
              <button className="btn-primario justify-center" disabled={!clienteId || generando || (!url.trim() && !elegido?.dominio)}>
                {generando ? <LoaderCircle size={15} className="animate-spin" /> : <ScanSearch size={15} />}
                Generar auditoría UX/UI
              </button>
            </form>

            <div className="mb-2 flex items-center gap-2">
              <h2 className="mr-auto text-sm font-semibold text-slate-700">Historial</h2>
              <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="campo w-auto py-1 text-xs">
                <option value="">Todos los clientes</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Cliente</th>
                    <th className="px-3 py-2 text-left font-medium">URL</th>
                    <th className="px-3 py-2 text-left font-medium">Fecha</th>
                    <th className="px-3 py-2 text-left font-medium">Por</th>
                    <th className="px-3 py-2 text-center font-medium">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((a) => (
                    <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium">
                        <Link href={`/auditorias/${a.id}`} className="hover:text-marca-700">
                          {clientePorId.get(a.cliente_id)?.nombre ?? "—"}
                        </Link>
                      </td>
                      <td className="max-w-[16rem] truncate px-3 py-2 text-slate-500">
                        <Link href={`/auditorias/${a.id}`}>{a.url.replace(/^https?:\/\//, "")}</Link>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{formatoFechaHora(a.created_at)}</td>
                      <td className="px-3 py-2 text-slate-500">{(a.creado_por && miembroPorId.get(a.creado_por)?.nombre.split(" ")[0]) || "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {a.estado === "lista" ? (
                          <Calificacion puntaje={a.puntaje} calificacion={a.calificacion} />
                        ) : a.estado === "error" || estaAbandonada(a) ? (
                          <span className="text-xs text-red-600" title={a.error ?? "Se interrumpió"}>
                            Falló
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <LoaderCircle size={12} className="animate-spin" /> En proceso
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!cargando && filas.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400">
                        Aún no hay auditorías.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
