# MSV Auditor: módulo de competidores y recomendaciones

## Contexto

MSV Auditor es la herramienta SEO interna de una agencia: una cartera de sitios de clientes y un equipo de usuarios con roles (admin y otros).

- Ya existe: conexión a Google Search Console con una cuenta de servicio, y la pantalla "Palabras clave" que compara dos periodos y explica las caídas con la "auditoría MSV".
- Está desplegada en Vercel. El framework, la base de datos, el ORM y la autenticación no se confirman aquí: averígualos en el repo.
- La agencia tiene cuenta de Semrush.
- Sitio de prueba: acerostorices.com (aceros, México). Todo el texto de la interfaz va en español de México.

## Objetivo del módulo

Agregar a cada sitio de la cartera una sección "Competidores y oportunidades" que pase de diagnosticar a decir qué hacer. Para cada palabra clave importante, compara la página del cliente contra las que están arriba y entrega tareas concretas, ordenadas por impacto, con seguimiento del resultado.

El usuario debe poder:

- Ver qué palabras conviene atacar primero, con datos reales de Search Console.
- Registrar competidores a mano y ver los que Semrush detecta.
- Comparar su página contra el top 5 de una palabra: contenido, datos estructurados, autoridad y velocidad.
- Recibir una lista de tareas redactadas y priorizadas, con el código o texto listo cuando aplique.
- Marcar tareas como hechas y ver si la posición mejoró después.

```
Search Console ─┐
Semrush API ────┤
Páginas top 5 ──┼──> Análisis (fases 1–4) ──> Recomendaciones IA (fase 5)
PageSpeed API ──┘                                        │
      ▲                                                  ▼
      └──── mide el resultado ── Seguimiento (fase 6) <── Tareas del equipo
```

Las fases 1 a 4 calculan; la IA solo redacta y prioriza; el seguimiento cierra el ciclo volviendo a Search Console.

## Antes de escribir código: revisar el repo

No escribas nada hasta entender cómo está hecho lo que ya existe. Revisa y resume en 10 líneas o menos:

- Framework, estructura de carpetas, base de datos, ORM y cómo se corren las migraciones.
- Cómo se autentica a Search Console y dónde se guardan los datos descargados en "Palabras clave".
- Cómo funciona la "auditoría MSV" y dónde se guardan sus hallazgos.
- Componentes de interfaz y estilos que ya se usan (tema oscuro, botones, tablas). El módulo nuevo debe verse igual.
- Variables de entorno existentes y cómo se manejan los trabajos largos (Vercel corta funciones que tardan demasiado).

Después propone un plan corto para la fase pedida y espera mi visto bueno.

## Fase 1: competidores por palabra clave

El usuario elige palabras clave objetivo y ve quién está arriba de él en cada una.

### Palabras objetivo

- Pantalla para marcar palabras como "objetivo" desde la tabla de Search Console, o agregarlas a mano.
- Bloque de ganancias rápidas: palabras con posición media entre 4 y 20 y muchas impresiones. Ordénalas por clics potenciales: `impresiones × (CTR esperado del top 3 − CTR actual)`. Deja la tabla de CTR por posición como configuración editable.

### Competidores

- Por sitio: el usuario agrega dominios competidores a mano.
- Por palabra: traer los 10 primeros resultados de Google desde la API de Semrush (reporte de resultados por frase) para la base de datos de México (`mx`).
- Sugerir competidores: dominios que aparecen en el top 10 de varias palabras objetivo. El usuario decide si los agrega.
- Guardar cada consulta con su fecha. No volver a pedirla a Semrush si tiene menos de 7 días, salvo que el usuario pulse "Actualizar".

## Fase 2: comparación de contenido

Para una palabra objetivo, compara la página del cliente que posiciona (la URL que da Search Console) contra las 5 primeras del top 10.

### Qué extraer de cada URL

