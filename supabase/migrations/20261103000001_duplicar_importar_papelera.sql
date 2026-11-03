-- =====================================================================
-- Basecamp Torices · Borrado para todos, papelera, avisos a líderes y
-- carga masiva de tareas.
--
-- - Cualquier miembro puede borrar tareas. Antes de borrarse, la tarea (con
--   sus comentarios, archivos, tiempo, historial y ticket ligado) se guarda
--   en `tareas_eliminadas` y se avisa al Team Leader de la célula del
--   responsable, del creador y de quien borró. Si nadie tiene célula, se
--   avisa a todos los admins.
-- - Los líderes (admin) ven la papelera y pueden restaurar la tarea completa.
-- - `importar_tareas()` crea un lote de tareas en una sola transacción
--   (pantalla "Carga masiva" desde Excel/CSV). `deshacer_importacion()` lo
--   revierte completo.
-- - `app.sin_avisos` silencia las notificaciones automáticas mientras se
--   importa o restaura (en su lugar se manda un solo aviso resumido).
-- Requiere 20261023000001_celulas.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Interruptor para silenciar avisos dentro de una transacción
-- ---------------------------------------------------------------------
create or replace function public.avisos_silenciados()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('app.sin_avisos', true), '') = 'on';
$$;

-- Mismas funciones de 20261020000001_chat_notificaciones.sql, ahora respetan
-- el interruptor.
create or replace function public.notificar_menciones()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(new.miembro_id, public.miembro_actual_id());
  v_titulo text;
  v_extracto text;
begin
  if public.avisos_silenciados() or coalesce(array_length(new.menciones, 1), 0) = 0 then
    return new;
  end if;

  select titulo into v_titulo from public.tareas where id = new.tarea_id;
  v_extracto := case
    when length(trim(new.texto)) = 0 then '📎 adjuntó evidencia'
    when length(new.texto) > 120 then left(new.texto, 120) || '…'
    else new.texto
  end;

  insert into public.notificaciones (miembro_id, actor_id, tarea_id, tipo, texto)
  select distinct m.id, v_actor, new.tarea_id, 'mencion',
         'te mencionó en "' || v_titulo || '": ' || v_extracto
    from public.miembros m
   where m.id = any (new.menciones)
     and m.activo
     and m.id is distinct from v_actor;

  return new;
end;
$$;

create or replace function public.notificar_cambios_tarea()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.miembro_actual_id();
begin
  if public.avisos_silenciados() then
    return new;
  end if;

  -- Me asignaron la tarea.
  if new.responsable_id is not null
     and new.responsable_id is distinct from v_actor
     and (tg_op = 'INSERT' or old.responsable_id is distinct from new.responsable_id) then
    insert into public.notificaciones (miembro_id, actor_id, tarea_id, tipo, texto)
    values (new.responsable_id, v_actor, new.id, 'asignacion',
            'te asignó la tarea "' || new.titulo || '"');
  end if;

  -- Cambió el estatus de una tarea mía (si no la acaban de asignar en el mismo cambio).
  if tg_op = 'UPDATE'
     and old.estatus is distinct from new.estatus
     and new.responsable_id is not null
     and new.responsable_id is distinct from v_actor
     and old.responsable_id is not distinct from new.responsable_id then
    insert into public.notificaciones (miembro_id, actor_id, tarea_id, tipo, texto)
    values (new.responsable_id, v_actor, new.id, 'estatus',
            'cambió "' || new.titulo || '" de ' || old.estatus || ' a ' || new.estatus);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Nuevo tipo de notificación: tarea eliminada
-- ---------------------------------------------------------------------
alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;
alter table public.notificaciones
  add constraint notificaciones_tipo_check
  check (tipo in ('mencion', 'asignacion', 'estatus', 'vencida', 'ticket', 'eliminada'));

-- ---------------------------------------------------------------------
-- Papelera
-- ---------------------------------------------------------------------
create table public.tareas_eliminadas (
  -- Mismo id que tenía la tarea (así se restaura con todo y enlaces).
  id             uuid primary key,
  titulo         text not null,
  cliente_id     uuid references public.clientes (id) on delete set null,
  responsable_id uuid references public.miembros (id) on delete set null,
  eliminada_por  uuid references public.miembros (id) on delete set null,
  eliminada_at   timestamptz not null default now(),
  -- { tarea, comentarios, adjuntos, registros, historial, tickets }
  datos          jsonb not null
);
create index tareas_eliminadas_fecha_idx on public.tareas_eliminadas (eliminada_at desc);

alter table public.tareas_eliminadas enable row level security;

