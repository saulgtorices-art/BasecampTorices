-- =====================================================================
-- Basecamp Torices · Carga masiva para todo el equipo + avisos por correo
--
-- - Cualquier miembro puede hacer una carga masiva. Si quien carga no es
--   líder, le llega un aviso al líder de su célula (o a los admins).
--   Deshacer una carga: quien la hizo o un admin.
-- - Cada notificación nueva se puede mandar también por correo. Un trigger
--   llama (con pg_net, sin bloquear) a /api/avisos-correo de la app, que
--   envía el correo por Gmail. Cada persona elige en su Perfil qué tipos le
--   llegan por correo.
-- Requiere 20261103000001_duplicar_importar_papelera.sql.
-- =====================================================================

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------
-- Nuevo tipo de aviso: carga masiva
-- ---------------------------------------------------------------------
alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;
alter table public.notificaciones
  add constraint notificaciones_tipo_check
  check (tipo in ('mencion', 'asignacion', 'estatus', 'vencida', 'ticket', 'eliminada', 'importacion'));

-- ---------------------------------------------------------------------
-- Carga masiva para todos
-- ---------------------------------------------------------------------
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
-- definer: escribe tareas, el lote y los avisos resumidos. El permiso se valida abajo.
security definer
set search_path = ''
as $$
declare
  v_yo       uuid := public.miembro_actual_id();
  v_lote     uuid;
  v_creadas  integer;
  v_clientes integer := 0;
  v_lideres  uuid[];
begin
  if v_yo is null then
    raise exception 'No autorizado.';
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

  -- Aviso al líder de la célula de quien cargó (o a los admins si no tiene célula).
  if v_creadas > 0 then
    select array_agg(ce.lider_id) into v_lideres
      from public.miembros m
      join public.celulas ce on ce.id = m.celula_id
     where m.id = v_yo and ce.lider_id is not null;
    if v_lideres is null then
      select array_agg(m.id) into v_lideres from public.miembros m where m.activo and m.rol = 'admin';
    end if;

    insert into public.notificaciones (miembro_id, actor_id, tarea_id, tipo, texto)
    select m.id, v_yo, null, 'importacion',
           'cargó ' || v_creadas || case when v_creadas = 1 then ' tarea' else ' tareas' end
           || ' con carga masiva' || coalesce(' (' || nullif(trim(p_archivo), '') || ')', '')
           || case when v_clientes > 0 then ' y creó ' || v_clientes
                   || case when v_clientes = 1 then ' cliente nuevo' else ' clientes nuevos' end
              else '' end
      from public.miembros m
     where m.id = any (coalesce(v_lideres, '{}'))
       and m.activo
       and m.id is distinct from v_yo;
  end if;

  return jsonb_build_object('lote', v_lote, 'creadas', v_creadas, 'clientes_nuevos', v_clientes);
end;
$$;

revoke all on function public.importar_tareas(text, jsonb, boolean, jsonb, integer) from public, anon;
grant execute on function public.importar_tareas(text, jsonb, boolean, jsonb, integer) to authenticated;

-- Deshacer: quien hizo la carga o un admin.
create or replace function public.deshacer_importacion(p_lote uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n     integer;
  v_autor uuid;
begin
  select creado_por into v_autor from public.importaciones where id = p_lote;
  if not found then
    raise exception 'Esa carga no existe.';
  end if;
  if not public.es_admin() and v_autor is distinct from public.miembro_actual_id() then
    raise exception 'Solo quien hizo la carga o un líder puede deshacerla.';
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

-- ---------------------------------------------------------------------
-- Avisos por correo: preferencias por persona
-- ---------------------------------------------------------------------
alter table public.miembros
  add column if not exists correo_tipos text[] not null
    default '{mencion,asignacion,ticket,eliminada,importacion}';

alter table public.notificaciones
  add column if not exists correo_enviado_at timestamptz;

-- Cada quien elige qué tipos de aviso le llegan por correo.
create or replace function public.actualizar_avisos_correo(p_tipos text[])
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tipos text[];
begin
  update public.miembros
     set correo_tipos = array(
           select distinct t from unnest(coalesce(p_tipos, '{}')) t
            where t in ('mencion', 'asignacion', 'estatus', 'vencida', 'ticket', 'eliminada', 'importacion'))
   where auth_user_id = auth.uid() and activo
  returning correo_tipos into v_tipos;

  if v_tipos is null then
    raise exception 'No autorizado.';
  end if;
  return v_tipos;
end;
$$;

revoke all on function public.actualizar_avisos_correo(text[]) from public, anon;
grant execute on function public.actualizar_avisos_correo(text[]) to authenticated;

-- ---------------------------------------------------------------------
-- Avisos por correo: a dónde llama la base de datos
-- Una sola fila. Sin políticas: solo la lee el trigger (security definer).
--   insert into public.config_avisos_correo (url, secreto)
--   values ('https://TU-APP.vercel.app/api/avisos-correo', '<mismo valor que AVISOS_CORREO_SECRETO>');
-- ---------------------------------------------------------------------
create table if not exists public.config_avisos_correo (
  id      boolean primary key default true check (id),
  url     text not null,
  secreto text not null,
  activo  boolean not null default true
);
alter table public.config_avisos_correo enable row level security;
revoke all on public.config_avisos_correo from anon, authenticated;

create or replace function public.notificaciones_enviar_correo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.config_avisos_correo;
  m public.miembros;
begin
  select * into c from public.config_avisos_correo where activo limit 1;
  if c.url is null then
    return new;
  end if;

  select * into m from public.miembros where id = new.miembro_id;
  if m.id is null or not m.activo or not (new.tipo = any (m.correo_tipos)) then
    return new;
  end if;

  -- Asíncrono: la notificación se guarda aunque el correo falle o tarde.
  perform net.http_post(
    url                  := c.url,
    body                 := jsonb_build_object('id', new.id),
    headers              := jsonb_build_object('Content-Type', 'application/json', 'x-avisos-secreto', c.secreto),
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  -- El correo nunca debe impedir que se guarde el aviso.
  return new;
end;
$$;

drop trigger if exists notificaciones_enviar_correo on public.notificaciones;
create trigger notificaciones_enviar_correo
after insert on public.notificaciones
for each row execute function public.notificaciones_enviar_correo();
