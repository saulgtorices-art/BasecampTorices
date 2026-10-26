# Grupo Torices · Marketing

Tablero de tareas estilo Monday para el equipo de Marketing de Grupo Torices.

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
   Para las auditorías UX/UI agrega también `PAGESPEED_API_KEY` y `ANTHROPIC_API_KEY` (ver *Notas técnicas*).
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
| `auditorias` | Auditorías UX/UI por cliente: estado, puntaje, calificación, resultado (jsonb) y capturas |
| `auditoria_tareas` | Liga cada hallazgo de una auditoría con la tarea que se creó a partir de él |

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
- Panel → Comentarios (chat): escribe, pega una captura con Ctrl+V, arrastra una imagen, menciona con @ y responde un mensaje. El otro usuario lo ve al instante.
- Tickets: levanta uno como miembro (con captura pegada); como admin conviértelo en tarea, termínala y revisa que el ticket quede *Resuelto* y que a quien lo pidió le llegue el aviso.
- Notificaciones: menciona a alguien, asígnale una tarea o cámbiale el estatus; debe ver la campanita con contador y, si activó los avisos del navegador, una notificación aunque esté en otra pestaña.
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
- **Chat y notificaciones**: la migración `20261020000001_chat_notificaciones.sql` agrega a `comentarios_tarea` las columnas `adjuntos` (evidencias en `{tarea_id}/comentarios/` del bucket `adjuntos`), `respuesta_a` y `menciones`, y crea `notificaciones`. Los avisos los generan triggers (mención, asignación, cambio de estatus) y la función `generar_avisos_vencidas()`, que la app llama al cargar (un aviso por tarea vencida, sin cron).
- **Tickets**: la migración `20261021000001_tickets.sql` crea `tickets` y `comentarios_ticket`. Urgencia con SLA (Urgente 4 h, Alta 1 día, Media 3 días, Baja 1 semana). Admin o el asignado lo convierte en tarea con `convertir_ticket_en_tarea()` (hereda título, urgencia, descripción y evidencias); al terminar la tarea el ticket pasa a *Resuelto* solo, y si se reabre vuelve a *Aceptado*. Avisa a admins del ticket nuevo y a quien lo pidió de cada cambio.
- **Células y "Mi célula"**: la migración `20261023000001_celulas.sql` crea `celulas` (número, área, líder) y agrega `miembros.celula_id`. Da de alta las 4 células y asigna a quien ya exista en `miembros` buscando nombre **y** apellido (sin acentos) en `nombre` o `alias`; los Team Leaders quedan como admin y líderes. Al aplicarla, un `NOTICE` lista a quién no encontró: dalos de alta en **Equipo** y elige su célula en la columna *Célula* (el líder se cambia en las tarjetas de células). La pantalla **Mi célula** (solo admin) muestra indicadores, la carga por integrante y la tabla/kanban de tareas del equipo, que se puede agrupar por integrante, estatus, prioridad o cliente y filtrar con vistas rápidas (vencidas, vencen en 7 días, urgentes, sin fecha, en QA).
- **Zona horaria**: "hoy", las vencidas y los meses se calculan en `America/Mexico_City`.
- `SUPABASE_SERVICE_ROLE_KEY` la usa el helper `supabaseAdmin()`: hoy para que las auditorías UX/UI guarden su resultado en segundo plano, y queda lista para la futura importación masiva.
- **Auditorías UX/UI**: la migración `20261026000001_auditorias_ux.sql` crea `auditorias` y `auditoria_tareas`. Se lanzan desde **Clientes** (botón *Auditar*, usa el dominio) o desde **Auditorías UX/UI** (permite una URL específica). `POST /api/auditorias` crea la fila, responde de inmediato y sigue con `after()` (hasta 300 s, `maxDuration`):
  1. Descarga el HTML (bloquea IPs privadas y valida cada redirección) y revisa hasta 6 páginas del menú, `robots.txt`, `sitemap.xml` y la redirección http→https.
  2. Corre PageSpeed Insights en móvil y escritorio: puntajes de Lighthouse, Core Web Vitals de usuarios reales (CrUX) y las capturas del primer pantallazo.
  3. Evalúa 39 checks deterministas (`src/lib/auditoria/checks.ts`). Puntaje sobre 100: UX 40, UI 35, Responsive 10, Accesibilidad 10, Técnico 5. Cada categoría = puntos obtenidos ÷ puntos evaluables × su peso; los checks sin datos no cuentan. Calificación: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 55, F.
  4. Claude redacta resumen, veredictos por categoría, observaciones sobre las capturas (no suman puntos), próximos pasos y lagunas. **La IA no cambia los puntajes.** Sin `ANTHROPIC_API_KEY` el reporte sale igual con textos base.

  Variables: `PAGESPEED_API_KEY` (Google Cloud → habilita *PageSpeed Insights API* → crea una API key; sin ella la cuota es muy baja), `ANTHROPIC_API_KEY` y, opcional, `ANTHROPIC_MODEL` (por defecto `claude-sonnet-5-5`). Desde cada hallazgo, quick win o paso se crea una tarea del cliente (proyecto *Auditoría UX/UI*, prioridad según severidad) y queda ligada para no duplicarla. Al volver a auditar, el reporte compara contra la auditoría anterior (puntos y hallazgos resueltos o nuevos). *Imprimir / PDF* usa el diálogo del navegador. Pendiente para una fase 2: Search Console, GA4 y Clarity, y capturas con Chromium propio (touch targets a 375 px).