| Dato | Cómo |
|---|---|
| Title y meta description | HTML |
| H1, H2 y H3 en orden | HTML |
| Número de palabras del contenido principal | HTML, sin menú ni pie |
| Imágenes y cuántas tienen alt | HTML |
| Enlaces internos y externos | HTML |
| Preguntas que responde (encabezados con "?") | HTML |
| Velocidad: LCP, CLS, INP y puntaje móvil | API de PageSpeed Insights (gratis, con clave de Google) |
| Dominios que enlazan al dominio | API de Semrush (backlinks) |

### Cómo leer las páginas

- Primero fetch normal con un User-Agent propio (`MSV-Auditor`). Si el contenido viene vacío o el schema se carga con JavaScript, usar un navegador sin interfaz (Playwright o Puppeteer con Chromium para serverless).
- Respetar robots.txt, máximo 1 petición por segundo por dominio, y guardar el HTML 7 días.
- Si una página bloquea, marcarla como "no se pudo leer" y seguir con las demás.

### Qué muestra la pantalla

Una tabla lado a lado (cliente vs. competidores) y una lista de huecos: temas o encabezados que tienen 3 o más competidores y el cliente no, y diferencias grandes de longitud o velocidad.

## Fase 3: datos estructurados

Lee el schema de la página del cliente y de los competidores, compara tipos y campos, filtra lo que Google ya no usa y genera el JSON-LD que falta.

### 1. Leer

- Extraer todos los bloques `<script type="application/ld+json">`. Aceptar objeto, lista o `@graph` (así lo ponen Yoast y RankMath).
- También detectar microdatos (`itemscope`/`itemprop`). En Python existe extruct; en Node, buscar una librería equivalente o parsear con cheerio.
- Si no aparece schema con fetch, reintentar con navegador sin interfaz, porque algunos sitios lo meten desde Tag Manager.

### 2. Comparar

Tabla de tipos (Product, Offer, LocalBusiness, Organization, BreadcrumbList, etc.) × páginas. En cada celda: si existe y qué campos importantes llena (por ejemplo, Offer con `price`, `priceCurrency` y `availability`).

### 3. Filtrar con reglas de Google

Guarda las reglas en un archivo de configuración con fecha de última revisión, no en el código de la lógica. Al inicio:

| Tipo | Recomendar | Motivo |
|---|---|---|
| Product + Offer | Sí | Precio y disponibilidad en resultados |
| LocalBusiness / Organization | Sí | Datos del negocio y panel |
| BreadcrumbList | Sí | Ruta en el resultado |
| FAQPage | No, solo informar | Desde 2023 Google lo muestra solo a sitios de gobierno y salud |
| HowTo | No | Google dejó de mostrarlo |
| Review / AggregateRating sobre el propio negocio | No | Reseñas propias no son elegibles para estrellas |

Antes de cerrar esta fase, verifica estas reglas contra la documentación actual de Google Search Central y corrige la tabla si algo cambió.

### 4. Generar

- Con los tipos recomendados que faltan, generar el JSON-LD con los datos reales del sitio (nombre, dirección, teléfono, precios). Lo que no se sepa se deja como campo vacío marcado para llenar, nunca inventado.
- Botón "Copiar código" y enlace a la Prueba de resultados enriquecidos de Google para validar antes de publicar.

## Fase 4: keyword research de competidores con Semrush

Descubrir palabras por las que posicionan los competidores y el cliente no.

- Palabras de cada competidor: palabras orgánicas del dominio o de una URL concreta, base `mx`, con posición, volumen, dificultad y URL que posiciona.
- Brecha: palabras donde 2 o más competidores están en el top 20 y el cliente no aparece o está debajo de 20.
- Agrupar las palabras por tema (por ejemplo, "lámina galvanizada", "perfiles PTR", "varilla") y sugerir si cada grupo se ataca con una página existente o con una nueva.
- Columnas de la tabla: palabra, volumen, dificultad, competidores que la tienen y en qué posición, posición del cliente, página sugerida.

### Costo de la API

