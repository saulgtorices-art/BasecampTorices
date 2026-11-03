"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  History,
  Undo2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useDatos } from "@/components/datos/DatosProvider";
import Portal from "@/components/ui/Portal";
import { formatoFecha, formatoFechaHora } from "@/lib/ui";
import {
  CAMPOS,
  NOMBRE_CAMPO,
  detectarEncabezado,
  leerCSV,
  mapeoInicial,
  normalizar,
  plantillaCSV,
  prepararFilas,
  textoCelda,
  type Campo,
  type Celda,
  type Mapeo,
} from "@/lib/importacion";

interface Hoja {
  nombre: string;
  filas: Celda[][];
}

interface Lote {
  id: string;
  archivo: string | null;
  creado_por: string | null;
  filas_total: number;
  filas_ok: number;
  created_at: string;
  deshecha_at: string | null;
}

/** Botón + modal de carga masiva desde Excel / CSV / pegar desde Excel. Solo líderes (admin). */
export default function ImportarTareas() {
  const { esAdmin } = useDatos();
  const [abierto, setAbierto] = useState(false);
  if (!esAdmin) return null;
  return (
    <>
      <button className="btn-secundario" onClick={() => setAbierto(true)} title="Cargar tareas desde Excel">
        <Upload size={16} /> Carga masiva
      </button>
      {abierto && <Modal onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function Modal({ onCerrar }: { onCerrar: () => void }) {
  const supabase = supabaseNavegador();
  const { clientes, miembros, tareas, clientePorId, miembroPorId, avisar } = useDatos();

  const [archivo, setArchivo] = useState<string>("");
  const [hojas, setHojas] = useState<Hoja[]>([]);
  const [hojaSel, setHojaSel] = useState(0);
  const [filaEncabezado, setFilaEncabezado] = useState(0);
  const [mapeo, setMapeo] = useState<Mapeo>([]);
  const [clientePorDefecto, setClientePorDefecto] = useState("");
  const [crearClientes, setCrearClientes] = useState(true);
  const [pegado, setPegado] = useState("");
  const [modoPegar, setModoPegar] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ lote: string; creadas: number; clientes_nuevos: number } | null>(null);
  const [verSolo, setVerSolo] = useState<"todas" | "problemas">("todas");

  const hoja = hojas[hojaSel];

  // ---------------------------------------------------------------- lectura
  const elegirHoja = useCallback(
    (lista: Hoja[], i: number) => {
      const h = lista[i];
      if (!h) return;
      const enc = Math.max(0, detectarEncabezado(h.filas));
      setHojaSel(i);
      setFilaEncabezado(enc);
      setMapeo(mapeoInicial(h.filas[enc] ?? []));
      // Si la hoja se llama como un cliente, se usa de cliente por defecto.
      const c = clientes.find((x) => normalizar(x.nombre) === normalizar(h.nombre));
      setClientePorDefecto(c?.nombre ?? "");
    },
    [clientes],
  );

  const cargarHojas = useCallback(
    (nombre: string, lista: Hoja[]) => {
      const utiles = lista.filter((h) => h.filas.some((f) => f.some((c) => textoCelda(c) !== "")));
      if (!utiles.length) {
        avisar("El archivo está vacío.");
        return;
      }
      setArchivo(nombre);
      setHojas(utiles);
      setResultado(null);
      // Empieza en la primera hoja que tenga encabezado reconocible.
      const conEncabezado = utiles.findIndex((h) => detectarEncabezado(h.filas) >= 0);
      elegirHoja(utiles, Math.max(0, conEncabezado));
    },
    [avisar, elegirHoja],
  );

  async function leerArchivo(f: File) {
    setLeyendo(true);
    try {
      if (/\.(csv|tsv|txt)$/i.test(f.name)) {
        cargarHojas(f.name, [{ nombre: f.name.replace(/\.\w+$/, ""), filas: leerCSV(await f.text()) }]);
      } else if (/\.xlsx$/i.test(f.name)) {
        const { default: leerXlsx } = await import("read-excel-file/browser");
        const libro = await leerXlsx(f);
        cargarHojas(
          f.name,
          libro.map((h) => ({ nombre: h.sheet, filas: h.data as unknown as Celda[][] })),
        );
      } else {
        avisar("Usa un archivo .xlsx o .csv (si es .xls viejo, ábrelo y guárdalo como .xlsx).");
      }
    } catch (e) {
      avisar(`No se pudo leer el archivo: ${(e as Error).message}`);
    } finally {
      setLeyendo(false);
    }
  }

  function usarPegado() {
    const filas = leerCSV(pegado);
    if (!filas.length) return;
    setModoPegar(false);
    cargarHojas("Pegado desde Excel", [{ nombre: "Pegado", filas }]);
  }

  function descargarPlantilla() {
    const url = URL.createObjectURL(new Blob([plantillaCSV()], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-tareas.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // -------------------------------------------------------------- previa
  const encabezado = useMemo(() => hoja?.filas[filaEncabezado] ?? [], [hoja, filaEncabezado]);
  const tieneCliente = mapeo.includes("cliente");

  const previa = useMemo(() => {
    if (!hoja) return [];
    return prepararFilas(hoja.filas, filaEncabezado + 1, mapeo, {
      clientes,
      miembros: miembros.map((m) => ({ id: m.id, nombre: m.nombre, alias: m.alias ?? [], activo: m.activo })),
      existentes: tareas.map((t) => ({ cliente: clientePorId.get(t.cliente_id)?.nombre ?? "", titulo: t.titulo })),
      clientePorDefecto,
      crearClientes,
    });
  }, [hoja, filaEncabezado, mapeo, clientes, miembros, tareas, clientePorId, clientePorDefecto, crearClientes]);

  const validas = previa.filter((f) => !f.errores.length);
  const conErrores = previa.length - validas.length;
  const conAvisos = validas.filter((f) => f.avisos.length).length;
  const clientesNuevos = [...new Set(validas.filter((f) => f.clienteNuevo).map((f) => f.datos.cliente))];
  const visibles = verSolo === "todas" ? previa : previa.filter((f) => f.errores.length || f.avisos.length);

  function cambiarMapeo(i: number, campo: Campo | null) {
    setMapeo((m) => m.map((c, j) => (j === i ? campo : c === campo && campo ? null : c)));
  }

  async function importar() {
    if (!validas.length) return;
    setImportando(true);
    const { data, error } = await supabase.rpc("importar_tareas", {
      p_archivo: hoja && hojas.length > 1 ? `${archivo} · ${hoja.nombre}` : archivo,
      p_filas: validas.map((f) => f.datos),
      p_crear_clientes: crearClientes,
      p_errores: previa
        .filter((f) => f.errores.length)
        .map((f) => ({ renglon: f.renglon, errores: f.errores })),
      p_filas_total: previa.length,
    });
    setImportando(false);
    if (error) {
      avisar(error.message);
      return;
    }
    setResultado(data as { lote: string; creadas: number; clientes_nuevos: number });
    avisar(`Se crearon ${(data as { creadas: number }).creadas} tareas`, "ok");
  }

  // ------------------------------------------------------------- historial
  const [lotes, setLotes] = useState<Lote[]>([]);
  const cargarLotes = useCallback(async () => {
    const { data } = await supabase
      .from("importaciones")
      .select("id, archivo, creado_por, filas_total, filas_ok, created_at, deshecha_at")
      .order("created_at", { ascending: false })
      .limit(8);
    setLotes((data as Lote[]) ?? []);
  }, [supabase]);
  useEffect(() => {
    cargarLotes();
  }, [cargarLotes, resultado]);

  async function deshacer(lote: Lote | { id: string; archivo: string | null }) {
    const suyas = tareas.filter((t) => t.import_lote_id === lote.id);
    const tocadas = suyas.filter(
      (t) => new Date(t.updated_at).getTime() - new Date(t.created_at).getTime() > 60_000,
    ).length;
    const msg =
      `¿Deshacer la carga "${lote.archivo ?? "sin nombre"}"? Se borrarán ${suyas.length} tareas` +
      (tocadas ? `.\n\nOjo: ${tocadas} ya fueron modificadas después de cargarse y también se borrarán.` : ".") +
      "\n\nNo pasan por la papelera.";
    if (!confirm(msg)) return;
    const { data, error } = await supabase.rpc("deshacer_importacion", { p_lote: lote.id });
    if (error) {
      avisar(error.message);
      return;
    }
    avisar(`Carga deshecha: se borraron ${data} tareas`, "ok");
    if (resultado?.lote === lote.id) setResultado(null);
    cargarLotes();
  }

  // ------------------------------------------------------------------ vista
  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/30 p-2 pt-[4vh] md:p-4">
        <div
          className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
          onKeyDown={(e) => e.key === "Escape" && onCerrar()}
        >
          <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
            <FileSpreadsheet size={20} className="text-marca-600" />
            <div className="mr-auto">
              <h2 className="text-base font-semibold">Carga masiva de tareas</h2>
              <p className="text-xs text-slate-500">
                {archivo ? archivo : "Sube tu Excel (.xlsx), un CSV o pega las celdas directamente desde Excel."}
              </p>
            </div>
            <button onClick={onCerrar} className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X size={18} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-5">
            {resultado ? (
              <div className="mx-auto max-w-md py-10 text-center">
                <CheckCircle2 size={40} className="mx-auto mb-3 text-green-600" />
                <p className="text-lg font-semibold">Se crearon {resultado.creadas} tareas</p>
                {resultado.clientes_nuevos > 0 && (
                  <p className="text-sm text-slate-500">y {resultado.clientes_nuevos} clientes nuevos</p>
                )}
                <p className="mt-2 text-sm text-slate-500">
                  A cada responsable le llegó un solo aviso con sus tareas nuevas.
                </p>
                <div className="mt-6 flex justify-center gap-2">
                  <button className="btn-secundario" onClick={() => deshacer({ id: resultado.lote, archivo })}>
                    <Undo2 size={15} /> Deshacer esta carga
                  </button>
                  <button className="btn-primario" onClick={onCerrar}>
                    Listo
                  </button>
                </div>
              </div>
            ) : !hoja ? (
              <Inicio
                leyendo={leyendo}
                modoPegar={modoPegar}
                pegado={pegado}
                setPegado={setPegado}
                setModoPegar={setModoPegar}
                onArchivo={leerArchivo}
                onPegar={usarPegado}
                onPlantilla={descargarPlantilla}
              />
            ) : (
              <div className="flex flex-col gap-4">
                {/* Configuración */}
                <div className="flex flex-wrap items-end gap-4">
                  {hojas.length > 1 && (
                    <div>
                      <label className="etiqueta">Hoja</label>
                      <select value={hojaSel} onChange={(e) => elegirHoja(hojas, +e.target.value)} className="campo w-48">
                        {hojas.map((h, i) => (
                          <option key={i} value={i}>
                            {h.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="etiqueta">Fila de encabezados</label>
                    <select
                      value={filaEncabezado}
                      onChange={(e) => {
                        const i = +e.target.value;
                        setFilaEncabezado(i);
                        setMapeo(mapeoInicial(hoja.filas[i] ?? []));
                      }}
                      className="campo w-32"
                    >
                      {hoja.filas.slice(0, 25).map((_, i) => (
                        <option key={i} value={i}>
                          Fila {i + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="etiqueta">
                      {tieneCliente ? "Cliente si la celda está vacía" : "Cliente para todas las filas *"}
                    </label>
                    <input
                      list="importar-clientes"
                      value={clientePorDefecto}
                      onChange={(e) => setClientePorDefecto(e.target.value)}
                      placeholder="Escribe o elige…"
                      className="campo w-56"
                    />
                    <datalist id="importar-clientes">
                      {clientes
                        .filter((c) => c.activo)
                        .map((c) => (
                          <option key={c.id} value={c.nombre} />
                        ))}
                    </datalist>
                  </div>
                  <label className="flex items-center gap-2 pb-2 text-sm">
                    <input
                      type="checkbox"
                      checked={crearClientes}
                      onChange={(e) => setCrearClientes(e.target.checked)}
                      className="h-4 w-4 accent-marca-600"
                    />
                    Crear los clientes que no existan
                  </label>
                  <button
                    className="ml-auto pb-2 text-xs text-slate-500 hover:text-slate-800 hover:underline"
                    onClick={() => {
                      setHojas([]);
                      setArchivo("");
                    }}
                  >
                    Elegir otro archivo
                  </button>
                </div>

                {/* Mapeo de columnas */}
                <div>
                  <p className="etiqueta">Columnas del archivo → campo en el tablero</p>
                  <div className="flex flex-wrap gap-2">
                    {encabezado.map((c, i) => {
                      const t = textoCelda(c);
                      if (!t && !mapeo[i]) return null;
                      return (
                        <label
                          key={i}
                          className={clsx(
                            "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs",
                            mapeo[i] ? "border-marca-200 bg-marca-50" : "border-slate-200 bg-slate-50 text-slate-400",
                          )}
                        >
                          <span className="max-w-40 truncate font-medium" title={t}>
                            {t || `Columna ${i + 1}`}
                          </span>
                          <span>→</span>
                          <select
                            value={mapeo[i] ?? ""}
                            onChange={(e) => cambiarMapeo(i, (e.target.value || null) as Campo | null)}
                            className="rounded bg-transparent py-0.5 text-xs outline-none"
                          >
                            <option value="">Ignorar</option>
                            {CAMPOS.map((k) => (
                              <option key={k} value={k}>
                                {NOMBRE_CAMPO[k]}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                  {!mapeo.includes("titulo") && (
                    <p className="mt-2 text-xs text-red-600">Indica qué columna es la Tarea.</p>
                  )}
                </div>

                {/* Resumen */}
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="flex items-center gap-1 text-green-700">
                    <CheckCircle2 size={15} /> {validas.length} listas
                  </span>
                  {conAvisos > 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertTriangle size={15} /> {conAvisos} con avisos
                    </span>
                  )}
                  {conErrores > 0 && (
                    <span className="flex items-center gap-1 text-red-600">
                      <XCircle size={15} /> {conErrores} con errores (no se cargan)
                    </span>
                  )}
                  {clientesNuevos.length > 0 && (
                    <span className="text-xs text-slate-500">
                      Clientes nuevos: {clientesNuevos.slice(0, 5).join(", ")}
                      {clientesNuevos.length > 5 && ` y ${clientesNuevos.length - 5} más`}
                    </span>
                  )}
                  <select
                    value={verSolo}
                    onChange={(e) => setVerSolo(e.target.value as typeof verSolo)}
                    className="campo ml-auto w-44 py-1 text-xs"
                  >
                    <option value="todas">Ver todas las filas</option>
                    <option value="problemas">Solo con avisos o errores</option>
                  </select>
                </div>

                {/* Vista previa */}
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[900px] text-xs">
                    <thead className="bg-slate-50 text-left text-slate-500">
                      <tr>
                        <th className="px-2 py-2">Fila</th>
                        <th className="px-2 py-2">Cliente</th>
                        <th className="px-2 py-2">Tarea</th>
                        <th className="px-2 py-2">Responsable</th>
                        <th className="px-2 py-2">Estatus</th>
                        <th className="px-2 py-2">Prioridad</th>
                        <th className="px-2 py-2">Entrega</th>
                        <th className="px-2 py-2">Revisión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.slice(0, 300).map((f) => (
                        <tr
                          key={f.renglon}
                          className={clsx(
                            "border-t border-slate-100 align-top",
                            f.errores.length ? "bg-red-50/60 text-slate-400" : f.avisos.length && "bg-amber-50/50",
                          )}
                        >
                          <td className="px-2 py-1.5 text-slate-400">{f.renglon}</td>
                          <td className="px-2 py-1.5">
                            {f.datos.cliente || "—"}
                            {f.clienteNuevo && (
                              <span className="ml-1 rounded bg-marca-100 px-1 text-[10px] text-marca-700">nuevo</span>
                            )}
                          </td>
                          <td className="max-w-72 px-2 py-1.5 font-medium text-slate-800">{f.datos.titulo || "—"}</td>
                          <td className="px-2 py-1.5">
                            {f.datos.responsable_id ? miembroPorId.get(f.datos.responsable_id)?.nombre : "—"}
                          </td>
                          <td className="px-2 py-1.5">{f.datos.estatus}</td>
                          <td className="px-2 py-1.5">{f.datos.prioridad}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{formatoFecha(f.datos.fecha_entrega) || "—"}</td>
                          <td className="px-2 py-1.5">
                            {f.errores.map((e) => (
                              <div key={e} className="text-red-600">
                                {e}
                              </div>
                            ))}
                            {f.avisos.map((a) => (
                              <div key={a} className="text-amber-700">
                                {a}
                              </div>
                            ))}
                          </td>
                        </tr>
                      ))}
                      {visibles.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-2 py-8 text-center text-slate-400">
                            {previa.length ? "Todo en orden." : "No hay filas debajo del encabezado."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {visibles.length > 300 && (
                    <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
                      Mostrando 300 de {visibles.length} filas.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Cargas anteriores */}
            {!hoja && !resultado && lotes.length > 0 && (
              <div className="mt-8">
                <p className="etiqueta flex items-center gap-1">
                  <History size={13} /> Cargas anteriores
                </p>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                  {lotes.map((l) => (
                    <li key={l.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className={clsx("truncate", l.deshecha_at && "text-slate-400 line-through")}>
                          {l.archivo ?? "Sin nombre"}
                        </div>
                        <div className="text-xs text-slate-400">
                          {formatoFechaHora(l.created_at)} · {l.filas_ok} de {l.filas_total} filas
                          {l.creado_por && ` · ${miembroPorId.get(l.creado_por)?.nombre ?? ""}`}
                        </div>
                      </div>
                      {l.deshecha_at ? (
                        <span className="text-xs text-slate-400">Deshecha</span>
                      ) : (
                        <button className="btn-secundario py-1 text-xs" onClick={() => deshacer(l)}>
                          <Undo2 size={13} /> Deshacer
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {hoja && !resultado && (
            <footer className="flex items-center gap-2 border-t border-slate-200 px-5 py-3">
              <p className="mr-auto text-xs text-slate-500">
                Todo se carga en un solo lote: si algo sale mal, lo deshaces completo.
              </p>
              <button className="btn-secundario" onClick={onCerrar}>
                Cancelar
              </button>
              <button
                className="btn-primario"
                disabled={importando || !validas.length || !mapeo.includes("titulo")}
                onClick={importar}
              >
                {importando ? "Cargando…" : `Cargar ${validas.length} tareas`}
              </button>
            </footer>
          )}
        </div>
      </div>
    </Portal>
  );
}

function Inicio({
  leyendo,
  modoPegar,
  pegado,
  setPegado,
  setModoPegar,
  onArchivo,
  onPegar,
  onPlantilla,
}: {
  leyendo: boolean;
  modoPegar: boolean;
  pegado: string;
  setPegado: (v: string) => void;
  setModoPegar: (v: boolean) => void;
  onArchivo: (f: File) => void;
  onPegar: () => void;
  onPlantilla: () => void;
}) {
  const [encima, setEncima] = useState(false);

  if (modoPegar)
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">
          En Excel selecciona las celdas <b>incluyendo la fila de encabezados</b>, cópialas (Ctrl+C) y pégalas aquí.
        </p>
        <textarea
          autoFocus
          value={pegado}
          onChange={(e) => setPegado(e.target.value)}
          rows={12}
          className="campo font-mono text-xs"
          placeholder={"Cliente\tTarea\tResponsable\tEstatus\t…"}
        />
        <div className="flex justify-end gap-2">
          <button className="btn-secundario" onClick={() => setModoPegar(false)}>
            Volver
          </button>
          <button className="btn-primario" disabled={!pegado.trim()} onClick={onPegar}>
            Revisar filas
          </button>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault();
          setEncima(false);
          const f = e.dataTransfer.files[0];
          if (f) onArchivo(f);
        }}
        className={clsx(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center",
          encima ? "border-marca-500 bg-marca-50" : "border-slate-300 hover:border-marca-400 hover:bg-slate-50",
        )}
      >
        <Upload size={28} className="text-slate-400" />
        <span className="text-sm font-medium">{leyendo ? "Leyendo…" : "Arrastra tu Excel aquí o haz clic para elegirlo"}</span>
        <span className="text-xs text-slate-500">.xlsx o .csv · se detectan las columnas solas</span>
        <input
          type="file"
          accept=".xlsx,.csv,.tsv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onArchivo(f);
            e.target.value = "";
          }}
        />
      </label>
      <div className="flex flex-wrap justify-center gap-2">
        <button className="btn-secundario" onClick={() => setModoPegar(true)}>
          <ClipboardPaste size={15} /> Pegar desde Excel
        </button>
        <button className="btn-secundario" onClick={onPlantilla}>
          <Download size={15} /> Descargar plantilla
        </button>
      </div>
      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <b>Columnas que se reconocen:</b> Cliente, Tarea, Responsable, Estatus, Prioridad, QA, Fecha de Inicio, Fecha
        de Entrega, Fecha de Cierre, Proyecto, Documento y Comentarios (con o sin acentos, en cualquier orden). El
        responsable se busca por nombre o alias de <i>Equipo</i>; las fechas pueden ser de Excel o dd/mm/aaaa. Si tu
        archivo tiene una hoja por cliente, elige la hoja y el cliente se toma de su nombre.
      </div>
    </div>
  );
}
