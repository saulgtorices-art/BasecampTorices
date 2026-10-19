-- =====================================================================
-- Perfil de miembro: foto, puesto y teléfono editables por cada usuario.
-- =====================================================================

alter table public.miembros
  add column if not exists foto_url text,
  add column if not exists puesto   text,
  add column if not exists telefono text;

-- Cada quien edita SOLO estos campos de su propia fila (no rol, correo ni activo).
-- Se usa una función security definer para no abrir la política de update.
create or replace function public.actualizar_mi_perfil(
  p_nombre   text,
  p_puesto   text,
  p_telefono text,
  p_foto_url text
)
returns public.miembros
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fila public.miembros;
begin
  if length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'El nombre no puede quedar vacío.';
  end if;

  update public.miembros
     set nombre   = trim(p_nombre),
         puesto   = nullif(trim(coalesce(p_puesto, '')), ''),
         telefono = nullif(trim(coalesce(p_telefono, '')), ''),
         foto_url = nullif(trim(coalesce(p_foto_url, '')), '')
   where auth_user_id = auth.uid() and activo
  returning * into v_fila;

  if v_fila.id is null then
    raise exception 'No autorizado.';
  end if;
  return v_fila;
end;
$$;

revoke all on function public.actualizar_mi_perfil(text, text, text, text) from public, anon;
grant execute on function public.actualizar_mi_perfil(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Storage: bucket público "avatares" (2 MB, solo imágenes).
-- Ruta: {miembro_id}/{archivo}. Cada quien sube/borra solo en su carpeta.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 2097152,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy avatares_select on storage.objects for select to authenticated
  using (bucket_id = 'avatares');
create policy avatares_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = public.miembro_actual_id()::text
  );
create policy avatares_update on storage.objects for update to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = public.miembro_actual_id()::text
  );
create policy avatares_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatares'
    and ((storage.foldername(name))[1] = public.miembro_actual_id()::text or public.es_admin())
  );