-- Solo líderes (admin) ven y vacían la papelera. La llena el trigger.
create policy tareas_eliminadas_select on public.tareas_eliminadas for select to authenticated
  using (public.es_admin());
create policy tareas_eliminadas_delete on public.tareas_eliminadas for delete to authenticated
  using (public.es_admin());

revoke all on public.tareas_eliminadas from anon;

-- ---------------------------------------------------------------------
-- Ahora cualquier miembro puede borrar tareas
-- ---------------------------------------------------------------------
drop policy if exists tareas_delete on public.tareas;
create policy tareas_delete on public.tareas for delete to authenticated using (public.es_miembro());

-- Antes de borrar: guarda la tarea en la papelera y avisa a los líderes.
create or replace function public.tareas_antes_borrar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := public.miembro_actual_id();
  v_cliente text;
  v_resp    text;
  v_texto   text;
  v_lideres uuid[];
begin
  if coalesce(current_setting('app.sin_papelera', true), '') <> 'on' then
    insert into public.tareas_eliminadas
      (id, titulo, cliente_id, responsable_id, eliminada_por, eliminada_at, datos)
    values (
      old.id, old.titulo, old.cliente_id, old.responsable_id, v_actor, now(),
      jsonb_build_object(
        'tarea', to_jsonb(old),
        'comentarios', coalesce((
          select jsonb_agg(to_jsonb(c) order by c.created_at)
            from public.comentarios_tarea c where c.tarea_id = old.id), '[]'::jsonb),
        'adjuntos', coalesce((
          select jsonb_agg(to_jsonb(a) order by a.created_at)
            from public.adjuntos_tarea a where a.tarea_id = old.id), '[]'::jsonb),
        -- Un temporizador corriendo no se guarda (se perdería al borrar de todos modos).
        'registros', coalesce((
          select jsonb_agg(to_jsonb(r) order by r.inicio)
            from public.registros_tiempo r where r.tarea_id = old.id and r.fin is not null), '[]'::jsonb),
        'historial', coalesce((
          select jsonb_agg(to_jsonb(h) order by h.fecha)
            from public.historial h where h.tarea_id = old.id), '[]'::jsonb),
        'tickets', coalesce((
          select jsonb_agg(k.id) from public.tickets k where k.tarea_id = old.id), '[]'::jsonb)
      )
    )
    on conflict (id) do update
      set titulo         = excluded.titulo,
          cliente_id     = excluded.cliente_id,
          responsable_id = excluded.responsable_id,
          eliminada_por  = excluded.eliminada_por,
          eliminada_at   = excluded.eliminada_at,
          datos          = excluded.datos;
  end if;

  if public.avisos_silenciados() then
    return old;
  end if;

  select nombre into v_cliente from public.clientes where id = old.cliente_id;
  select nombre into v_resp from public.miembros where id = old.responsable_id;
  v_texto := 'eliminó la tarea "' || old.titulo || '" (' || coalesce(v_cliente, 'sin cliente')
             || ' · ' || coalesce(v_resp, 'sin responsable') || ')';

  -- Líderes de la célula del responsable, del creador y de quien borró.
  select array_agg(distinct ce.lider_id) into v_lideres
    from public.miembros m
    join public.celulas ce on ce.id = m.celula_id
   where m.id in (old.responsable_id, old.creado_por, v_actor)
     and ce.lider_id is not null;

  -- Sin células configuradas: a todos los admins.
  if v_lideres is null then
    select array_agg(m.id) into v_lideres from public.miembros m where m.activo and m.rol = 'admin';
  end if;

  insert into public.notificaciones (miembro_id, actor_id, tarea_id, tipo, texto)
  select m.id, v_actor, null, 'eliminada', v_texto
    from public.miembros m
   where m.id = any (coalesce(v_lideres, '{}'))
     and m.activo
     and m.id is distinct from v_actor;

  return old;
end;
$$;

drop trigger if exists tareas_antes_borrar on public.tareas;
create trigger tareas_antes_borrar
before delete on public.tareas
for each row execute function public.tareas_antes_borrar();

-- Quita de cada objeto del arreglo la llave `p_clave` si apunta a un miembro
-- que ya no existe (para que la restauración no truene por llave foránea).
create or replace function public._sin_miembros_borrados(p_arr jsonb, p_clave text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
           case when x ->> p_clave is not null
                     and not exists (select 1 from public.miembros m where m.id = (x ->> p_clave)::uuid)
                then x - p_clave
                else x end), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_arr, '[]'::jsonb)) as x;
$$;

