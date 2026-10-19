"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import type { Cliente, Miembro, RegistroTiempo, Tarea, TareaEditable } from "@/types/db";

type Aviso = { id: number; texto: string; tipo: "error" | "ok" };

interface Datos {
  yo: Miembro;
  esAdmin: boolean;
  cargando: boolean;
  /** true cuando la suscripción de Realtime está activa. */
  enLinea: boolean;
  clientes: Cliente[];
  miembros: Miembro[];
  tareas: Tarea[];
  clientePorId: Map<string, Cliente>;
  miembroPorId: Map<string, Miembro>;
  proyectos: string[];

  tareaAbiertaId: string | null;
  abrirTarea: (id: string | null) => void;

  crearTarea: (datos: TareaEditable & { cliente_id: string; titulo: string }) => Promise<Tarea | null>;
  actualizarTarea: (id: string, cambios: TareaEditable) => Promise<boolean>;
  borrarTarea: (id: string) => Promise<boolean>;

  guardarCliente: (c: Partial<Cliente> & { nombre: string }) => Promise<boolean>;
  borrarCliente: (id: string) => Promise<boolean>;
  guardarMiembro: (m: Partial<Miembro> & { nombre: string; correo: string }) => Promise<boolean>;
  borrarMiembro: (id: string) => Promise<boolean>;

  /** Temporizador corriendo del usuario actual (si hay). */
  temporizador: RegistroTiempo | null;
  iniciarTemporizador: (tareaId: string) => Promise<void>;
  detenerTemporizador: (nota?: string) => Promise<void>;

  avisar: (texto: string, tipo?: Aviso["tipo"]) => void;
}

const Contexto = createContext<Datos | null>(null);

export function useDatos() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useDatos debe usarse dentro de <DatosProvider>");
  return ctx;
}

function traducirError(mensaje: string) {
  if (mensaje.includes("row-level security")) return "No tienes permiso para esta acción.";
  if (mensaje.includes("clientes_nombre_unico")) return "Ya existe un cliente con ese nombre.";
  if (mensaje.includes("miembros_correo_key")) return "Ya existe un miembro con ese correo.";
  if (mensaje.includes("violates foreign key") && mensaje.includes("tareas"))
    return "No se puede borrar: tiene tareas asociadas.";
  if (mensaje.includes("registros_un_activo")) return "Ya tienes un temporizador corriendo.";
  return mensaje;
}