- La API de Semrush cobra por unidad y no todos los planes la incluyen. Antes de programar, revisa en la documentación de Semrush qué reportes se necesitan y cuánto cuesta cada uno.
- Poner límites: máximo de filas por consulta (empieza con 100), caché de 7 días y un contador de unidades gastadas por sitio y por mes, visible para el admin.
- La clave va en una variable de entorno (`SEMRUSH_API_KEY`), nunca en el código ni en el navegador.

## Fase 5: recomendaciones priorizadas con IA

Convertir los datos de las fases 1 a 4 en tareas concretas, usando la API de Claude (modelo `claude-sonnet-5-5`).

### Cómo armarlo

- La IA no inventa datos: recibe en JSON lo que ya se calculó (posiciones, huecos, schema faltante, brecha de palabras) y solo redacta y prioriza.
- Pedir la respuesta en JSON con este formato por tarea: título, tipo (contenido, técnico, schema, nueva página, enlaces), URL afectada, palabra clave, por qué (con el dato que lo respalda), qué hacer paso a paso, entregable listo (title nuevo, meta, esquema de H2, JSON-LD) y esfuerzo estimado (bajo, medio, alto).
- El impacto se calcula en código, no con la IA: clics potenciales de la Fase 1 para palabras existentes, y `volumen × CTR esperado del top 3` para palabras nuevas.
- Orden final: impacto alto y esfuerzo bajo primero.
- Validar el JSON de respuesta con un esquema (por ejemplo, zod) y reintentar una vez si viene mal.
- Guardar cada recomendación con los datos de entrada que la generaron, para poder explicar de dónde salió.
- La clave va en una variable de entorno (`ANTHROPIC_API_KEY`).

Tono: español de México, directo, sin relleno. Cada tarea la debe poder hacer alguien del equipo sin preguntar nada más.

## Fase 6: seguimiento de tareas

Demostrar con datos si cada tarea funcionó.

- Estados de tarea: Pendiente, En proceso, Hecha, Descartada. Responsable (usuario del equipo) y fecha límite opcional.
- Al marcar "Hecha", guardar la fecha y la posición, clics e impresiones de esa palabra en los 28 días anteriores.
- A los 28 y 56 días, comparar contra Search Console y mostrar el cambio en la tarea: posición antes/después, clics antes/después.
- Resumen por sitio: tareas hechas en el mes y clics ganados atribuibles. Aclarar en la interfaz que es una estimación, porque otras cosas también mueven las posiciones.
- Exportar a CSV para reportes al cliente.

## Reglas generales

- Una fase por entrega, en su propia rama (`feat/competidores-fase-N`). Al terminar cada una: migraciones, pruebas de la lógica principal, un resumen de qué cambió y un pull request. **No hagas merge a `main` sin mi visto bueno.**
- Todas las llamadas a APIs externas (Semrush, PageSpeed, Claude) y la lectura de páginas van del lado del servidor, con caché y manejo de errores visible para el usuario.
- Trabajos largos (leer 6 páginas, consultar Semrush) en segundo plano con estado "procesando", sin bloquear la pantalla.
- Mismo diseño que el resto de MSV Auditor: tema oscuro, mismos componentes, textos en español.
- Permisos: solo los usuarios con acceso al sitio ven sus datos; solo admin ve el gasto de API.
- Nada de datos inventados. Si falta un dato, se muestra "sin dato" y se explica por qué.
- Si una variable de entorno nueva hace falta, agrégala a `.env.example` y dime cuál debo configurar en Vercel.

## Criterios de aceptación con acerostorices.com

- [ ] Aparecen las ganancias rápidas a partir de los datos de Search Console.
- [ ] Para una palabra objetivo se ve el top 10 de Google México y se pueden comparar 5 competidores.
- [ ] La tabla de datos estructurados muestra tipos y campos de cada página y genera el JSON-LD faltante, que pasa la Prueba de resultados enriquecidos.
- [ ] La brecha de palabras lista al menos las 20 más valiosas, agrupadas por tema.
- [ ] Se generan tareas con impacto, esfuerzo y entregable listo.
- [ ] Una tarea marcada como hecha muestra su comparación a los 28 días.
- [ ] El contador de unidades de Semrush coincide con lo que reporta Semrush.
