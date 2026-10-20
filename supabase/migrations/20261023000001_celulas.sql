-- =====================================================================
-- Basecamp Torices · Células de trabajo
-- Cada célula tiene un área, un Team Leader (coordinador, rol admin) y sus
-- integrantes. Alimenta el dashboard "Mi célula" donde el líder ve y
-- clasifica las tareas de su equipo.
-- =====================================================================

create table public.celulas (
  id         uuid primary key default gen_random_uuid(),
  numero     integer not null unique check (numero > 0),
  nombre     text not null check (length(trim(nombre)) > 0),
  area       text not null default '',
  lider_id   uuid references public.miembros (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.miembros
  add column if not exists celula_id uuid references public.celulas (id) on delete set null;
create index if not exists miembros_celula_idx on public.miembros (celula_id);

-- ---------------------------------------------------------------------
-- RLS: todos los miembros leen; solo admin gestiona.
-- ---------------------------------------------------------------------
alter table public.celulas enable row level security;

create policy celulas_select on public.celulas for select to authenticated using (public.es_miembro());
create policy celulas_insert on public.celulas for insert to authenticated with check (public.es_admin());
create policy celulas_update on public.celulas for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy celulas_delete on public.celulas for delete to authenticated using (public.es_admin());

revoke all on public.celulas from anon;

-- ---------------------------------------------------------------------
-- Células iniciales
-- ---------------------------------------------------------------------
insert into public.celulas (numero, nombre, area) values
  (1, 'Célula 1', 'Web/SEO & Paid Media'),
  (2, 'Célula 2', 'Web/SEO & Paid Media'),
  (3, 'Célula 3', 'Diseño Multimedia'),
  (4, 'Célula 4', 'Desarrollo Web')
on conflict (numero) do nothing;

-- ---------------------------------------------------------------------
-- Asignación inicial del equipo.
-- Se liga a los miembros que YA existan, buscando nombre Y apellido
-- (sin acentos) en `nombre` o en `alias`. Quien aún no esté dado de alta
-- se asigna después desde Equipo → columna "Célula".
-- Los Team Leaders quedan como admin y como líder de su célula.
-- El puesto solo se llena si estaba vacío.
-- ---------------------------------------------------------------------
create temporary table _equipo (celula integer, nombre text, apellido text, puesto text, lider boolean);

insert into _equipo values
  (1, 'alejandra', 'ortega',     'Team Leader Digital',            true),
  (1, 'karina',    'colmenares', 'SEO Content',                    false),
  (2, 'yuridia',   'avelino',    'Team Leader Digital',            true),
  (2, 'eduardo',   'ojeda',      'SEO Jr.',                        false),
  (2, 'manuel',    'chavez',     'SEO Content',                    false),
  (2, 'julio',     'morales',    'SEO Content',                    false),
  (3, 'viridiana', 'ramirez',    'Creative Team Leader',           true),
  (3, 'erick',     'meneses',    'Diseñador Multimedia',           false),
  (3, 'vladimir',  'romero',     'Editor de Video',                false),
  (3, 'yanni',     'reyes',      'Diseñadora Multimedia',          false),
  (3, 'david',     'alvarez',    'Content / Copy',                 false),
  (3, 'ana',       'ortega',     'Community Manager (Bec.)',       false),
  (3, 'fatima',    'martinez',   'Community Manager (Bec.)',       false),
  (4, 'saul',      'sanchez',    'Team Leader de Desarrollo Web',  true),
  (4, 'isabella',  'lutz',       'UX/UI',                          false),
  (4, 'sebastian', 'ramos',      'Desarrollo Web',                 false);

create temporary table _match as
select e.*, m.id as miembro_id
  from _equipo e
  join public.miembros m
    on exists (
         select 1
           from unnest(array_append(m.alias, m.nombre)) as n (txt)
          cross join lateral (
            select lower(translate(n.txt, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')) as t
          ) x
          where x.t ~ ('\m' || e.nombre || '\M')
            and x.t ~ ('\m' || e.apellido || '\M')
       );

update public.miembros m
   set celula_id = c.id,
       puesto    = coalesce(nullif(trim(m.puesto), ''), x.puesto),
       rol       = case when x.lider then 'admin'::public.rol_miembro else m.rol end
  from _match x
  join public.celulas c on c.numero = x.celula
 where m.id = x.miembro_id;

update public.celulas c
   set lider_id = x.miembro_id
  from _match x
 where x.lider and c.numero = x.celula and c.lider_id is null;

do $$
declare
  v_ok integer;
  v_faltan text;
begin
  select count(distinct miembro_id) into v_ok from _match;
  select string_agg(initcap(e.nombre || ' ' || e.apellido), ', ') into v_faltan
    from _equipo e
   where not exists (select 1 from _match x where x.celula = e.celula and x.nombre = e.nombre and x.apellido = e.apellido);
  raise notice 'Células: % personas asignadas. Sin dar de alta: %', v_ok, coalesce(v_faltan, 'ninguna');
end;
$$;

drop table _match;
drop table _equipo;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
alter table public.celulas replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.celulas;
  end if;
end;
$$;
