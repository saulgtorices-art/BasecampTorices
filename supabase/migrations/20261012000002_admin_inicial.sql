-- Administrador inicial. Cambia el correo si usarás otra cuenta de Google.
-- El resto del equipo se da de alta desde la pantalla "Equipo" (solo admin).
insert into public.miembros (nombre, correo, rol, alias)
values ('Saúl', 'saul.omar.gtorices@gmail.com', 'admin', array['Saúl', 'Saul', 'Saúl Pedroza'])
on conflict (correo) do nothing;
