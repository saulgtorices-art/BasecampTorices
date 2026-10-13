"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronRight, ExternalLink, Maximize2, Plus, Trash2 } from "lucide-react";
import { useDatos } from "@/components/datos/DatosProvider";
import EtiquetaSelect from "@/components/ui/EtiquetaSelect";
import SelectorMiembro from "@/components/ui/SelectorMiembro";
import { CeldaFecha, CeldaTexto } from "@/components/ui/Celdas";
import { COLOR_ESTATUS, COLOR_PRIORIDAD, colorGrupo, estaVencida, formatoFecha } from "@/lib/ui";
import { ESTATUS, PRIORIDADES, type Tarea, type TareaEditable } from "@/types/db";

export type Agrupacion = "cliente" | "responsable";

interface Grupo {
  clave: string;
  titulo: string;
  color: string;
  tareas: Tarea[];
  /** Valores que hereda una tarea nueva creada en este grupo. */
  base: TareaEditable;
}

const SIN_ASIGNAR = "__sin_asignar__";
const SIN_BASE: TareaEditable = {};

export default function TablaTareas({
  tareas,
  agruparPor = "cliente",
  mostrarGruposVacios = false,
  baseNueva = SIN_BASE,
}: {
  tareas: Tarea[];
  agruparPor?: Agrupacion;
  mostrarGruposVacios?: boolean;
  baseNueva?: TareaEditable;
}) {
  const { clientes, miembros, clientePorId, cargando } = useDatos();
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());

  const grupos = useMemo<Grupo[]>(() => {
    const mapa = new Map<string, Tarea[]>();
    for (const t of tareas) {
      const k = agruparPor === "cliente" ? t.cliente_id : (t.responsable_id ?? SIN_ASIGNAR);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k)!.push(t);
    }
    const lista: Grupo[] = [];
    if (agruparPor === "cliente") {
      for (const c of clientes) {
        const ts = mapa.get(c.id);
        if (!ts && !(mostrarGruposVacios && c.activo)) continue;
        lista.push({
          clave: c.id,
          titulo: c.nombre,
          color: colorGrupo(c.nombre),
          tareas: ts ?? [],
          base: { ...baseNueva, cliente_id: c.id },
        });
      }
    } else {
      for (const m of miembros) {
        const ts = mapa.get(m.id);
        if (!ts && !(mostrarGruposVacios && m.activo)) continue;
        lista.push({
          clave: m.id,
          titulo: m.nombre,
          color: colorGrupo(m.nombre),
          tareas: ts ?? [],
          base: { ...baseNueva, responsable_id: m.id },
        });
      }
      const sin = mapa.get(SIN_ASIGNAR);
      if (sin)
        lista.push({
          clave: SIN_ASIGNAR,
          titulo: "Sin asignar",
          color: "#94a3b8",
          tareas: sin,
          base: { ...baseNueva, responsable_id: null },
        });
    }
    for (const g of lista) g.tareas.sort((a, b) => a.posicion - b.posicion);
    return lista;
  }, [tareas, agruparPor, clientes, miembros, mostrarGruposVacios, baseNueva]);

  if (cargando) return <div className="p-8 text-sm text-slate-500">Cargando tareas…</div>;

  if (grupos.length === 0)
    return (
      <div className="m-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        No hay tareas que coincidan.
        {clientePorId.size === 0 && " Empieza agregando un cliente en Catálogos → Clientes."}
      </div>
    );

  const alternar = (k: string) =>
    setColapsados((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {grupos.map((g) => (
        <GrupoTabla
          key={g.clave}
          grupo={g}
          agruparPor={agruparPor}
          colapsado={colapsados.has(g.clave)}
          onAlternar={() => alternar(g.clave)}
        />
      ))}
    </div>
  );
}

const COLUMNAS: { clave: string; texto: string; ancho: number }[] = [
  { clave: "titulo", texto: "Tarea", ancho: 340 },
  { clave: "grupo2", texto: "", ancho: 150 },
  { clave: "estatus", texto: "Estatus", ancho: 170 },
  { clave: "prioridad", texto: "Prioridad", ancho: 110 },
  { clave: "qa", texto: "QA", ancho: 50 },
  { clave: "inicio", texto: "Inicio", ancho: 130 },
  { clave: "entrega", texto: "Entrega", ancho: 130 },
  { clave: "cierre", texto: "Cierre", ancho: 90 },
  { clave: "proyecto", texto: "Proyecto", ancho: 150 },
  { clave: "doc", texto: "Doc", ancho: 60 },
  { clave: "comentarios", texto: "Comentarios", ancho: 260 },
];

