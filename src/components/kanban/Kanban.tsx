"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { CalendarDays, CheckSquare, FileText } from "lucide-react";
import { useDatos } from "@/components/datos/DatosProvider";
import Avatar from "@/components/ui/Avatar";
import { COLOR_ESTATUS, COLOR_PRIORIDAD, estaVencida, formatoFecha } from "@/lib/ui";
import { ESTATUS, type Estatus, type Tarea } from "@/types/db";

type Columnas = Record<Estatus, string[]>;
const idColumna = (e: Estatus) => `col:${e}`;
const esColumna = (id: string) => id.startsWith("col:");

export default function Kanban({ tareas }: { tareas: Tarea[] }) {
  const { actualizarTarea, cargando } = useDatos();
  const porId = useMemo(() => new Map(tareas.map((t) => [t.id, t])), [tareas]);

  const derivadas = useMemo(() => {
    const cols = Object.fromEntries(ESTATUS.map((e) => [e, [] as string[]])) as Columnas;
    [...tareas].sort((a, b) => a.posicion - b.posicion).forEach((t) => cols[t.estatus].push(t.id));
    return cols;
  }, [tareas]);

  // Mientras se arrastra usamos una copia local para mover tarjetas entre columnas con fluidez.
  const [arrastre, setArrastre] = useState<Columnas | null>(null);
  const [activoId, setActivoId] = useState<string | null>(null);
  const columnas = arrastre ?? derivadas;

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columnaDe = (id: string, cols: Columnas): Estatus | undefined => {
    if (esColumna(id)) return id.slice(4) as Estatus;
    return ESTATUS.find((e) => cols[e].includes(id));
  };

  function alIniciar(e: DragStartEvent) {
    setActivoId(String(e.active.id));
    setArrastre(derivadas);
  }

  function alPasar({ active, over }: DragOverEvent) {
    if (!over || !arrastre) return;
    const idA = String(active.id);
    const idO = String(over.id);
    const desde = columnaDe(idA, arrastre);
    const hacia = columnaDe(idO, arrastre);
    if (!desde || !hacia || desde === hacia) return;

    setArrastre((prev) => {
      if (!prev) return prev;
      const origen = prev[desde].filter((x) => x !== idA);
      const destino = [...prev[hacia]];
      const indice = esColumna(idO) ? destino.length : Math.max(0, destino.indexOf(idO));
      destino.splice(indice, 0, idA);
      return { ...prev, [desde]: origen, [hacia]: destino };
    });
  }

  function alSoltar({ active, over }: DragEndEvent) {
    const idA = String(active.id);
    const cols = arrastre;
    setActivoId(null);
    if (!over || !cols) {
      setArrastre(null);
      return;
    }
    const col = columnaDe(idA, cols)!;
    let lista = cols[col];
    const idO = String(over.id);
    if (!esColumna(idO) && lista.includes(idO)) {
      lista = arrayMove(lista, lista.indexOf(idA), lista.indexOf(idO));
    }
    const i = lista.indexOf(idA);
    const antes = i > 0 ? porId.get(lista[i - 1])?.posicion : undefined;
    const despues = i < lista.length - 1 ? porId.get(lista[i + 1])?.posicion : undefined;
    let posicion: number;
    if (antes !== undefined && despues !== undefined) posicion = (antes + despues) / 2;
    else if (antes !== undefined) posicion = antes + 1;
    else if (despues !== undefined) posicion = despues - 1;
    else posicion = Date.now() / 1000;

    const tarea = porId.get(idA);
    setArrastre(null);
    if (tarea && (tarea.estatus !== col || tarea.posicion !== posicion)) {
      actualizarTarea(idA, { estatus: col, posicion });
    }
  }

  if (cargando) return <div className="p-8 text-sm text-slate-500">Cargando tareas…</div>;

  const activa = activoId ? porId.get(activoId) : null;

  return (
    <DndContext
      sensors={sensores}
      collisionDetection={closestCorners}
      onDragStart={alIniciar}
      onDragOver={alPasar}
      onDragEnd={alSoltar}
      onDragCancel={() => {
        setArrastre(null);
        setActivoId(null);
      }}
    >
      <div className="flex min-h-[calc(100vh-130px)] gap-3 overflow-x-auto p-4 md:p-6">
        {ESTATUS.map((e) => (
          <Columna key={e} estatus={e} ids={columnas[e]} porId={porId} />
        ))}
      </div>
      <DragOverlay>{activa ? <Tarjeta tarea={activa} flotando /> : null}</DragOverlay>
    </DndContext>
  );
}

function Columna({ estatus, ids, porId }: { estatus: Estatus; ids: string[]; porId: Map<string, Tarea> }) {
  const { setNodeRef, isOver } = useDroppable({ id: idColumna(estatus) });
  return (
    <div className="flex w-64 min-w-64 flex-1 flex-col rounded-xl bg-slate-100/80">
      <div
        className="flex items-center justify-between rounded-t-xl px-3 py-2 text-sm font-semibold text-white"
        style={{ backgroundColor: COLOR_ESTATUS[estatus] }}
      >
        <span className="truncate">{estatus}</span>
        <span className="rounded-full bg-white/25 px-2 text-xs">{ids.length}</span>
      </div>
      <SortableContext id={idColumna(estatus)} items={ids} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={clsx("flex flex-1 flex-col gap-2 p-2 transition", isOver && "bg-marca-50")}
        >
          {ids.map((id) => {
            const t = porId.get(id);
            return t ? <TarjetaOrdenable key={id} tarea={t} /> : null;
          })}
          {ids.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">
              Suelta aquí
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function TarjetaOrdenable({ tarea }: { tarea: Tarea }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tarea.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(isDragging && "opacity-30")}
      {...attributes}
      {...listeners}
    >
      <Tarjeta tarea={tarea} />
    </div>
  );
}

function Tarjeta({ tarea: t, flotando }: { tarea: Tarea; flotando?: boolean }) {
  const { abrirTarea, clientePorId, miembroPorId } = useDatos();
  const responsable = t.responsable_id ? miembroPorId.get(t.responsable_id) : null;
  const vencida = estaVencida(t);
  return (
    <div
      onClick={() => abrirTarea(t.id)}
      className={clsx(
        "cursor-grab rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm hover:border-marca-500 active:cursor-grabbing",
        flotando && "rotate-2 shadow-xl",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-xs text-slate-500">{clientePorId.get(t.cliente_id)?.nombre}</span>
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
          style={{ backgroundColor: COLOR_PRIORIDAD[t.prioridad] }}
        >
          {t.prioridad}
        </span>
      </div>
      <div className="mb-2 font-medium leading-snug">{t.titulo}</div>
      {t.proyecto && (
        <div className="mb-2 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
          {t.proyecto}
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Avatar nombre={responsable?.nombre} tam={22} />
        {t.fecha_entrega && (
          <span className={clsx("flex items-center gap-1", vencida && "font-semibold text-red-600")}>
            <CalendarDays size={13} /> {formatoFecha(t.fecha_entrega)}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {t.documento_url && <FileText size={13} />}
          {t.qa && (
            <span className="flex items-center gap-0.5" title="Requiere QA">
              <CheckSquare size={13} /> QA
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
