-- =====================================================================
-- Basecamp Torices · Auditorías UX/UI
-- Cada auditoría revisa una URL de un cliente:
--   · PageSpeed Insights (Lighthouse + datos de campo CrUX), móvil y escritorio
--   · Revisión del HTML (estructura, accesibilidad, CTAs, técnico)
--   · Redacción con IA (veredictos, próximos pasos, lagunas)
-- El resultado completo vive en `resultado` (jsonb) y las capturas en
-- `capturas` para no cargarlas en los listados.
-- Desde cada hallazgo se puede crear una tarea; el vínculo queda en
-- `auditoria_tareas` para no duplicarla.
-- =====================================================================

create type public.estado_auditoria as enum ('en_proceso', 'lista', 'error');

create table public.auditorias (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references public.clientes (id) on delete cascade,
  url          text not null check (url ~* '^https?://'),
  estado       public.estado_auditoria not null default 'en_proceso',
  -- Paso actual mientras corre ("Consultando PageSpeed…").
  progreso     text,
  puntaje      numeric(5, 1) check (puntaje is null or puntaje between 0 and 100),
  calificacion text check (calificacion is null or calificacion in ('A', 'B', 'C', 'D', 'F')),
  -- { ux: { obtenido, maximo }, ui: …, responsive: …, accesibilidad: …, tecnico: … }
  puntajes     jsonb,
  resultado    jsonb,
  capturas     jsonb,
  error        text,
  creado_por   uuid references public.miembros (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  terminado_at timestamptz
);
create index auditorias_cliente_idx on public.auditorias (cliente_id, created_at desc);
create index auditorias_fecha_idx   on public.auditorias (created_at desc);

create or replace function public.auditorias_antes_guardar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.estado <> 'en_proceso' and old.estado = 'en_proceso' then
    new.terminado_at := coalesce(new.terminado_at, now());
  end if;
  return new;
end;
$$;

create trigger auditorias_antes_guardar
  before insert or update on public.auditorias
  for each row execute function public.auditorias_antes_guardar();

create table public.auditoria_tareas (
  auditoria_id uuid not null references public.auditorias (id) on delete cascade,
  hallazgo_id  text not null,
  tarea_id     uuid not null references public.tareas (id) on delete cascade,
  creado_por   uuid references public.miembros (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (auditoria_id, hallazgo_id)
);
create index auditoria_tareas_tarea_idx on public.auditoria_tareas (tarea_id);

-- ---------------------------------------------------------------------
-- RLS: cualquier miembro genera y consulta auditorías; solo admin borra.
-- El trabajo en segundo plano escribe con la service role (ignora RLS).
-- ---------------------------------------------------------------------
alter table public.auditorias       enable row level security;
alter table public.auditoria_tareas enable row level security;

create policy auditorias_select on public.auditorias for select to authenticated using (public.es_miembro());
create policy auditorias_insert on public.auditorias for insert to authenticated
  with check (public.es_miembro() and creado_por = public.miembro_actual_id());
create policy auditorias_update on public.auditorias for update to authenticated
  using (public.es_miembro()) with check (public.es_miembro());
create policy auditorias_delete on public.auditorias for delete to authenticated using (public.es_admin());

create policy auditoria_tareas_select on public.auditoria_tareas for select to authenticated using (public.es_miembro());
create policy auditoria_tareas_insert on public.auditoria_tareas for insert to authenticated
  with check (public.es_miembro() and creado_por = public.miembro_actual_id());
create policy auditoria_tareas_delete on public.auditoria_tareas for delete to authenticated using (public.es_miembro());

revoke all on public.auditorias       from anon;
revoke all on public.auditoria_tareas from anon;
