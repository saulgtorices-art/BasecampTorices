-- =====================================================================
-- Basecamp Torices · Comentarios tipo chat + notificaciones
-- - Comentarios con imágenes/archivos (evidencias), respuestas y @menciones.
-- - Notificaciones en la app: mención, asignación, cambio de estatus y vencida.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Comentarios: adjuntos, respuestas, menciones y edición
-- ---------------------------------------------------------------------
alter table public.comentarios_tarea
  -- [{ "ruta": "...", "nombre": "...", "mime": "...", "tamano": 123 }]
  add column adjuntos    jsonb  not null default '[]'::jsonb,
  add column respuesta_a uuid   references public.comentarios_tarea (id) on delete set null,
  add column menciones   uuid[] not null default '{}',
  add column editado_at  timestamptz;

-- Un mensaje puede ser solo una imagen (sin texto).
alter table public.comentarios_tarea drop constraint if exists comentarios_tarea_texto_check;
alter table public.comentarios_tarea alter column texto set default '';
alter table public.comentarios_tarea
  add constraint comentarios_tarea_contenido_check
  check (length(trim(texto)) > 0 or jsonb_array_length(adjuntos) > 0);

-- ---------------------------------------------------------------------
-- Notificaciones
-- ---------------------------------------------------------------------
create table public.notificaciones (
  id         uuid primary key default gen_random_uuid(),
  -- Quién la recibe.
  miembro_id uuid not null references public.miembros (id) on delete cascade,
  -- Quién la provocó (null = sistema).
  actor_id   uuid references public.miembros (id) on delete set null,
  tarea_id   uuid references public.tareas (id) on delete cascade,
  tipo       text not null check (tipo in ('mencion', 'asignacion', 'estatus', 'vencida')),
  texto      text not null,
  leida      boolean not null default false,
  created_at timestamptz not null default now()
);
create index notificaciones_miembro_idx on public.notificaciones (miembro_id, created_at desc);
-- Solo un aviso de "vencida" por persona y tarea.
create unique index notificaciones_vencida_unica
  on public.notificaciones (miembro_id, tarea_id) where tipo = 'vencida';

alter table public.notificaciones enable row level security;

-- Cada quien ve, marca como leídas y borra solo las suyas. Las crean los triggers.
create policy notificaciones_select on public.notificaciones for select to authenticated
  using (miembro_id = public.miembro_actual_id());
create policy notificaciones_update on public.notificaciones for update to authenticated
  using (miembro_id = public.miembro_actual_id())
  with check (miembro_id = public.miembro_actual_id());
create policy notificaciones_delete on public.notificaciones for delete to authenticated
  using (miembro_id = public.miembro_actual_id());

revoke all on public.notificaciones from anon;

-- ---------------------------------------------------------------------
-- Triggers que generan notificaciones
-- ---------------------------------------------------------------------

-- @menciones en comentarios
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
  if coalesce(array_length(new.menciones, 1), 0) = 0 then
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

create trigger comentarios_notificar_menciones
after insert on public.comentarios_tarea
for each row execute function public.notificar_menciones();

-- Asignación y cambio de estatus en tareas
create or replace function public.notificar_cambios_tarea()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.miembro_actual_id();
begin
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

create trigger tareas_notificar_cambios
after insert or update of responsable_id, estatus on public.tareas
for each row execute function public.notificar_cambios_tarea();

-- Vencidas: la app la llama al cargar; crea (una sola vez) el aviso de cada
-- tarea vencida del usuario actual. Así no hace falta un cron.
create or replace function public.generar_avisos_vencidas()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_yo uuid := public.miembro_actual_id();
  v_n integer;
begin
  if v_yo is null then
    return 0;
  end if;

  insert into public.notificaciones (miembro_id, actor_id, tarea_id, tipo, texto)
  select v_yo, null, t.id, 'vencida',
         '"' || t.titulo || '" venció el ' || to_char(t.fecha_entrega, 'DD/MM/YYYY')
    from public.tareas t
   where t.responsable_id = v_yo
     and t.estatus <> 'Terminado'
     and t.fecha_entrega < public.hoy_mx()
  on conflict (miembro_id, tarea_id) where tipo = 'vencida' do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.generar_avisos_vencidas() from anon, public;
grant execute on function public.generar_avisos_vencidas() to authenticated;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
alter table public.notificaciones replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notificaciones;
  end if;
end;
$$;
