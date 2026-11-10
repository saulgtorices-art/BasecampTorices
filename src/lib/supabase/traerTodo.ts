import type { PostgrestError } from "@supabase/supabase-js";

/** Filas por página. Debe ser ≤ "Max rows" de la Data API de Supabase (hoy 10000). */
const PAGINA = 1000;

type Respuesta<T> = { data: T[] | null; error: PostgrestError | null };

/**
 * Trae TODAS las filas de una consulta, página por página.
 *
 * Supabase (PostgREST) corta cada respuesta en "Max rows" sin avisar, aunque la
 * consulta pida `.limit(10000)`. Por eso, al pasar de 1,000 tareas, las más
 * nuevas dejaban de aparecer en la app. Esta función pide rangos de 1,000 hasta
 * que una página regresa incompleta.
 *
 * La consulta debe tener un orden estable (termina en `.order("id")`) para que
 * las páginas no se encimen ni se salten filas.
 *
 * Uso:
 *   traerTodo<Tarea>((desde, hasta) =>
 *     supabase.from("tareas").select("*").order("posicion").order("id").range(desde, hasta));
 */
export async function traerTodo<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<Respuesta<T>>,
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) return { data: filas, error };
    const pagina = data ?? [];
    filas.push(...pagina);
    if (pagina.length < PAGINA) return { data: filas, error: null };
  }
}