export function DatosProvider({ yo, children }: { yo: Miembro; children: React.ReactNode }) {
  const supabase = supabaseNavegador();
  const [cargando, setCargando] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [tareaAbiertaId, abrirTarea] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [enLinea, setEnLinea] = useState(false);
  const [temporizador, setTemporizador] = useState<RegistroTiempo | null>(null);
  const contadorAvisos = useRef(0);

  const avisar = useCallback((texto: string, tipo: Aviso["tipo"] = "error") => {
    const id = ++contadorAvisos.current;
    setAvisos((a) => [...a, { id, texto: tipo === "error" ? traducirError(texto) : texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4500);
  }, []);

  // ------------------------------------------------------------------ carga
  const cargar = useCallback(async () => {
    const [c, m, t, r] = await Promise.all([
      supabase.from("clientes").select("*").order("nombre"),
      supabase.from("miembros").select("*").order("nombre"),
      supabase.from("tareas").select("*").order("posicion").limit(10000),
      supabase.from("registros_tiempo").select("*").eq("miembro_id", yo.id).is("fin", null).maybeSingle(),
    ]);
    if (!r.error) setTemporizador((r.data as RegistroTiempo) ?? null);
    if (c.error || m.error || t.error) {
      avisar((c.error ?? m.error ?? t.error)!.message);
    } else {
      setClientes(c.data as Cliente[]);
      setMiembros(m.data as Miembro[]);
      setTareas(t.data as Tarea[]);
    }
    setCargando(false);
  }, [supabase, avisar, yo.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // -------------------------------------------------------------- realtime
  useEffect(() => {
    const upsert = <T extends { id: string }>(lista: T[], fila: T) => {
      const i = lista.findIndex((x) => x.id === fila.id);
      if (i === -1) return [...lista, fila];
      const copia = lista.slice();
      copia[i] = fila;
      return copia;
    };

    const canal = supabase
      .channel("basecamp-datos")
      .on("postgres_changes", { event: "*", schema: "public", table: "tareas" }, (p) => {
        if (p.eventType === "DELETE") {
          const id = (p.old as { id: string }).id;
          setTareas((ts) => ts.filter((t) => t.id !== id));
        } else {
          setTareas((ts) => upsert(ts, p.new as Tarea));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, (p) => {
        if (p.eventType === "DELETE") {
          const id = (p.old as { id: string }).id;
          setClientes((cs) => cs.filter((c) => c.id !== id));
        } else {
          setClientes((cs) =>
            upsert(cs, p.new as Cliente).sort((a, b) => a.nombre.localeCompare(b.nombre)),
          );
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "miembros" }, (p) => {
        if (p.eventType === "DELETE") {
          const id = (p.old as { id: string }).id;
          setMiembros((ms) => ms.filter((m) => m.id !== id));
        } else {
          setMiembros((ms) =>
            upsert(ms, p.new as Miembro).sort((a, b) => a.nombre.localeCompare(b.nombre)),
          );
        }
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registros_tiempo", filter: `miembro_id=eq.${yo.id}` },
        (p) => {
          if (p.eventType === "DELETE") {
            const id = (p.old as { id: string }).id;
            setTemporizador((t) => (t?.id === id ? null : t));
            return;
          }
          const r = p.new as RegistroTiempo;
          setTemporizador((t) => (r.fin === null ? r : t?.id === r.id ? null : t));
        },
      )
      .subscribe((estado) => {
        setEnLinea(estado === "SUBSCRIBED");
        // Al reconectar recargamos para no perder cambios ocurridos sin conexión.
        if (estado === "SUBSCRIBED") cargar();
      });

    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, cargar, yo.id]);

  // ------------------------------------------------------------ temporizador
  const temporizadorRef = useRef(temporizador);
  temporizadorRef.current = temporizador;

  const detenerTemporizador: Datos["detenerTemporizador"] = useCallback(
    async (nota) => {
      const actual = temporizadorRef.current;
      if (!actual) return;
      const cambios: Partial<RegistroTiempo> = { fin: new Date().toISOString() };
      if (nota !== undefined) cambios.nota = nota || null;
      const { error } = await supabase.from("registros_tiempo").update(cambios).eq("id", actual.id);
      if (error) {
        avisar(error.message);
        return;
      }
      setTemporizador(null);
    },
    [supabase, avisar],
  );

  const iniciarTemporizador: Datos["iniciarTemporizador"] = useCallback(
    async (tareaId) => {
      if (temporizadorRef.current) await detenerTemporizador();
      const { data, error } = await supabase
        .from("registros_tiempo")
        .insert({ tarea_id: tareaId, miembro_id: yo.id })
        .select()
        .single();
      if (error) {
        avisar(error.message);
        return;
      }
      setTemporizador(data as RegistroTiempo);
    },
    [supabase, avisar, detenerTemporizador, yo.id],
  );

  // ---------------------------------------------------------------- tareas
  const crearTarea: Datos["crearTarea"] = useCallback(
    async (datos) => {
      const { data, error } = await supabase.from("tareas").insert(datos).select().single();
      if (error) {
        avisar(error.message);
        return null;
      }
      const t = data as Tarea;
      setTareas((ts) => (ts.some((x) => x.id === t.id) ? ts : [...ts, t]));
      return t;
    },
    [supabase, avisar],
  );

  const tareasRef = useRef(tareas);
  tareasRef.current = tareas;

  const actualizarTarea: Datos["actualizarTarea"] = useCallback(
    async (id, cambios) => {
      const anterior = tareasRef.current.find((t) => t.id === id);
      // Optimista
      setTareas((ts) => ts.map((t) => (t.id === id ? { ...t, ...cambios } : t)));
      const { data, error } = await supabase
        .from("tareas")
        .update(cambios)
        .eq("id", id)
        .select()
        .single();
      if (error) {
        if (anterior) setTareas((ts) => ts.map((t) => (t.id === id ? anterior : t)));
        avisar(error.message);
        return false;
      }
      setTareas((ts) => ts.map((t) => (t.id === id ? (data as Tarea) : t)));
      return true;
    },
    [supabase, avisar],
  );

  const borrarTarea: Datos["borrarTarea"] = useCallback(
    async (id) => {
      const { error, count } = await supabase
        .from("tareas")
        .delete({ count: "exact" })
        .eq("id", id);
      if (error || count === 0) {
        avisar(error?.message ?? "No tienes permiso para borrar tareas.");
        return false;
      }
      setTareas((ts) => ts.filter((t) => t.id !== id));
      abrirTarea((actual) => (actual === id ? null : actual));
      // Limpia los archivos adjuntos de la tarea en Storage (sin bloquear).
      // Incluye la carpeta de evidencias de comentarios ({id}/comentarios).
      void (async () => {
        for (const carpeta of [id, `${id}/comentarios`]) {
          const { data } = await supabase.storage.from("adjuntos").list(carpeta, { limit: 1000 });
          const archivos = (data ?? []).filter((f) => f.id);
          if (archivos.length)
            await supabase.storage.from("adjuntos").remove(archivos.map((f) => `${carpeta}/${f.name}`));
        }
      })();
      avisar("Tarea eliminada", "ok");
      return true;
    },
    [supabase, avisar],
  );

  // -------------------------------------------------------------- catálogos
  const guardarCliente: Datos["guardarCliente"] = useCallback(
    async ({ id, ...resto }) => {
      const consulta = id
        ? supabase.from("clientes").update(resto).eq("id", id).select().single()
        : supabase.from("clientes").insert(resto).select().single();
      const { data, error } = await consulta;
      if (error) {
        avisar(error.message);
        return false;
      }
      const c = data as Cliente;
      setClientes((cs) =>
        [...cs.filter((x) => x.id !== c.id), c].sort((a, b) => a.nombre.localeCompare(b.nombre)),
      );
      return true;
    },
    [supabase, avisar],
  );

  const borrarCliente: Datos["borrarCliente"] = useCallback(
    async (id) => {
      const { error, count } = await supabase.from("clientes").delete({ count: "exact" }).eq("id", id);
      if (error || count === 0) {
        avisar(error?.message ?? "No tienes permiso para borrar clientes.");
        return false;
      }
      setClientes((cs) => cs.filter((c) => c.id !== id));
      return true;
    },
    [supabase, avisar],
  );

  const guardarMiembro: Datos["guardarMiembro"] = useCallback(
    async ({ id, ...resto }) => {
      const limpio = { ...resto, correo: resto.correo.trim().toLowerCase() };
      delete (limpio as Partial<Miembro>).auth_user_id;
      delete (limpio as Partial<Miembro>).created_at;
      const consulta = id
        ? supabase.from("miembros").update(limpio).eq("id", id).select().single()
        : supabase.from("miembros").insert(limpio).select().single();
      const { data, error } = await consulta;
      if (error) {
        avisar(error.message);
        return false;
      }
      const m = data as Miembro;
      setMiembros((ms) =>
        [...ms.filter((x) => x.id !== m.id), m].sort((a, b) => a.nombre.localeCompare(b.nombre)),
      );
      return true;
    },
    [supabase, avisar],
  );

  const borrarMiembro: Datos["borrarMiembro"] = useCallback(
    async (id) => {
      const { error, count } = await supabase.from("miembros").delete({ count: "exact" }).eq("id", id);
      if (error || count === 0) {
        avisar(error?.message ?? "No tienes permiso para borrar miembros.");
        return false;
      }
      setMiembros((ms) => ms.filter((m) => m.id !== id));
      return true;
    },
    [supabase, avisar],
  );

  // --------------------------------------------------------------- derivados
  const clientePorId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const miembroPorId = useMemo(() => new Map(miembros.map((m) => [m.id, m])), [miembros]);
  const proyectos = useMemo(
    () =>
      [...new Set(tareas.map((t) => t.proyecto?.trim()).filter((p): p is string => !!p))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [tareas],
  );

  const valor: Datos = {
    yo,
    esAdmin: yo.rol === "admin",
    cargando,
    enLinea,
    clientes,
    miembros,
    tareas,
    clientePorId,
    miembroPorId,
    proyectos,
    tareaAbiertaId,
    abrirTarea,
    crearTarea,
    actualizarTarea,
    borrarTarea,
    guardarCliente,
    borrarCliente,
    guardarMiembro,
    borrarMiembro,
    temporizador,
    iniciarTemporizador,
    detenerTemporizador,
    avisar,
  };

  return (
    <Contexto.Provider value={valor}>
      {children}
      <datalist id="lista-proyectos">
        {proyectos.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <div className="pointer-events-none fixed right-4 bottom-4 z-[100] flex flex-col gap-2">
        {avisos.map((a) => (
          <div
            key={a.id}
            className={
              "pointer-events-auto rounded-lg px-4 py-2.5 text-sm text-white shadow-lg " +
              (a.tipo === "error" ? "bg-red-600" : "bg-slate-800")
            }
          >
            {a.texto}
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}
