-- =====================================================================
-- Basecamp Torices · Esquema inicial
-- Tablas, tipos, triggers, RLS, vistas y realtime.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.estatus_tarea as enum (
  'Backlog',
  'En Proceso',
  'En QA',
  'On hold - tarea continua',
  'Terminado'
);

create type public.prioridad_tarea as enum ('Urgente', 'Alta', 'Media', 'Baja');

create type public.rol_miembro as enum ('admin', 'miembro');

-- Fecha "de hoy" en la zona horaria del equipo.
create or replace function public.hoy_mx()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Mexico_City')::date;
$$;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table public.clientes (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (length(trim(nombre)) > 0),
  dominio    text,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index clientes_nombre_unico on public.clientes (lower(trim(nombre)));

create table public.miembros (
  id           uuid primary key default gen_random_uuid(),
  -- Se liga automáticamente en el primer inicio de sesión (ver vincular_miembro()).
  auth_user_id uuid unique references auth.users (id) on delete set null,
  nombre       text not null check (length(trim(nombre)) > 0),
  correo       text not null unique check (correo = lower(trim(correo))),
  rol          public.rol_miembro not null default 'miembro',
  -- Nombres alternos para mapear la columna "Responsable" al importar.
  alias        text[] not null default '{}',
  activo       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.importaciones (
  id          uuid primary key default gen_random_uuid(),
  archivo     text,
  creado_por  uuid references public.miembros (id) on delete set null,
  filas_total integer not null default 0,
  filas_ok    integer not null default 0,
  errores     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create table public.tareas (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes (id) on delete restrict,
  titulo         text not null check (length(trim(titulo)) > 0),
  responsable_id uuid references public.miembros (id) on delete set null,
  estatus        public.estatus_tarea not null default 'Backlog',
  prioridad      public.prioridad_tarea not null default 'Media',
  qa             boolean not null default false,
  fecha_inicio   date,
  fecha_entrega  date,
  fecha_cierre   date,
  comentarios    text,
  documento_url  text,
  proyecto       text,
  -- Orden dentro de la columna del Kanban / grupo de la tabla.
  posicion       double precision not null default extract(epoch from clock_timestamp()),
  creado_por     uuid references public.miembros (id) on delete set null,
  import_lote_id uuid references public.importaciones (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index tareas_cliente_idx      on public.tareas (cliente_id);
create index tareas_responsable_idx  on public.tareas (responsable_id);
create index tareas_estatus_idx      on public.tareas (estatus);
create index tareas_entrega_idx      on public.tareas (fecha_entrega);
create index tareas_cierre_idx       on public.tareas (fecha_cierre);
create index tareas_proyecto_idx     on public.tareas (proyecto);
create index tareas_lote_idx         on public.tareas (import_lote_id);
create index tareas_titulo_trgm      on public.tareas using gin (titulo extensions.gin_trgm_ops);
create index tareas_comentarios_trgm on public.tareas using gin (comentarios extensions.gin_trgm_ops);

create table public.comentarios_tarea (
  id         uuid primary key default gen_random_uuid(),
  tarea_id   uuid not null references public.tareas (id) on delete cascade,
  miembro_id uuid references public.miembros (id) on delete set null,
  texto      text not null check (length(trim(texto)) > 0),
  created_at timestamptz not null default now()
);
create index comentarios_tarea_idx on public.comentarios_tarea (tarea_id, created_at);

create table public.registros_tiempo (
  id         uuid primary key default gen_random_uuid(),
  tarea_id   uuid not null references public.tareas (id) on delete cascade,
  miembro_id uuid not null references public.miembros (id) on delete cascade,
  inicio     timestamptz not null default now(),
  fin        timestamptz,
  minutos    integer check (minutos is null or minutos >= 0),
  nota       text,
  manual     boolean not null default false,
  created_at timestamptz not null default now(),
  check (fin is null or fin >= inicio)
);
create index registros_tarea_idx   on public.registros_tiempo (tarea_id);
create index registros_miembro_idx on public.registros_tiempo (miembro_id, inicio);
-- Solo un temporizador activo por persona.
create unique index registros_un_activo on public.registros_tiempo (miembro_id) where fin is null;

create table public.historial (
  id             bigint generated always as identity primary key,
  tarea_id       uuid not null references public.tareas (id) on delete cascade,
  miembro_id     uuid references public.miembros (id) on delete set null,
  campo          text not null,
  valor_anterior text,
  valor_nuevo    text,
  fecha          timestamptz not null default now()
);
create index historial_tarea_idx on public.historial (tarea_id, fecha desc);

-- ---------------------------------------------------------------------
-- Funciones de sesión (security definer: evitan recursión de RLS)
-- ---------------------------------------------------------------------
create or replace function public.miembro_actual_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.miembros
  where auth_user_id = auth.uid() and activo
  limit 1;
$$;

create or replace function public.es_miembro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.miembros where auth_user_id = auth.uid() and activo
  );
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.miembros
    where auth_user_id = auth.uid() and activo and rol = 'admin'
  );
$$;

-- Se llama después de cada login. Liga la cuenta de Google con la fila de
-- miembros que tenga el mismo correo. Devuelve true si el usuario es miembro activo.
create or replace function public.vincular_miembro()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_correo text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if auth.uid() is null or v_correo = '' then
    return false;
  end if;

  update public.miembros
     set auth_user_id = auth.uid()
   where correo = v_correo
     and (auth_user_id is null or auth_user_id <> auth.uid());

  return public.es_miembro();
end;
$$;

revoke execute on function public.vincular_miembro() from anon, public;
grant execute on function public.vincular_miembro() to authenticated;

-- ---------------------------------------------------------------------
-- Triggers de tareas
-- ---------------------------------------------------------------------
create or replace function public.tareas_antes_guardar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.creado_por := coalesce(new.creado_por, public.miembro_actual_id());
    new.created_at := coalesce(new.created_at, now());
  end if;

  new.updated_at := now();

  -- fecha_cierre automática al terminar; se limpia si se reabre.
  if new.estatus = 'Terminado' then
    if tg_op = 'INSERT' or old.estatus is distinct from 'Terminado' then
      new.fecha_cierre := coalesce(new.fecha_cierre, public.hoy_mx());
    end if;
  elsif tg_op = 'UPDATE' and old.estatus = 'Terminado' then
    new.fecha_cierre := null;
  end if;

  return new;
end;
$$;

create trigger tareas_antes_guardar
before insert or update on public.tareas
for each row execute function public.tareas_antes_guardar();

-- Historial de cambios: una fila por campo modificado.
create or replace function public.tareas_registrar_historial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_miembro uuid := public.miembro_actual_id();
  v_old jsonb;
  v_new jsonb;
  v_campo text;
  v_ant text;
  v_nue text;
  -- Campos que no se registran.
  v_ignorar text[] := array['id', 'created_at', 'updated_at', 'posicion', 'creado_por', 'import_lote_id'];
begin
  if tg_op = 'INSERT' then
    insert into public.historial (tarea_id, miembro_id, campo, valor_anterior, valor_nuevo)
    values (new.id, v_miembro, 'creada', null, new.titulo);
    return new;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);

  for v_campo in select jsonb_object_keys(v_new) loop
    continue when v_campo = any (v_ignorar);
    continue when (v_old -> v_campo) is not distinct from (v_new -> v_campo);

    v_ant := v_old ->> v_campo;
    v_nue := v_new ->> v_campo;

    -- Valores legibles para llaves foráneas.
    if v_campo = 'cliente_id' then
      v_campo := 'cliente';
      select nombre into v_ant from public.clientes where id = (old.cliente_id);
      select nombre into v_nue from public.clientes where id = (new.cliente_id);
    elsif v_campo = 'responsable_id' then
      v_campo := 'responsable';
      select nombre into v_ant from public.miembros where id = (old.responsable_id);
      select nombre into v_nue from public.miembros where id = (new.responsable_id);
    end if;

    insert into public.historial (tarea_id, miembro_id, campo, valor_anterior, valor_nuevo)
    values (new.id, v_miembro, v_campo, v_ant, v_nue);
  end loop;

  return new;
end;
$$;

create trigger tareas_registrar_historial
after insert or update on public.tareas
for each row execute function public.tareas_registrar_historial();

-- ---------------------------------------------------------------------
-- Trigger de registros de tiempo: calcula minutos
-- ---------------------------------------------------------------------
create or replace function public.registros_calcular_minutos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.fin is not null then
    new.minutos := greatest(0, round(extract(epoch from (new.fin - new.inicio)) / 60.0)::integer);
  else
    new.minutos := null;
  end if;
  return new;
end;
$$;

create trigger registros_calcular_minutos
before insert or update on public.registros_tiempo
for each row execute function public.registros_calcular_minutos();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.clientes          enable row level security;
alter table public.miembros          enable row level security;
alter table public.tareas            enable row level security;
alter table public.comentarios_tarea enable row level security;
alter table public.registros_tiempo  enable row level security;
alter table public.historial         enable row level security;
alter table public.importaciones     enable row level security;

-- clientes: miembros leen, crean y editan; solo admin borra.
create policy clientes_select on public.clientes for select to authenticated using (public.es_miembro());
create policy clientes_insert on public.clientes for insert to authenticated with check (public.es_miembro());
create policy clientes_update on public.clientes for update to authenticated using (public.es_miembro()) with check (public.es_miembro());
create policy clientes_delete on public.clientes for delete to authenticated using (public.es_admin());

-- miembros: todos los miembros leen; solo admin gestiona.
create policy miembros_select on public.miembros for select to authenticated using (public.es_miembro());
create policy miembros_insert on public.miembros for insert to authenticated with check (public.es_admin());
create policy miembros_update on public.miembros for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy miembros_delete on public.miembros for delete to authenticated using (public.es_admin());

-- tareas: miembros leen, crean y editan; solo admin borra.
create policy tareas_select on public.tareas for select to authenticated using (public.es_miembro());
create policy tareas_insert on public.tareas for insert to authenticated with check (public.es_miembro());
create policy tareas_update on public.tareas for update to authenticated using (public.es_miembro()) with check (public.es_miembro());
create policy tareas_delete on public.tareas for delete to authenticated using (public.es_admin());

-- comentarios: cada quien publica a su nombre y edita/borra los suyos (admin, todos).
create policy comentarios_select on public.comentarios_tarea for select to authenticated using (public.es_miembro());
create policy comentarios_insert on public.comentarios_tarea for insert to authenticated
  with check (public.es_miembro() and miembro_id = public.miembro_actual_id());
create policy comentarios_update on public.comentarios_tarea for update to authenticated
  using (miembro_id = public.miembro_actual_id() or public.es_admin())
  with check (miembro_id = public.miembro_actual_id() or public.es_admin());
create policy comentarios_delete on public.comentarios_tarea for delete to authenticated
  using (miembro_id = public.miembro_actual_id() or public.es_admin());

-- registros de tiempo: cada quien los suyos (admin, todos).
create policy registros_select on public.registros_tiempo for select to authenticated using (public.es_miembro());
create policy registros_insert on public.registros_tiempo for insert to authenticated
  with check (public.es_miembro() and (miembro_id = public.miembro_actual_id() or public.es_admin()));
create policy registros_update on public.registros_tiempo for update to authenticated
  using (miembro_id = public.miembro_actual_id() or public.es_admin())
  with check (miembro_id = public.miembro_actual_id() or public.es_admin());
create policy registros_delete on public.registros_tiempo for delete to authenticated
  using (miembro_id = public.miembro_actual_id() or public.es_admin());

-- historial: solo lectura (lo escribe el trigger).
create policy historial_select on public.historial for select to authenticated using (public.es_miembro());

-- importaciones: miembros leen; solo admin importa.
create policy importaciones_select on public.importaciones for select to authenticated using (public.es_miembro());
create policy importaciones_insert on public.importaciones for insert to authenticated with check (public.es_admin());
create policy importaciones_update on public.importaciones for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy importaciones_delete on public.importaciones for delete to authenticated using (public.es_admin());

-- Los usuarios anónimos no tienen nada que hacer aquí.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------
-- Vistas para el dashboard (respetan RLS del usuario que consulta)
-- ---------------------------------------------------------------------

-- Cada tarea ubicada en un mes:
--   terminada -> mes de fecha_cierre
--   pendiente -> mes de fecha_entrega (o de creación si no tiene entrega)
create or replace view public.v_tareas_mes
with (security_invoker = on) as
select
  t.id as tarea_id,
  date_trunc('month', coalesce(
    case when t.estatus = 'Terminado' then t.fecha_cierre end,
    t.fecha_entrega,
    (t.created_at at time zone 'America/Mexico_City')::date
  ))::date as mes,
  t.responsable_id,
  m.nombre as responsable,
  t.cliente_id,
  c.nombre as cliente,
  t.estatus,
  (t.estatus = 'Terminado') as terminada,
  coalesce(t.estatus <> 'Terminado' and t.fecha_entrega < public.hoy_mx(), false) as vencida
from public.tareas t
join public.clientes c on c.id = t.cliente_id
left join public.miembros m on m.id = t.responsable_id;

-- Horas registradas por mes, persona y cliente (solo registros cerrados).
create or replace view public.v_horas_mes
with (security_invoker = on) as
select
  date_trunc('month', (r.inicio at time zone 'America/Mexico_City'))::date as mes,
  r.miembro_id,
  m.nombre as miembro,
  t.cliente_id,
  c.nombre as cliente,
  round(sum(r.minutos) / 60.0, 2) as horas,
  sum(r.minutos)::integer as minutos
from public.registros_tiempo r
join public.tareas t on t.id = r.tarea_id
join public.clientes c on c.id = t.cliente_id
join public.miembros m on m.id = r.miembro_id
where r.minutos is not null
group by 1, 2, 3, 4, 5;

-- Tareas vencidas (no terminadas y con fecha de entrega pasada).
create or replace view public.v_tareas_vencidas
with (security_invoker = on) as
select
  t.id,
  t.titulo,
  t.cliente_id,
  c.nombre as cliente,
  t.responsable_id,
  m.nombre as responsable,
  t.estatus,
  t.prioridad,
  t.fecha_entrega,
  (public.hoy_mx() - t.fecha_entrega) as dias_vencida
from public.tareas t
join public.clientes c on c.id = t.cliente_id
left join public.miembros m on m.id = t.responsable_id
where t.estatus <> 'Terminado'
  and t.fecha_entrega < public.hoy_mx();

revoke all on public.v_tareas_mes, public.v_horas_mes, public.v_tareas_vencidas from anon;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
alter table public.tareas            replica identity full;
alter table public.comentarios_tarea replica identity full;
alter table public.registros_tiempo  replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.tareas,
      public.comentarios_tarea,
      public.registros_tiempo,
      public.clientes,
      public.miembros;
  end if;
end;
$$;
