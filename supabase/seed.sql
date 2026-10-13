-- Datos de ejemplo SOLO para desarrollo local (`supabase db reset`).
-- No se ejecuta en producción.
insert into public.miembros (nombre, correo, rol, alias) values
  ('Sebastián', 'sebastian@example.com', 'miembro', array['Sebastián', 'Sebastian']),
  ('Patrick',   'patrick@example.com',   'miembro', array['Patrick'])
on conflict (correo) do nothing;

insert into public.clientes (nombre, dominio) values
  ('Grupo Torices', 'grupotorices.com'),
  ('Cliente Demo',  'demo.com')
on conflict do nothing;

insert into public.tareas (cliente_id, titulo, responsable_id, estatus, prioridad, fecha_entrega, proyecto)
select c.id, t.titulo, m.id, t.estatus::public.estatus_tarea, t.prioridad::public.prioridad_tarea,
       current_date + t.dias, t.proyecto
from (values
  ('Grupo Torices', 'Migrar sitio al nuevo VPS', 'saul.omar.gtorices@gmail.com', 'En Proceso', 'Alta', 5, 'Migración VPS'),
  ('Grupo Torices', 'Configurar certificados SSL', 'sebastian@example.com', 'Backlog', 'Media', 10, 'Migración VPS'),
  ('Cliente Demo',  'Rediseño de home', 'patrick@example.com', 'En QA', 'Urgente', -2, null),
  ('Cliente Demo',  'Actualizar plugins', 'sebastian@example.com', 'On hold - tarea continua', 'Baja', null, null)
) as t(cliente, titulo, correo, estatus, prioridad, dias, proyecto)
join public.clientes c on c.nombre = t.cliente
join public.miembros m on m.correo = t.correo;