function GrupoTabla({
  grupo,
  agruparPor,
  colapsado,
  onAlternar,
}: {
  grupo: Grupo;
  agruparPor: Agrupacion;
  colapsado: boolean;
  onAlternar: () => void;
}) {
  const terminadas = grupo.tareas.filter((t) => t.estatus === "Terminado").length;
  const columnas = COLUMNAS.map((c) =>
    c.clave === "grupo2" ? { ...c, texto: agruparPor === "cliente" ? "Responsable" : "Cliente" } : c,
  );
  const anchoTotal = 36 + columnas.reduce((s, c) => s + c.ancho, 0);

  return (
    <section>
      <button
        onClick={onAlternar}
        className="mb-2 flex items-center gap-2 text-left"
        style={{ color: grupo.color }}
      >
        {colapsado ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
        <h2 className="text-base font-semibold">{grupo.titulo}</h2>
        <span className="text-xs font-normal text-slate-400">
          {grupo.tareas.length} tareas · {terminadas} terminadas
        </span>
      </button>

      {!colapsado && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="table-fixed border-collapse text-sm" style={{ width: anchoTotal }}>
            <colgroup>
              <col style={{ width: 36 }} />
              {columnas.map((c) => (
                <col key={c.clave} style={{ width: c.ancho }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th style={{ borderLeft: `6px solid ${grupo.color}` }} />
                {columnas.map((c) => (
                  <th key={c.clave} className="border-l border-slate-100 px-2 py-2 text-center font-medium first:text-left">
                    {c.texto}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupo.tareas.map((t) => (
                <FilaTarea key={t.id} tarea={t} color={grupo.color} agruparPor={agruparPor} />
              ))}
              <FilaAgregar grupo={grupo} agruparPor={agruparPor} columnas={columnas.length} />
            </tbody>
          </table>
          <BarraEstatus tareas={grupo.tareas} />
        </div>
      )}
    </section>
  );
}

function FilaTarea({ tarea: t, color, agruparPor }: { tarea: Tarea; color: string; agruparPor: Agrupacion }) {
  const { actualizarTarea, borrarTarea, abrirTarea, clientes, esAdmin, tareaAbiertaId } = useDatos();
  const guardar = (cambios: TareaEditable) => actualizarTarea(t.id, cambios);
  const vencida = estaVencida(t);

  return (
    <tr
      className={clsx(
        "group border-b border-slate-100 hover:bg-slate-50",
        tareaAbiertaId === t.id && "bg-marca-50/60",
      )}
    >
      <td style={{ borderLeft: `6px solid ${color}` }} className="text-center">
        {esAdmin && (
          <button
            title="Borrar tarea"
            onClick={() => {
              if (confirm(`¿Borrar la tarea "${t.titulo}"?`)) borrarTarea(t.id);
            }}
            className="invisible text-slate-400 group-hover:visible hover:text-red-600"
          >
            <Trash2 size={14} />
          </button>
        )}
      </td>
      <td className="border-l border-slate-100">
        <div className="flex items-center pr-1">
          <CeldaTexto valor={t.titulo} requerido onGuardar={(v) => v && guardar({ titulo: v })} />
          <button
            title="Abrir detalle"
            onClick={() => abrirTarea(t.id)}
            className="ml-1 flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-200 hover:text-slate-700"
          >
            <Maximize2 size={13} /> Abrir
          </button>
        </div>
      </td>
      <td className="border-l border-slate-100">
        {agruparPor === "cliente" ? (
          <SelectorMiembro valor={t.responsable_id} onCambiar={(v) => guardar({ responsable_id: v })} />
        ) : (
          <select
            value={t.cliente_id}
            onChange={(e) => guardar({ cliente_id: e.target.value })}
            className="celda-input text-sm"
          >
            {clientes
              .filter((c) => c.activo || c.id === t.cliente_id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
          </select>
        )}
      </td>
      <td className="h-9 border-l border-white p-0">
        <EtiquetaSelect
          valor={t.estatus}
          opciones={ESTATUS}
          colores={COLOR_ESTATUS}
          onCambiar={(v) => guardar({ estatus: v })}
        />
      </td>
      <td className="h-9 border-l border-white p-0">
        <EtiquetaSelect
          valor={t.prioridad}
          opciones={PRIORIDADES}
          colores={COLOR_PRIORIDAD}
          onCambiar={(v) => guardar({ prioridad: v })}
        />
      </td>
      <td className="border-l border-slate-100 text-center">
        <input
          type="checkbox"
          checked={t.qa}
          onChange={(e) => guardar({ qa: e.target.checked })}
          className="h-4 w-4 accent-marca-600"
        />
      </td>
      <td className="border-l border-slate-100">
        <CeldaFecha valor={t.fecha_inicio} onGuardar={(v) => guardar({ fecha_inicio: v })} />
      </td>
      <td className="border-l border-slate-100">
        <CeldaFecha valor={t.fecha_entrega} alerta={vencida} onGuardar={(v) => guardar({ fecha_entrega: v })} />
      </td>
      <td className="border-l border-slate-100 px-2 text-center text-xs text-slate-500">
        {formatoFecha(t.fecha_cierre)}
      </td>
      <td className="border-l border-slate-100">
        <CeldaTexto
          valor={t.proyecto}
          lista="lista-proyectos"
          placeholder="—"
          onGuardar={(v) => guardar({ proyecto: v })}
        />
      </td>
      <td className="border-l border-slate-100 text-center">
        {t.documento_url ? (
          <a
            href={t.documento_url}
            target="_blank"
            rel="noreferrer"
            title={t.documento_url}
            className="inline-flex text-marca-600 hover:text-marca-700"
          >
            <ExternalLink size={15} />
          </a>
        ) : (
          <button onClick={() => abrirTarea(t.id)} className="text-xs text-slate-300 hover:text-slate-500">
            +
          </button>
        )}
      </td>
      <td className="border-l border-slate-100">
        <CeldaTexto valor={t.comentarios} placeholder="—" onGuardar={(v) => guardar({ comentarios: v })} />
      </td>
    </tr>
  );
}

function FilaAgregar({
  grupo,
  agruparPor,
  columnas,
}: {
  grupo: Grupo;
  agruparPor: Agrupacion;
  columnas: number;
}) {
  const { crearTarea, clientes } = useDatos();
  const [titulo, setTitulo] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [guardando, setGuardando] = useState(false);

  const clienteFinal = grupo.base.cliente_id ?? clienteId;

  async function crear() {
    const limpio = titulo.trim();
    if (!limpio || !clienteFinal || guardando) return;
    setGuardando(true);
    const ok = await crearTarea({ ...grupo.base, cliente_id: clienteFinal, titulo: limpio });
    setGuardando(false);
    if (ok) setTitulo("");
  }

  return (
    <tr className="border-b border-slate-100">
      <td style={{ borderLeft: `6px solid ${grupo.color}`, opacity: 0.5 }} />
      <td colSpan={columnas} className="px-1 py-1">
        <div className="flex items-center gap-2">
          <Plus size={15} className="ml-1 text-slate-400" />
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && crear()}
            placeholder="Agregar tarea (Enter para guardar)"
            className="celda-input max-w-sm text-sm"
            disabled={guardando}
          />
          {agruparPor === "responsable" && !grupo.base.cliente_id && (
            <select
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              className="campo w-48 py-1"
            >
              <option value="">Cliente…</option>
              {clientes
                .filter((c) => c.activo)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
            </select>
          )}
          {titulo.trim() && (
            <button onClick={crear} disabled={!clienteFinal || guardando} className="btn-primario py-1">
              Agregar
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

/** Barra de distribución de estatus del grupo (como el resumen de Monday). */
function BarraEstatus({ tareas }: { tareas: Tarea[] }) {
  if (tareas.length === 0) return null;
  return (
    <div className="flex h-2 w-full overflow-hidden">
      {ESTATUS.map((e) => {
        const n = tareas.filter((t) => t.estatus === e).length;
        if (!n) return null;
        return (
          <div
            key={e}
            title={`${e}: ${n}`}
            style={{ width: `${(n / tareas.length) * 100}%`, backgroundColor: COLOR_ESTATUS[e] }}
          />
        );
      })}
    </div>
  );
}
