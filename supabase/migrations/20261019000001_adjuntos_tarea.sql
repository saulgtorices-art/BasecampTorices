-- =====================================================================
-- Basecamp Torices · Adjuntos de tareas
-- Varios archivos (Supabase Storage) y links por tarea.
-- =====================================================================

create table public.adjuntos_tarea (
  id         uuid primary key default gen_random_uuid(),
  tarea_id   uuid not null references public.tareas (id) on delete cascade,
  miembro_id uuid references public.miembros (id) on delete set null,
  tipo       text not null check (tipo in ('archivo', 'link')),
  nombre     text not null check (length(trim(nombre)) > 0),
  -- archivo: ruta dentro del bucket "adjuntos" ({tarea_id}/{uuid}-{nombre})
  ruta       text unique,
  -- link: URL externa (Drive, Figma, Notion…)
  url        text,
  mime       text,
  tamano     bigint check (tamano is null or tamano >= 0),
  created_at timestamptz not null default now(),
  check (
    (tipo = 'archivo' and ruta is not null and url is null)
    or (tipo = 'link' and url is not null and ruta is null)
  )
);
create index adjuntos_tarea_idx on public.adjuntos_tarea (tarea_id, created_at);

-- ---------------------------------------------------------------------
-- RLS: miembros leen; cada quien sube a su nombre y borra lo suyo (admin, todo).
-- ---------------------------------------------------------------------
alter table public.adjuntos_tarea enable row level security;

create policy adjuntos_select on public.adjuntos_tarea for select to authenticated
  using (public.es_miembro());
create policy adjuntos_insert on public.adjuntos_tarea for insert to authenticated
  with check (public.es_miembro() and miembro_id = public.miembro_actual_id());
create policy adjuntos_update on public.adjuntos_tarea for update to authenticated
  using (miembro_id = public.miembro_actual_id() or public.es_admin())
  with check (miembro_id = public.miembro_actual_id() or public.es_admin());
create policy adjuntos_delete on public.adjuntos_tarea for delete to authenticated
  using (miembro_id = public.miembro_actual_id() or public.es_admin());

revoke all on public.adjuntos_tarea from anon;

-- ---------------------------------------------------------------------
-- Historial: registra cuando se agrega o quita un adjunto.
-- ---------------------------------------------------------------------
create or replace function public.adjuntos_registrar_historial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.historial (tarea_id, miembro_id, campo, valor_anterior, valor_nuevo)
    values (new.tarea_id, public.miembro_actual_id(), 'adjunto', null, new.nombre);
    return new;
  end if;

  -- Si la tarea se está borrando (cascade) no hay a quién registrarlo.
  if exists (select 1 from public.tareas where id = old.tarea_id) then
    insert into public.historial (tarea_id, miembro_id, campo, valor_anterior, valor_nuevo)
    values (old.tarea_id, public.miembro_actual_id(), 'adjunto', old.nombre, null);
  end if;
  return old;
end;
$$;

create trigger adjuntos_registrar_historial
after insert or delete on public.adjuntos_tarea
for each row execute function public.adjuntos_registrar_historial();

-- ---------------------------------------------------------------------
-- Storage: bucket privado "adjuntos" (50 MB por archivo).
-- Los archivos se abren con URLs firmadas temporales.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('adjuntos', 'adjuntos', false, 52428800)
on conflict (id) do nothing;

create policy adjuntos_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'adjuntos' and public.es_miembro());
create policy adjuntos_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'adjuntos' and public.es_miembro());
create policy adjuntos_storage_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'adjuntos'
    and (owner_id = (select auth.uid())::text or public.es_admin())
  );

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
alter table public.adjuntos_tarea replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.adjuntos_tarea;
  end if;
end;
$$;
