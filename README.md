
# Basecamp Torices

Tablero de tareas estilo Monday para el equipo de Desarrollo Web de Grupo Torices.

**Stack:** Next.js (App Router) + TypeScript + Tailwind · Supabase (Postgres, Auth, Realtime) · Vercel.

---

## 1. Requisitos

- Node.js 20 o superior
- Una cuenta en [Supabase](https://supabase.com) y otra en [Vercel](https://vercel.com)
- Acceso a [Google Cloud Console](https://console.cloud.google.com) para crear el cliente OAuth

## 2. Crear el proyecto en Supabase

1. En Supabase, crea un proyecto nuevo (región sugerida: `us-east-1` o la más cercana).
2. Copia de **Project Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (secreta, solo servidor)

## 3. Aplicar las migraciones

Antes de aplicar, **revisa el correo del admin inicial** en
`supabase/migrations/20261012000002_admin_inicial.sql`. Debe ser la cuenta de Google con la que vas a entrar.

**Opción A: Supabase CLI (recomendada)**

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push
```

**Opción B: SQL Editor**

Abre el SQL Editor de Supabase y ejecuta, en orden, cada archivo de `supabase/migrations/`.

> `supabase/seed.sql` contiene datos de ejemplo y solo se usa en local (`npx supabase db reset`). No lo ejecutes en producción.

## 4. Login con Google

1. **Google Cloud Console → APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**
   - Tipo: *Aplicación web*
   - *Orígenes de JavaScript autorizados*: `http://localhost:3000` y, después, tu dominio de Vercel
   - *URI de redireccionamiento autorizados*: `https://TU-PROYECTO.supabase.co/auth/v1/callback`
   - Si la pantalla de consentimiento es "Externa", agrega a los correos del equipo como usuarios de prueba o publícala.
2. **Supabase → Authentication → Sign In / Providers → Google**: actívalo y pega el *Client ID* y el *Client Secret*.
3. **Supabase → Authentication → URL Configuration**:
   - *Site URL*: `http://localhost:3000` (en producción, tu dominio de Vercel)
   - *Redirect URLs*: `http://localhost:3000/auth/callback` y `https://TU-DOMINIO.vercel.app/auth/callback`

### ¿Quién puede entrar?

Solo los correos que existan (y estén activos) en la tabla `miembros`. El flujo es:

1. La persona inicia sesión con Google.
2. `/auth/callback` llama a la función `vincular_miembro()`, que liga su cuenta con su fila en `miembros` usando el correo.
3. Si el correo no está registrado, la sesión se cierra y aparece "Acceso no autorizado".
4. Además, todas las tablas tienen **Row Level Security**: aunque alguien tuviera sesión, sin ser miembro no ve ni modifica nada.

Para dar de alta a alguien: entra como admin → **Equipo** → *Agregar miembro* (nombre, correo de Google y rol).

## 5. Correr en local

```bash
cp .env.example .env.local   # y llena las 3 variables
npm install
npm run dev
```

Abre <http://localhost:3000>.

## 6. Deploy en Vercel

1. En Vercel: **Add New → Project → Import** el repo `BasecampTorices`. El framework se detecta solo (Next.js).
2. En **Environment Variables** agrega `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` (Production, Preview y Development).
3. Deploy.
4. Con el dominio final (ej. `basecamp-torices.vercel.app`):
   - Supabase → *URL Configuration*: cambia *Site URL* al dominio y agrega `https://basecamp-torices.vercel.app/auth/callback` en *Redirect URLs*.
   - Google Cloud → agrega el dominio en *Orígenes de JavaScript autorizados*.
5. Entra con tu cuenta de admin y da de alta al equipo en **Equipo**.

---

## Modelo de datos

| Tabla | Para qué |
|---|---|
| `clientes` | Catálogo de clientes (nombre único, dominio, activo) |
| `miembros` | Equipo. `auth_user_id` se liga al primer login; `rol` admin/miembro; `alias` para importaciones |
| `tareas` | La tarea. Estatus y prioridad son enums; `fecha_cierre` se llena sola al pasar a *Terminado* |
| `comentarios_tarea` | Hilo de comentarios de cada tarea |
| `registros_tiempo` | Temporizador y captura manual. `minutos` se calcula con un trigger; un solo temporizador activo por persona |
| `historial` | Un renglón por campo modificado; lo llena un trigger en cada cambio de `tareas` |
| `importaciones` | Lotes de importación (preparado para la pantalla de importación) |

Vistas para el dashboard: `v_tareas_mes`, `v_horas_mes`, `v_tareas_vencidas` (usan `security_invoker`, así que respetan RLS).

### Permisos (RLS)

| | Leer | Crear / editar | Borrar |
|---|---|---|---|
| tareas, clientes | miembros | miembros | **solo admin** |
| miembros | miembros | **solo admin** | **solo admin** |
| comentarios, registros de tiempo | miembros | el autor (o admin) | el autor (o admin) |
| historial | miembros | solo el trigger | nadie |

### Importación (preparada, sin pantalla todavía)

El modelo ya soporta una futura pantalla que mapee las columnas **Cliente, Tarea, Responsable, Estatus, Prioridad, QA, Fecha de Entrega, Comentarios, Documento**:

- **Cliente** → `clientes.nombre` (índice único sin distinguir mayúsculas; se puede crear si no existe).
- **Responsable** → `miembros.nombre` o cualquier valor de `miembros.alias`.
- **Estatus / Prioridad** → los valores exactos de los enums.
- Cada importación crea una fila en `importaciones` y marca sus tareas con `import_lote_id`, así un lote se puede revisar o deshacer completo.
- Las constantes de columnas están en `src/types/db.ts` (`COLUMNAS_IMPORTACION`).

## Estructura

```
src/
  app/
    login/              Pantalla de login con Google
    auth/callback/      Intercambio de código + validación de miembro
    (app)/              Rutas protegidas: tabla, kanban, mis-tareas, responsables, dashboard, clientes, equipo
    api/reporte/        Exportación CSV
  components/           UI (tabla, kanban, panel de detalle, filtros, temporizador…)
  lib/                  Clientes de Supabase, sesión, utilidades
  types/db.ts           Tipos del modelo
supabase/
  migrations/           Esquema SQL versionado
  seed.sql              Datos de ejemplo para desarrollo local
```

---

## Cómo probar cada etapa

**1. Esquema y auth**
- Entra con tu cuenta de Google (la del admin inicial): debes llegar a la Tabla.
- Entra con una cuenta que no esté en `miembros`: debe aparecer "Tu correo no está registrado".
- En Supabase → Table Editor verás tu fila de `miembros` con `auth_user_id` lleno.

**2. Tabla y CRUD**
- Catálogos → Clientes: crea 2 o 3 clientes. Catálogos → Equipo: da de alta a Sebastián y Patrick con su correo de Google.
- En la Tabla, usa *Agregar tarea* dentro de un cliente o el botón *Nueva tarea*.
- Edita en línea el título, responsable, estatus, prioridad, QA, fechas, proyecto y comentarios. Recarga la página y comprueba que todo se guardó.
- Botón *Abrir* → panel lateral. El botón de borrar solo lo ve un admin.

**3. Kanban, filtros y realtime**
- Kanban: arrastra una tarjeta a *Terminado*; la fecha de cierre se llena sola.
- Prueba cada filtro y la búsqueda. La URL guarda los filtros, así que puedes compartir el enlace.
- Abre la app en dos navegadores con dos usuarios: lo que mueve uno aparece en el otro sin recargar. El punto verde junto al logo indica que Realtime está conectado.

**4. Tiempo e historial**
- Panel → Tiempo: *Iniciar*. Aparece la barra flotante con el cronómetro; *Detener* guarda los minutos.
- Captura manual: fecha, horas y minutos.
- Panel → Historial: cada cambio aparece con quién, cuándo, el valor anterior y el nuevo.
- Panel → Comentarios: escribe y comprueba que el otro usuario lo ve.
- Panel → Archivos: sube un PDF/imagen (o arrástralo), agrega un link, ábrelo, descárgalo y quítalo. Debe aparecer en Historial.

**5. Dashboard y CSV**
- Dashboard: cambia de mes y revisa las gráficas y las vencidas.
- *CSV*: descarga el reporte de todas las personas o de una sola. Se abre bien en Excel, con acentos.

**6. Producción**
- Sigue la sección *Deploy en Vercel* y repite las pruebas de la etapa 1 con el dominio final.

## Notas técnicas

- **Realtime**: la migración agrega `tareas`, `comentarios_tarea`, `registros_tiempo`, `clientes` y `miembros` a la publicación `supabase_realtime`. Si no ves cambios en vivo, revisa *Database → Publications* en Supabase.
- **Borrados en vivo**: Supabase no filtra eventos DELETE por columna. Por eso un comentario borrado por otra persona desaparece hasta que recargas el panel; las tareas borradas sí desaparecen al instante.
- **Archivos adjuntos**: la migración `20261019000001_adjuntos_tarea.sql` crea la tabla `adjuntos_tarea` y el bucket privado `adjuntos` de Storage (50 MB por archivo). Los archivos se guardan como `{tarea_id}/{uuid}-{nombre}` y se abren con URLs firmadas de 10 minutos. Cualquier miembro sube y ve; cada quien quita lo suyo (admin, todo). Al borrar una tarea se limpian sus archivos de Storage.
- **Zona horaria**: "hoy", las vencidas y los meses se calculan en `America/Mexico_City`.
- `SUPABASE_SERVICE_ROLE_KEY` hoy solo la usa el helper `supabaseAdmin()`, que queda listo para la futura importación masiva.