-- Restaura una tarea de la papelera con sus comentarios, archivos, tiempo,
-- historial y ticket ligado. Solo admin.
create or replace function public.restaurar_tarea(p_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e      public.tareas_eliminadas;
  t      public.tareas;
  v_yo   uuid := public.miembro_actual_id();
begin
  if not public.es_admin() then
    raise exception 'Solo los líderes pueden restaurar tareas.';
  end if;

  select * into e from public.tareas_eliminadas where id = p_id;
  if e.id is null then
    raise exception 'La tarea ya no está en la papelera.';
  end if;
  if exists (select 1 from public.tareas where id = p_id) then
    raise exception 'La tarea ya existe.';
  end if;

  t := jsonb_populate_record(null::public.tareas, e.datos -> 'tarea');
  if not exists (select 1 from public.clientes where id = t.cliente_id) then
    raise exception 'El cliente de esta tarea ya no existe; vuelve a crearlo antes de restaurarla.';
  end if;
  if t.responsable_id is not null and not exists (select 1 from public.miembros where id = t.responsable_id) then
    t.responsable_id := null;
  end if;
  if t.creado_por is not null and not exists (select 1 from public.miembros where id = t.creado_por) then
    t.creado_por := null;
  end if;
  if t.import_lote_id is not null and not exists (select 1 from public.importaciones where id = t.import_lote_id) then
    t.import_lote_id := null;
  end if;

  perform set_config('app.sin_avisos', 'on', true);

  insert into public.tareas select (t).*;

  insert into public.comentarios_tarea
  select * from jsonb_populate_recordset(
    null::public.comentarios_tarea,
    public._sin_miembros_borrados(e.datos -> 'comentarios', 'miembro_id'));

  insert into public.adjuntos_tarea
  select * from jsonb_populate_recordset(
    null::public.adjuntos_tarea,
    public._sin_miembros_borrados(e.datos -> 'adjuntos', 'miembro_id'));

  -- Los registros de tiempo exigen miembro: se omiten los de personas borradas.
  insert into public.registros_tiempo
  select r.* from jsonb_populate_recordset(null::public.registros_tiempo, e.datos -> 'registros') r
   where exists (select 1 from public.miembros m where m.id = r.miembro_id);

  -- Los triggers agregaron "creada" y "adjunto"; nos quedamos con el historial original.
  delete from public.historial where tarea_id = p_id;

  insert into public.historial (id, tarea_id, miembro_id, campo, valor_anterior, valor_nuevo, fecha)
  overriding system value
  select h.id, h.tarea_id, h.miembro_id, h.campo, h.valor_anterior, h.valor_nuevo, h.fecha
    from jsonb_populate_recordset(
           null::public.historial,
           public._sin_miembros_borrados(e.datos -> 'historial', 'miembro_id')) h
  on conflict (id) do nothing;

  insert into public.historial (tarea_id, miembro_id, campo, valor_anterior, valor_nuevo)
  values (p_id, v_yo, 'restaurada', null, 'desde la papelera');

  update public.tickets k
     set tarea_id = p_id
   where k.id in (select (jsonb_array_elements_text(coalesce(e.datos -> 'tickets', '[]'::jsonb)))::uuid)
     and k.tarea_id is null;

  delete from public.tareas_eliminadas where id = p_id;
  return p_id;
end;
$$;

revoke all on function public.restaurar_tarea(uuid) from public, anon;
grant execute on function public.restaurar_tarea(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Carga masiva
-- ---------------------------------------------------------------------
alter table public.importaciones
  add column if not exists deshecha_at timestamptz;

-- p_filas: [{ cliente, titulo, responsable_id, estatus, prioridad, qa,
--             fecha_inicio, fecha_entrega, fecha_cierre, comentarios,
--             documento_url, proyecto }]
-- `cliente` es el nombre (sin distinguir mayúsculas). Si no existe y
-- p_crear_clientes = true, se crea; si no, esa fila se omite.
-- Devuelve { lote, creadas, clientes_nuevos }.
create or replace function public.importar_tareas(
  p_archivo        text,
  p_filas          jsonb,
  p_crear_clientes boolean default true,
  p_errores        jsonb   default '[]'::jsonb,
  p_filas_total    integer default null
)
returns jsonb
language plpgsql
volatile
-- definer: además de las tareas, escribe los avisos resumidos (la tabla de
-- notificaciones no acepta inserts directos). El permiso se valida abajo.
security definer
set search_path = ''
as $$
declare
  v_yo       uuid := public.miembro_actual_id();
  v_lote     uuid;
  v_creadas  integer;
  v_clientes integer := 0;
begin
  if not public.es_admin() then
    raise exception 'Solo los líderes pueden hacer cargas masivas.';
  end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'No hay filas para importar.';
  end if;
  if jsonb_array_length(p_filas) > 2000 then
    raise exception 'Máximo 2000 tareas por carga.';
  end if;

  insert into public.importaciones (archivo, creado_por, filas_total, errores)
  values (p_archivo, v_yo, coalesce(p_filas_total, jsonb_array_length(p_filas)), coalesce(p_errores, '[]'::jsonb))
  returning id into v_lote;

  if p_crear_clientes then
    insert into public.clientes (nombre)
    select distinct on (lower(trim(f ->> 'cliente'))) trim(f ->> 'cliente')
      from jsonb_array_elements(p_filas) f
     where length(trim(coalesce(f ->> 'cliente', ''))) > 0
       and not exists (
             select 1 from public.clientes c
              where lower(trim(c.nombre)) = lower(trim(f ->> 'cliente')))
    on conflict do nothing;
    get diagnostics v_clientes = row_count;
  end if;

  perform set_config('app.sin_avisos', 'on', true);

  insert into public.tareas (
    cliente_id, titulo, responsable_id, estatus, prioridad, qa,
    fecha_inicio, fecha_entrega, fecha_cierre, comentarios, documento_url,
    proyecto, import_lote_id, posicion
  )
  select
    c.id,
    trim(f ->> 'titulo'),
    nullif(f ->> 'responsable_id', '')::uuid,
    coalesce(nullif(f ->> 'estatus', ''), 'Backlog')::public.estatus_tarea,
    coalesce(nullif(f ->> 'prioridad', ''), 'Media')::public.prioridad_tarea,
    coalesce((f ->> 'qa')::boolean, false),
    nullif(f ->> 'fecha_inicio', '')::date,
    nullif(f ->> 'fecha_entrega', '')::date,
    -- Una tarea que llega ya terminada se cierra en su fecha de entrega (o la
    -- de cierre si viene), no "hoy", para que el dashboard la cuente en su mes.
    case when coalesce(nullif(f ->> 'estatus', ''), 'Backlog') = 'Terminado'
         then coalesce(nullif(f ->> 'fecha_cierre', '')::date, nullif(f ->> 'fecha_entrega', '')::date)
    end,
    nullif(trim(coalesce(f ->> 'comentarios', '')), ''),
    nullif(trim(coalesce(f ->> 'documento_url', '')), ''),
    nullif(trim(coalesce(f ->> 'proyecto', '')), ''),
    v_lote,
    extract(epoch from clock_timestamp()) + x.ord * 0.001
  from jsonb_array_elements(p_filas) with ordinality as x (f, ord)
  join public.clientes c on lower(trim(c.nombre)) = lower(trim(x.f ->> 'cliente'))
  where length(trim(coalesce(x.f ->> 'titulo', ''))) > 0;

  get diagnostics v_creadas = row_count;

  update public.importaciones set filas_ok = v_creadas where id = v_lote;

  -- Un solo aviso por responsable (en vez de uno por tarea).
  insert into public.notificaciones (miembro_id, actor_id, tarea_id, tipo, texto)
  select t.responsable_id, v_yo,
         case when count(*) = 1 then (array_agg(t.id))[1] end,
         'asignacion',
         case when count(*) = 1
              then 'te asignó la tarea "' || min(t.titulo) || '" (carga masiva)'
              else 'te asignó ' || count(*) || ' tareas en una carga masiva'
                   || coalesce(' (' || nullif(trim(p_archivo), '') || ')', '')
         end
    from public.tareas t
   where t.import_lote_id = v_lote
     and t.responsable_id is not null
     and t.responsable_id is distinct from v_yo
   group by t.responsable_id;

  return jsonb_build_object('lote', v_lote, 'creadas', v_creadas, 'clientes_nuevos', v_clientes);
end;
$$;

revoke all on function public.importar_tareas(text, jsonb, boolean, jsonb, integer) from public, anon;
grant execute on function public.importar_tareas(text, jsonb, boolean, jsonb, integer) to authenticated;

-- Borra todas las tareas de un lote (sin mandarlas a la papelera ni avisar).
create or replace function public.deshacer_importacion(p_lote uuid)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not public.es_admin() then
    raise exception 'Solo los líderes pueden deshacer una carga.';
  end if;

  perform set_config('app.sin_avisos', 'on', true);
  perform set_config('app.sin_papelera', 'on', true);

  delete from public.tareas where import_lote_id = p_lote;
  get diagnostics v_n = row_count;

  update public.importaciones set deshecha_at = now() where id = p_lote;
  return v_n;
end;
$$;

revoke all on function public.deshacer_importacion(uuid) from public, anon;
grant execute on function public.deshacer_importacion(uuid) to authenticated;
