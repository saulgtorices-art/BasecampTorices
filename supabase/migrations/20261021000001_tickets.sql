-- =====================================================================
-- Basecamp Torices · Tickets (solicitudes de trabajo)
-- Cualquiera levanta un ticket con urgencia y SLA; admin o el asignado lo
-- revisa, lo convierte en tarea o lo rechaza. Al terminar la tarea, el
-- ticket se resuelve solo. Requiere 20261020000001_chat_notificaciones.sql.
-- =====================================================================

create type public.estado_ticket as enum ('Nuevo', 'En revisión', 'Aceptado', 'Rechazado', 'Resuelto');

-- Horas de SLA por urgencia.
create or replace function public.horas_sla(p public.prioridad_tarea)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p
    when 'Urgente' then 4
    when 'Alta'    then 24
    when 'Media'   then 72
    else 168
  end;
$$;

create table public.tickets (
  id             uuid primary key default gen_random_uuid(),
  numero         integer generated always as identity unique,
  titulo         text not null check (length(trim(titulo)) > 0),
  descripcion    text not null default '',
  cliente_id     uuid references public.clientes (id) on delete set null,
  categoria      text not null default 'Soporte'
                 check (categoria in ('Soporte', 'Bug', 'Nueva función', 'Contenido', 'Diseño', 'Otro')),
  urgencia       public.prioridad_tarea not null default 'Media',
  estado         public.estado_ticket not null default 'Nuevo',
  solicitante_id uuid references public.miembros (id) on delete set null,
  asignado_id    uuid references public.miembros (id) on delete set null,
  tarea_id       uuid unique references public.tareas (id) on delete set null,
  -- [{ "ruta": "...", "nombre": "...", "mime": "...", "tamano": 123 }]
  adjuntos       jsonb not null default '[]'::jsonb,
  motivo_rechazo text,
  vence_at       timestamptz,
  primera_respuesta_at timestamptz,
  resuelto_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index tickets_estado_idx      on public.tickets (estado, urgencia);
create index tickets_solicitante_idx on public.tickets (solicitante_id);
create index tickets_asignado_idx    on public.tickets (asignado_id);

create table public.comentarios_ticket (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.tickets (id) on delete cascade,
  miembro_id uuid references public.miembros (id) on delete set null,
  texto      text not null check (length(trim(texto)) > 0),
  created_at timestamptz not null default now()
);
create index comentarios_ticket_idx on public.comentarios_ticket (ticket_id, created_at);

-- ---------------------------------------------------------------------
-- Reglas automáticas del ticket
-- ---------------------------------------------------------------------
create or replace function public.tickets_antes_guardar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.solicitante_id := coalesce(new.solicitante_id, public.miembro_actual_id());
    new.created_at := coalesce(new.created_at, now());
  end if;
  new.updated_at := now();

  -- SLA: se calcula desde la creación según la urgencia.
  if tg_op = 'INSERT' or new.urgencia is distinct from old.urgencia then
    new.vence_at := new.created_at + make_interval(hours => public.horas_sla(new.urgencia));
  end if;

  -- Primera respuesta: la primera vez que sale de "Nuevo".
  if tg_op = 'UPDATE' and old.estado = 'Nuevo' and new.estado <> 'Nuevo' then
    new.primera_respuesta_at := coalesce(new.primera_respuesta_at, now());
  end if;

  if new.estado in ('Resuelto', 'Rechazado') then
    if tg_op = 'INSERT' or old.estado is distinct from new.estado then
      new.resuelto_at := now();
    end if;
  else
    new.resuelto_at := null;
  end if;

  if new.estado <> 'Rechazado' then
    new.motivo_rechazo := null;
  end if;

  return new;
end;
$$;

create trigger tickets_antes_guardar
before insert or update on public.tickets
for each row execute function public.tickets_antes_guardar();

-- La tarea ligada manda: terminada -> ticket resuelto; reabierta -> aceptado.
create or replace function public.tareas_sincronizar_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estatus is distinct from old.estatus then
    if new.estatus = 'Terminado' then
      update public.tickets set estado = 'Resuelto'
       where tarea_id = new.id and estado = 'Aceptado';
    elsif old.estatus = 'Terminado' then
      update public.tickets set estado = 'Aceptado'
       where tarea_id = new.id and estado = 'Resuelto';
    end if;
  end if;
  return new;
end;
$$;

create trigger tareas_sincronizar_ticket
after update of estatus on public.tareas
for each row execute function public.tareas_sincronizar_ticket();

-- Convierte el ticket en tarea (admin o asignado). Devuelve el id de la tarea.
create or replace function public.convertir_ticket_en_tarea(
  p_ticket uuid,
  p_responsable uuid,
  p_cliente uuid,
  p_fecha_entrega date
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.tickets;
  v_tarea uuid;
begin
  select * into t from public.tickets where id = p_ticket for update;
  if not found then
    raise exception 'El ticket no existe.';
  end if;
  if not (public.es_admin() or t.asignado_id = public.miembro_actual_id()) then
    raise exception 'Solo un admin o la persona asignada puede convertir el ticket.';
  end if;
  if t.tarea_id is not null then
    return t.tarea_id;
  end if;
  if coalesce(p_cliente, t.cliente_id) is null then
    raise exception 'Elige un cliente para la tarea.';
  end if;

  insert into public.tareas (cliente_id, titulo, responsable_id, estatus, prioridad,
                             fecha_inicio, fecha_entrega, comentarios, proyecto, creado_por)
  values (
    coalesce(p_cliente, t.cliente_id),
    t.titulo,
    coalesce(p_responsable, t.asignado_id),
    'Backlog',
    t.urgencia,
    public.hoy_mx(),
    coalesce(p_fecha_entrega, (t.vence_at at time zone 'America/Mexico_City')::date),
    nullif(trim('Ticket TK-' || lpad(t.numero::text, 4, '0') || E'\n\n' || t.descripcion), ''),
    null,
    public.miembro_actual_id()
  )
  returning id into v_tarea;

  update public.tickets
     set tarea_id = v_tarea,
         estado = 'Aceptado',
         cliente_id = coalesce(p_cliente, cliente_id),
         asignado_id = coalesce(p_responsable, asignado_id)
   where id = p_ticket;

  -- Las evidencias del ticket pasan como adjuntos de la tarea.
  insert into public.adjuntos_tarea (tarea_id, miembro_id, tipo, nombre, ruta, mime, tamano)
  select v_tarea, t.solicitante_id, 'archivo', a ->> 'nombre', a ->> 'ruta', a ->> 'mime', (a ->> 'tamano')::bigint
    from jsonb_array_elements(t.adjuntos) a
  on conflict (ruta) do nothing;

  return v_tarea;
end;
$$;

revoke execute on function public.convertir_ticket_en_tarea(uuid, uuid, uuid, date) from anon, public;
grant execute on function public.convertir_ticket_en_tarea(uuid, uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- Notificaciones de tickets
-- ---------------------------------------------------------------------
alter table public.notificaciones
  add column ticket_id uuid references public.tickets (id) on delete cascade;
alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;
alter table public.notificaciones
  add constraint notificaciones_tipo_check
  check (tipo in ('mencion', 'asignacion', 'estatus', 'vencida', 'ticket'));

create or replace function public.folio_ticket(n integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'TK-' || lpad(n::text, 4, '0');
$$;

create or replace function public.notificar_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.miembro_actual_id();
  v_folio text := public.folio_ticket(new.numero);
begin
  if tg_op = 'INSERT' then
    -- A todos los admins (y al asignado, si viene) les llega el ticket nuevo.
    insert into public.notificaciones (miembro_id, actor_id, ticket_id, tipo, texto)
    select m.id, v_actor, new.id, 'ticket',
           'levantó el ticket ' || v_folio || ' [' || new.urgencia || ']: ' || new.titulo
      from public.miembros m
     where m.activo
       and (m.rol = 'admin' or m.id = new.asignado_id)
       and m.id is distinct from v_actor;
    return new;
  end if;

  -- (Al convertir en tarea ya le llega "te asignó la tarea"; no duplicamos.)
  if new.asignado_id is not null
     and new.asignado_id is distinct from old.asignado_id
     and new.asignado_id is distinct from v_actor
     and new.tarea_id is not distinct from old.tarea_id then
    insert into public.notificaciones (miembro_id, actor_id, ticket_id, tipo, texto)
    values (new.asignado_id, v_actor, new.id, 'ticket',
            'te asignó el ticket ' || v_folio || ' [' || new.urgencia || ']: ' || new.titulo);
  end if;

  if new.estado is distinct from old.estado
     and new.solicitante_id is not null
     and new.solicitante_id is distinct from v_actor then
    insert into public.notificaciones (miembro_id, actor_id, ticket_id, tarea_id, tipo, texto)
    values (new.solicitante_id, v_actor, new.id, new.tarea_id, 'ticket',
            case new.estado
              when 'Aceptado'  then case when old.estado = 'Resuelto'
                                         then 'reabrió tu ticket ' || v_folio || ': ' || new.titulo
                                         else 'aceptó tu ticket ' || v_folio || ' y ya es una tarea: ' || new.titulo end
              when 'Rechazado' then 'rechazó tu ticket ' || v_folio || coalesce(': ' || new.motivo_rechazo, '')
              when 'Resuelto'  then 'resolvió tu ticket ' || v_folio || ': ' || new.titulo
              else 'pasó tu ticket ' || v_folio || ' a ' || new.estado
            end);
  end if;

  if new.urgencia is distinct from old.urgencia
     and new.asignado_id is not null
     and new.asignado_id is distinct from v_actor then
    insert into public.notificaciones (miembro_id, actor_id, ticket_id, tipo, texto)
    values (new.asignado_id, v_actor, new.id, 'ticket',
            'cambió la urgencia de ' || v_folio || ' a ' || new.urgencia);
  end if;

  return new;
end;
$$;

create trigger tickets_notificar
after insert or update on public.tickets
for each row execute function public.notificar_ticket();

create or replace function public.notificar_comentario_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tickets;
begin
  select * into t from public.tickets where id = new.ticket_id;
  insert into public.notificaciones (miembro_id, actor_id, ticket_id, tipo, texto)
  select distinct x.id, new.miembro_id, t.id, 'ticket',
         'comentó en ' || public.folio_ticket(t.numero) || ': ' ||
         case when length(new.texto) > 100 then left(new.texto, 100) || '…' else new.texto end
    from (values (t.solicitante_id), (t.asignado_id)) as x (id)
   where x.id is not null and x.id is distinct from new.miembro_id;
  return new;
end;
$$;

create trigger comentarios_ticket_notificar
after insert on public.comentarios_ticket
for each row execute function public.notificar_comentario_ticket();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.tickets            enable row level security;
alter table public.comentarios_ticket enable row level security;

create policy tickets_select on public.tickets for select to authenticated
  using (public.es_miembro());
create policy tickets_insert on public.tickets for insert to authenticated
  with check (public.es_miembro() and solicitante_id = public.miembro_actual_id());
-- Editan: admin, el asignado y quien lo pidió.
create policy tickets_update on public.tickets for update to authenticated
  using (public.es_admin() or asignado_id = public.miembro_actual_id() or solicitante_id = public.miembro_actual_id())
  with check (public.es_miembro());
create policy tickets_delete on public.tickets for delete to authenticated
  using (public.es_admin());

create policy comentarios_ticket_select on public.comentarios_ticket for select to authenticated
  using (public.es_miembro());
create policy comentarios_ticket_insert on public.comentarios_ticket for insert to authenticated
  with check (public.es_miembro() and miembro_id = public.miembro_actual_id());
create policy comentarios_ticket_delete on public.comentarios_ticket for delete to authenticated
  using (miembro_id = public.miembro_actual_id() or public.es_admin());

revoke all on public.tickets, public.comentarios_ticket from anon;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
alter table public.tickets            replica identity full;
alter table public.comentarios_ticket replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tickets, public.comentarios_ticket;
  end if;
end;
$$;
