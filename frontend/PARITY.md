# PARITY — migración de UI al sistema de diseño del modo live (bloque 26)

Rama `ui/migration` (worktree `../Pit_Wall_ui`), base `2bd9d6e` = `refs/heads/main` del remoto
(el ref local `origin/main` apuntaba al viejo `Main`: choque de mayúsculas en macOS).
Solo `frontend/`. Sin push ni deploy (bloque 26b).

Este archivo es también el **estado de trabajo**: si se corta el contexto, se retoma desde aquí.

## Estado por fase

| Fase | Estado | Commit |
|---|---|---|
| 0 Inventario y línea base | hecho | 12582a5 |
| 1 Sistema de diseño (components/ui/) | hecho | 6fb9788 |
| 2 Shell y transiciones | hecho | 96c6d52, f18393d, e91c08e |
| 3 Pantalla de carga | hecho | f9d3ca6, 5754fc9 |
| 4 Landing, selector, popover | hecho | 9ddb3ba, 16726b8, 0c30de2, 0991bcb |
| 5 Análisis módulo a módulo | hecho | 75dca06…be66c39 (un commit por módulo; tabla de la fase 5) |
| 6 Telemetría | hecho | db2002b…9184214 |
| 7 Race Engineer | hecho | b85ed9c…19b371d |
| 8 Settings, Docs, ProWall, estados | hecho | dfd3441…ed096ee |
| 9 Auditoría de paridad | hecho | c0676d6…60d5bef |

## Línea base (main @ 2bd9d6e)

| | |
|---|---|
| vitest | 9 archivos, **99 tests**, todos en verde |
| tsc --noEmit | limpio |
| backend pytest | **471 passed, 28 skipped** (venv fuera de iCloud, ver abajo) |
| next build | ok; tabla de tamaños abajo |

Bundle por ruta (First Load JS, build de main):

| Ruta | Size | First Load |
|---|---|---|
| / | 1.56 kB | 157 kB |
| /_not-found | 873 B | 88.2 kB |
| /docs | 191 B | 105 kB |
| /live/[sessionKey] | 13.2 kB | 152 kB |
| /race/[sessionKey] | 1.3 kB | 201 kB |
| /settings | 2.18 kB | 107 kB |
| (compartido) | | 87.3 kB |

## Cómo se verifica

Herramientas en `frontend/scripts/` (Playwright **no** está en package.json: se carga de
`~/.pitwall-ui-tools`, `@playwright/test@1.63`, que coincide con el Chromium 1243 ya cacheado).

- **R** `node scripts/reachability.mjs` — grafo de imports desde cada ruta de `app/`.
- **F** `node scripts/parity/fields.mjs` — cobertura de campos de `/analysis` (léxica).
- **S** `node scripts/parity/screens.mjs --base … --out …` — capturas 1440 y 390 px de cada
  escenario y vista de `scripts/parity/scenarios.mjs`.
- **T** `node scripts/parity/parity_diff.mjs --base … --out x.json` y `--compare a.json b.json`
  — textos visibles por vista, más cada desplegable y cada tarjeta de piloto.
- **I** interacción Playwright (fase 9).
- **U** test unitario (vitest).

Los builds se compilan con `NEXT_PUBLIC_API_URL=http://pw-api.test` (siempre interceptado) y
`NEXT_PUBLIC_LIVE_URL=http://127.0.0.1:8099`. Todas las respuestas salen de fixtures en
`~/.pitwall-ui-baseline/fixtures/`, grabadas una vez del backend local (con un código PRO de
prueba solo en el entorno del proceso; nada de eso está en el repo), así que el build viejo y
el nuevo ven los mismos bytes. Los estados difíciles (425, 429, 503, 500, offline, módulos
failed / not_applicable, chat rate-limited, chat offline, carga lenta) se escenifican en
`scenarios.mjs`. El "chat con respuesta" es una respuesta real de Ollama (llama3.1:8b) grabada.
Capturas y JSON de la base: `~/.pitwall-ui-baseline/` (fuera del repo: binarios).

Sesiones: **9636** São Paulo 2024 (mojada, roja, SC, telemetría), **9539** España 2024,
**11377** Bakú 2026 (PRO, sin telemetría), **11240** China 2026 Sprint (PRO, sin telemetría).
No hay en caché ningún análisis de clasificación ni de libres: sus layouts (rama
`Qualifying`/`Practice` de las pestañas) no tienen línea base visual; ver hallazgos.

Estados de fila: `pendiente` · `en curso` · `verificado` · `descartado: <motivo>`.

## Sistema de diseño (fase 1)

`components/ui/` — copiado de `components/live/dashboard/live.module.css` (no se modifica ni se
importa: live lo adoptará en otro bloque). Mismos nombres de variable `--pw-*`, así una primitiva
se ve igual bajo la raíz del shell y bajo la del dashboard live.

| Pieza | De dónde sale en live | Archivo |
|---|---|---|
| Tokens (oscuro y claro), foco visible, gutter responsive | `.root`, `.root[data-theme=light]`, `:focus-visible` | ui.module.css, Root.tsx (`PwRoot`) |
| Panel y cabecera de panel, rejilla de celdas con reglas de 2 px | `.panel` `.secHead` `.h6` `.secAside` `.foot` `.cells` `.cell` | Panel.tsx (`Panel`, `Cells`, `Empty`) |
| Métrica | `Kpi` (`.label` `.big` `.sub`) | Metric.tsx |
| Badge, estado de módulo, confianza | chips, `ConfDots` | Badge.tsx (`Badge`, `StatusBadge`, `ConfidenceBadge`) |
| Banner | `StatusStrip` (`.strip` `.stripBad` `.blinker`) | Banner.tsx |
| Filas de tabla | `TimingTable` (`.tHead` `.th` `.tRow` `.td`) | Table.tsx (`DataTable`, `Row`, `Cell`) |
| Esqueleto | (nuevo, en superficie; nunca datos falsos) | Skeleton.tsx |
| Popover (clic/tap/teclado, Escape, fuera, ARIA) | (nuevo; sustituye el tip por hover) | Popover.tsx |
| Botón, segmentado, pestañas, cabecera de página | `.btn` `.seg` `.tabs` `.tab` `Header` | Controls.tsx, PageHeader.tsx |

Tokens añadidos respecto a live (allí eran literales): `--pw-blue` (#4da3ff, compuesto WET /
bandera azul), `--pw-amber` (avisos que no deben leerse como bandera amarilla), `--pw-gutter`.
Decisión: la app sigue en fondo oscuro; los tokens llevan el claro pero no se añade un selector de
tema (sería una feature nueva). Tests: `components/ui/ui.test.tsx` (12).

## Fase 2 — notas

- Transición: `@keyframes pwEnter` (opacity 0→1, translateY 8px→0), 180 ms, sin retardo, en el
  `<main>` de la página (el TopBar no parpadea). En navegador: contenido en el DOM a los 18 ms de
  una navegación cliente; `animation-name: none` con reduced-motion y en /live.
- Tests eliminados con la animación de apertura (`components/brand/IntroAnimation.test.tsx`, 11):
  prefers-reduced-motion › renders a short fade instead of nothing at all (Block 25);
  › never scales the car — only opacity, via the reduced-fade keyframe; › is shorter than the full
  animation; › marks the session seen once the fade completes — it did play something; › is
  skippable like the full animation; › does not show the full zoom animation instead;
  first visit of the session › renders on the first visit (no prior sessionStorage flag);
  › does not render at all on a second mount within the same session; › marks the session as seen
  once the animation completes; skippable › a click immediately marks it seen and removes the
  overlay; › a keypress also skips it.
- grep de `IntroAnimation|CarSilhouette|RaceStartLoader|pwGoFlash|pwIntroReducedFade|pwiq_intro_seen|
  start-lights|loader-preview|sessionStorage` en app, components, lib, hooks, stores, public, docs y
  README: cero. Solo `scripts/parity/lib.mjs` conserva `pwiq_intro_seen`, para silenciar la intro
  del build **viejo** al capturar la base.
- Suite: 108 tests (99 − 11 + 12 ui + 8 transición). El shell monta `next/font`: vitest usa un stub
  (`test/next-font-stub.ts`).

## Fase 3 — diagnóstico de la pantalla de carga (navegador real, `scripts/parity/diagnose_loading.mjs`)

Muestreo cada 100 ms de `/race/9636` contra fixtures, sobre el build de main (:3100) y el nuevo (:3000).

| Caso | main (antes) | nuevo |
|---|---|---|
| (b) caché caliente, 150 ms | loader a ~120 ms, análisis a 722 ms: **parpadeo** (+400 ms de espera artificial tras la respuesta) | solo el shell (margen de 300 ms), análisis a 368-513 ms, sin loader |
| (a) caché fría, 7,5 s | loader → análisis a 8,07 s | margen → loader a ~470 ms → análisis a 7,7 s |
| (c) backend dormido, 30 s | loader 30 s; los pasos "acaban" a ~11 s y se quedan ahí 19 s | loader → "Waking up the analysis server…" a 8,2 s → análisis a 30,4 s |
| respuesta a 60 s | loader indefinido | "Waking…" a 8 s → error "No answer from the analysis server" con Retry a 45,5 s (petición abortada) |
| (d) 402 / 425 | ProWall / "Session still in live window" a ~120-150 ms | igual |
| **clic en una tarjeta de la landing, servidor de Next lento (3 s)** | **3 s con la landing en pantalla y ningún cambio**; luego el loader | margen de 300 ms → loader en `/` a +300 ms → llega la ruta y el mismo loader sigue (reloj 00:03) |

**Causa de "no aparece nada"**: no estaba en el loader de `/analysis` (ése aparece a ~120 ms en
carga directa), sino **antes**: `/race/[sessionKey]` es una ruta dinámica (ƒ); en una navegación
cliente Next espera la respuesta RSC del servidor (en Netlify, una función que puede estar fría)
antes de pintar nada, y la ruta no tenía `loading.tsx` ni estado pendiente. Durante ese tiempo la
página anterior seguía en pantalla sin ninguna señal de que el clic hubiera hecho algo. Un
`loading.tsx` solo no lo arregla (medido: sin prefetch, Next también espera al servidor para el
boundary); se añade, y además el clic marca la navegación pendiente (`lib/raceNav.ts`) y el shell
muestra el loader al instante con el mismo reloj (`lib/loadPhase.ts`).

Otros cambios: los pasos son decorativos y así consta en el código (avanzan por tiempo y se
quedan uno antes del último; sin ✓ de "hecho"); la barra sigue `0,94·(1−e^(−t/10))` y nunca
completa; el reloj es real; el copy no da cifras (antes: "8 strategic modules"); se quita la
espera artificial de 400 ms; `fetchAnalysis` acepta un `AbortSignal` (sin cambio de contrato).

## Fase 4 — landing y selector

- La landing adopta la vista de temporada del `/preview` (cuadrícula de Grandes Premios) además
  del selector clásico ("Any session": cualquier sesión, `.ics`, prefetch de telemetría) y las
  tarjetas destacadas. Las celdas "Live now / Next session" del /preview no se añaden (serían
  feature nueva; el popover del TopBar cubre lo mismo).
- Años: `seasonYears()` (año actual → 2023), ya derivados del año actual en main. La cuadrícula
  abre la última temporada libre sin PRO y la actual con PRO.
- Tarea 3 del 26b (vista de temporada 2026):
  - Ronda en orden cronológico ascendente, sin pretemporada: **hecho** (Round 01 = Melbourne).
  - "N grands prix" sin los tests: **hecho** (2026: 25 en vez de 27; 2024: 24).
  - Nombre: OpenF1 da `meeting_name` "Bahrain Grand Prix" y `country_name` "Bahrain" para Kuala
    Lumpur. La celda usa `location ?? circuit_short_name` (hoy "Kuala Lumpur") y ya no muestra
    ni el país ni el nombre del GP. `location` llega de `/races` desde `ops/races-meta` (26d).
  - "Cancelled" sin enlace y ronda sin canceladas: **hecho (26d, parte C)** — `/races` expone
    `is_cancelled` desde `ops/races-meta`. Sakhir y Jeddah 2026 son celdas sin botón ni enlace,
    sin número de ronda; Miami Gardens pasa a ser la ronda 04. Cabecera: "N grands prix · 2
    cancelled". Verificado con `test/fixtures/races_2026.json` (respuesta real del backend nuevo)
    en `components/landing/SeasonGrid.test.tsx`. Con un backend antiguo (sin los campos) la vista
    queda como antes.
- First Load JS de `/`: 157 kB → 119 kB (sin framer-motion en la landing).
- Corrección: `AddToCalendarButton` también lo pinta `/live` (NotLiveYet). El restilado de la fase 4
  cambiaba /live; ahora el aspecto clásico es el valor por defecto y las páginas migradas piden
  `variant="system"`. Componentes compartidos con /live a vigilar en lo que queda: `ProWall` (402
  de /live), `ConfidenceChip`, `charts/LapCharts`, `NotifyButton` — no se restilan in situ.

## Fase 5 — análisis

Verificación por módulo: build nuevo, `screens.mjs --only race-9636` (y la sesión que lo pinte),
`parity_diff --shallow` contra la base (solo vistas principales; desplegables y tarjetas en la
fase 9). Diferencias aceptadas: el separador `›` del breadcrumb (ahora `/` por CSS).

| Módulo | Commit | Diferencias de texto |
|---|---|---|
| Marco (cabecera, pestañas, Strategy/Data, foco, contenedores) | 75dca06 | `›` decorativo |
| ModuleUnavailable | 2010449 | ninguna |
| Race Brain | ee04661 | ninguna |
| Race DNA | d513c4c | ninguna (sin la celda vacía) |
| True Pace podio + MethodologyBadge + EstimatedLabel | eaa7d3b | ninguna; confianza "High" → "High confidence" (contiene el texto) |
| Key Decisions | fdbe490 | ninguna |
| Tyre Cliff Map | 23ac107 | ninguna |
| Pit Sequence | 55fde5d | ninguna |
| DRS Train Detector | ef640b7 | ninguna |
| Clean Air Value | f39e00a | "estimated…" y "estimated from pace comparison…" ya no van pegados en una línea |
| Meteo (WeatherOverlay) | 48541fe | ninguna (9636, 11377) |
| Crossovers | e6bf1fe | ninguna; el aviso de SC concurrente sigue siempre visible |
| Weather winners & losers | eb511e8 | ninguna (9636 lo tiene not_applicable) |
| Chaos Profile | 5eef952 | ninguna |
| Engineer Signals (resumen) | f229b6d | ninguna |
| Data View (índice, volver, secciones) | 9f4d8fa | ninguna |
| True Pace (tabla) | 17703f0 | confianza abreviada `HIG`/`MED` → "High/Medium confidence" (más legible) |
| Clasificación | af2fab2 | ninguna |
| Degradación (tabla) | 06ddffe | ninguna |
| Pit impact (tabla) | 788ba53 | "23.4slane" → "23.4s lane" (antes pegado por un margen CSS) |
| Engineer notes (lista) | 5adc33d | ninguna |
| Chaos Index | 3d148b7 | ninguna |
| Decisiones (timeline) | c28d12c | confianza abreviada → palabra completa |
| Exclusion log | 213c5aa | ninguna |
| Race Phase Timeline | 0a9ccd5 | ninguna; segmentos enfocables por teclado (antes solo hover) |
| Session / Race Timeline | be66c39 | ninguna; marcadores enfocables por teclado |
| Lap charts | — | `charts/LapCharts` lo comparte /live: no se restila; solo su contenedor (75dca06) |

## Fase 9 — auditoría de paridad

**Textos** (`parity_diff`, base vs nuevo, mismas fixtures):
- Volcado profundo de las 4 carreras (296 vistas base / 350 nuevas, con cada desplegable y cada
  tarjeta de piloto, 79 tarjetas) más el superficial de todo lo demás (65 vistas).
- Cero textos de datos perdidos. Diferencias, todas justificadas:
  - `›` del breadcrumb → separador `/` dibujado por CSS.
  - Glifos decorativos ⬤ ○ ◯ ● → cuadrados CSS.
  - `HIG`/`MED`/`LOW` → confianza con la palabra completa ("High confidence").
  - "23.4slane" y "estimated…estimated from pace…" → los mismos textos, ya no pegados por un margen CSS.
  - Claves de vista "PRE 20"/"POST 14" → "Pre 20"/"Post 14" (la base las ponía en mayúsculas por CSS).
  - "▼ Show N more trains" ausente en la vista "Show methodology" de Tyre & Pit: artefacto del
    volcado (varias "Show methodology" comparten clave; en la nueva la última se captura con el tren
    desplegado). El texto está en la vista base de la pestaña.
- Arreglado en el script durante la auditoría: abrir un clip de radio añadía botones y desplazaba
  los índices de los desplegables pendientes; ahora se reabre la página si cambia el número de
  controles.

**Capturas**: 135 en `~/.pitwall-ui-baseline/screens/after` (misma matriz que la base, 128 + chat con
citas); 0 pasos fallidos (la base fallaba 9 en 390 px).

**Interacciones** (`scripts/parity/interactions.mjs`): 31/31 — replay (play, pausa, scrub por teclado y
puntero, velocidad, modo de vuelta, comparación), chat (respuesta, confianza, citas, rate-limit, Escape),
radios (lista, un solo audio a la vez, clip muerto, Escape), selector (desplegables y cuadrícula),
Settings (código malo, código bueno, toggle sin cerrar sesión, sign out), descarga del `.ics`.

**Suites**: vitest 15 archivos / 139 tests (base: 9 / 99; −11 de la animación eliminada, listados en
la fase 2); tsc limpio; `next build` limpio; backend **471 passed, 28 skipped**, idéntico a la base.

**Bundle (First Load JS)**:

| Ruta | Base | Nuevo |
|---|---|---|
| / | 157 kB | 120 kB |
| /race/[sessionKey] | 201 kB | 162 kB |
| /docs | 105 kB | 112 kB |
| /settings | 107 kB | 114 kB |
| /live/[sessionKey] | 152 kB | 158 kB |
| /_not-found | 88.2 kB | 88.9 kB |
| compartido | 87.3 kB | 87.3 kB |

Las rutas de texto y /live suben 6-7 kB: el shell lleva el loader de análisis (navegación pendiente,
fase 3) y el Popover. Cargarlo en diferido retrasaría el loader inmediato, que es lo que arregla la
fase 3; se acepta.

**LCP / CLS** (`scripts/parity/lcp.mjs`, CPU ×4, mediana de 5-7 cargas): landing 232 → 228 ms, CLS 0
→ 0; /race/9636 924 → 528 ms, CLS 0 → 0. La auditoría encontró y corrigió tres regresiones antes de
cerrar: la transición de entrada empezaba la primera página en opacidad 0 (LCP 460 ms; ahora no se
aplica a la primera página del documento, sí a las navegaciones), la reserva del loader dejaba el pie
a la vista (CLS 0,062) y la cuadrícula de temporada empujaba la sección siguiente al llegar (CLS
0,051; ahora reserva altura mientras carga).

**Teclado y contraste** (`scripts/parity/a11y.mjs`, axe-core 4.14 y 40 Tabs por página): en /, /race,
/settings y /docs, a 1440 y 390 px — contraste base 34 / 71 / 6 / 10 fallos → 0 en todas; violaciones
serias → 0; foco visible en todas las paradas (0 sin indicador). Para llegar a 0: el rojo de acento
con texto blanco no llegaba a 4,5:1 → token nuevo `--pw-accent-strong` (#cc2810) solo para fondos
sólidos; "Live · PRO" sin opacidad y con nombre accesible que contiene su texto; enlaces del pie
subrayados; segmentos y marcadores de las líneas de tiempo con `role="img"`.

## Inventario (alcanzable desde app/ en main)

### Shell y global

| Feature | Componente viejo | Componente nuevo | Cómo se verifica | Estado |
|---|---|---|---|---|
| TopBar: logo, PRO badge, breadcrumb, Historical/Live, Docs, botón Engineer | layout/TopBar | layout/TopBar + shell.module.css | S todas; U TopBar.test (12, sin cambios); 390 px sin desbordar | verificado |
| Popover "próxima sesión" (hover hoy) con Notify | layout/TopBar | layout/TopBar + ui/Popover, con "Add to calendar" (.ics) y Notify | U TopBar.test (5 nuevos: clic no hover, Escape+foco, fuera, .ics, sin promesas); navegador: Enter y tap abren, Escape devuelve el foco, en 390 px el panel se recoloca dentro (x=8) | verificado |
| Footer (aviso legal, Docs, atribución LinkedIn/CV en home) | layout/SiteFooter | layout/SiteFooter (mismo texto y enlaces) | S landing, todas | verificado |
| AppShell (estructura, main) | layout/AppShell | layout/AppShell sobre `PwRoot` | S todas; scrollWidth 390 en /, /docs, /settings, /race (base: 492-530) | verificado |
| Animación de apertura (coche) | brand/IntroAnimation + brand/CarSilhouette | app/template.tsx (transición de entrada) | grep cero refs en app/components/lib/hooks/stores/public/docs; U template.test (8) | descartado: eliminada por el brief; sustituta verificada |
| Race-start loader (no montado: comentado en layout) | layout/RaceStartLoader (+ public/start-lights.mp3, public/loader-preview.html) | — | R: inalcanzable; grep cero refs | descartado: eliminado por el brief (era inalcanzable) |
| Arranque de acceso PRO (estado del token) | access/AccessBootstrap | (sin cambios) | U accessStore; I canje en Settings (badge aparece y desaparece) | verificado |
| Notify me when it starts (Notification API, decisión: **se conserva restilado**) | notify/NotifyButton + NotifyWatcher | sin cambios en el componente (lo comparte /live); se estila por `className` desde el popover y el 425 | U notify; S race-425; U TopBar (sin promesas de push/e-mail) | verificado |
| Página 404 de Next | (default de Next) | app/not-found.tsx dentro del shell, mismo texto "404 · This page could not be found." + enlace a la lista | S/T not-found (0 pérdidas) | verificado |

### Landing `/`

| Feature | Componente viejo | Componente nuevo | Cómo se verifica | Estado |
|---|---|---|---|---|
| Hero, stats, tres pasos | app/page | app/page (PageHeader, Cells, Metric) | S landing; T landing: mismos textos (solo faltan glifos decorativos ⬤ ○ ◯ ●) | verificado |
| Selector temporada / GP / sesión, Analyze | landing/RaceSelector + ui/PitWallSelect | landing/RaceSelector ("Any session") + PitWallSelect restilado (misma lógica: teclado, búsqueda > 8, clic fuera) | S; T; I selector en fase 9 | verificado |
| Botón .ics en sesiones futuras del selector | ui/AddToCalendarButton | ui/AddToCalendarButton restilado (misma descarga, mismas etiquetas) | U ics + TopBar .ics; I descarga en fase 9 | verificado |
| Tarjetas destacadas (chaos, telemetría, tags) | landing/RaceSelector | landing/RaceSelector (Badges, tono por nivel de chaos) | S; T | verificado |
| Sección PRO informativa, con .ics de la próxima carrera | access/ProSection | access/ProSection restilado (mismos textos, bahías, .ics, enlace a Settings) | S landing / landing-pro; T | verificado |
| Fondo (degradado; "video" no carga vídeo) | landing/LandingVideoBackground | — | era un degradado decorativo sin contenido | descartado: el fondo del sistema nuevo es liso (componente sin uso, se queda en el repo) |

| Cuadrícula de temporada (nueva en la landing: la vista de temporada del /preview) | — | landing/SeasonGrid + lib/seasonGrid | U seasonGrid (6); S landing / landing-pro | verificado |

### Página de análisis `/race/[k]`

| Feature | Componente viejo | Componente nuevo | Cómo se verifica | Estado |
|---|---|---|---|---|
| Cabecera de carrera (chaos, pilotos, stints, nivel) | analysis/AnalysisPage | analysis/AnalysisPage (PageHeader) | S race-9636*; T shallow: sin pérdidas | verificado |
| Fases de carrera | analysis/RacePhaseTimeline | analysis/RacePhaseTimeline | S; T shallow; módulos failed/n.a. | verificado |
| Barra de sesión (sin fases) | analysis/SessionTimelineBar | analysis/SessionTimelineBar | S modules-*; T shallow | verificado |
| Carril de radios por vuelta | teamradio/TeamRadioLane + RadioClipPlayer | mismos (marcadores con aria-expanded; audioBus intacto) | S; T shallow; I un solo audio y clip muerto en fase 9 | verificado |
| Pestañas (6, con badges) | analysis/TabNav | analysis/TabNav sobre ui/Tabs | S; T shallow | verificado |
| Strategy / Data View | analysis/AnalysisModeToggle | ui/Segmented (role tablist) | S; T shallow | verificado |
| Driver focus strip | analysis/DriverFocusStrip | analysis/DriverFocusStrip | S/T driver-card-9636 ("Focused on: …" y "✕ Clear focus" presentes) | verificado |
| Race Brain | strategy/RaceBrainV2 | strategy/RaceBrainV2 (Panel, kv) | S; T shallow | verificado |
| Race DNA | analysis/RaceDNACard | analysis/RaceDNACard (kv) | S; T shallow; módulos failed/n.a. | verificado |
| True Pace (podio + clasificación modal) | strategy/TruePacePodium | strategy/TruePacePodium (botones; diálogo con Escape) | S; T shallow (expand en fase 9) | verificado |
| True Pace (tabla, traffic score) | analysis/TruePaceTable | analysis/TruePaceTable (DataTable, filas activables por teclado) | S/T data view 9636, 11240 | verificado |
| Clasificación | analysis/RaceClassificationPanel | analysis/RaceClassificationPanel (DataTable) | T shallow; modal en fase 9 | verificado |
| Degradación de neumáticos (cliff map) | strategy/TyreCliffMap | strategy/TyreCliffMap (filas botón) | S tyre-pit 9636/9539; T shallow | verificado |
| Degradación (tabla) | analysis/TyreDegradationPanel | analysis/TyreDegradationPanel (filas botón) | S/T data view | verificado |
| Pit impact (secuencia) | strategy/PitSequenceSummary | strategy/PitSequenceSummary (filas botón) | S; T shallow | verificado |
| Pit impact (tabla) | analysis/PitImpactPanel | analysis/PitImpactPanel (filas botón) | S/T data view | verificado |
| Chaos | strategy/ChaosProfile + analysis/ChaosIndexCard | strategy/ChaosProfile + analysis/ChaosIndexCard | S race-control y data view; T shallow | verificado |
| Engineer notes (resumen) | strategy/EngineerSignalSummary | strategy/EngineerSignalSummary (filtros con aria-pressed) | S; T shallow | verificado |
| Engineer notes (lista) | analysis/EngineerNotes | analysis/EngineerNotes | S/T data view, control-tables | verificado |
| Decisiones (tarjetas) | strategy/KeyDecisionCards | strategy/KeyDecisionCards | S; T shallow (expand en fase 9) | verificado |
| Decisiones (timeline) | analysis/DecisionsTimeline | analysis/DecisionsTimeline | S/T data view | verificado |
| Exclusion log | data/ExclusionLogPanel | data/ExclusionLogPanel | S/T data view | verificado |
| Data View (índice y secciones) | data/DataViewTables | data/DataViewTables (nav sticky bajo el TopBar en escritorio) | S; T shallow | verificado |
| Meteo | strategy/WeatherOverlay | strategy/WeatherOverlay | S weather 9636/11377; T shallow; módulos failed/n.a. | verificado |
| Crossovers | analysis/CrossoverWindowPanel | analysis/CrossoverWindowPanel | S; T shallow (expand en fase 9) | verificado |
| Weather winners & losers | analysis/WeatherWinnersLosers | analysis/WeatherWinnersLosers | T shallow 11377; módulos failed/n.a. | verificado |
| Tren de DRS | strategy/DRSTrainDetector | strategy/DRSTrainDetector | S tyre-pit; T shallow (expand en fase 9); módulos failed/n.a. | verificado |
| Tráfico / dirty air (clean air value) | analysis/CleanAirValueCard | analysis/CleanAirValueCard | S; T shallow; módulos failed/n.a. | verificado |
| Lap charts (4 gráficas) | tabs/LapChartsTab + charts/LapCharts | tabs/LapChartsTab (LapCharts sin cambios: compartido con /live) | S lap-charts; T shallow | verificado |
| Pestañas contenedoras | tabs/StrategyTab, ManagementTab, WeatherTab, TelemetryTab, RaceControlTab, LapChartsTab | mismos archivos (stack con reglas, Cells de 2 columnas, sin framer-motion) | S; T shallow | verificado |
| Tarjeta de piloto con radios | analysis/DriverCard | analysis/DriverCard (dialog modal, Escape, cerrar etiquetado) | S/T driver-card-9636; todas las tarjetas en fase 9 | verificado |
| ModuleUnavailable (ok / failed / not_applicable) | analysis/ModuleUnavailable | analysis/ModuleUnavailable (StatusBadge: failed sólido acento, n/a discontinuo) — adelantado de la fase 8 | S race-9636-modules-failed / -not_applicable; T shallow | verificado |
| Chips de confianza, "estimated", metodología | ui/ConfidenceChip, ui/EstimatedLabel, ui/MethodologyBadge | ui/ConfidenceBadge (ConfidenceChip queda para /live), EstimatedLabel, MethodologyBadge sobre Popover | T shallow; expand en fase 9 | verificado |
| Pantalla de carga | analysis/AnalysisLoadingScreen | analysis/AnalysisLoadingScreen + lib/loadPhase + app/race/[k]/loading.tsx + lib/raceNav | S race-loading; diagnose_loading (navegador real); U fake timers (loadPhase 5, loader 7, hook 4, AppShell 3) | verificado |
| SessionUnavailableState 425 (cuenta atrás), 404, 429, 503 | analysis/SessionUnavailableState | analysis/SessionUnavailableState + states.module.css | S/T race-425, -425-no-unlock, -404, -429, -503 (0 pérdidas) | verificado |
| Error genérico (500) y offline | app/race/[k]/page (inline) | app/race/[k]/page (role=alert, Retry/Back) | S/T race-500, race-offline (0 pérdidas) | verificado |
| ProWall (402) | access/ProWall | access/ProWall `variant="system"` en /race (el clásico sigue por defecto para /live) | S/T race-402 (0 pérdidas); I canje en fase 9 | verificado |

### Telemetría (pestaña Telemetry)

| Feature | Componente viejo | Componente nuevo | Cómo se verifica | Estado |
|---|---|---|---|---|
| Replay: mapa del circuito | CircuitTelemetryReplay/TrackReplayMap | mismo (marco, tipografía, botón 2D/3D con aria-pressed) | S tab-telemetry 9636; I en fase 9 | verificado |
| Canales (speed, throttle, brake…) | CircuitTelemetryReplay/TelemetryChannels | mismo (colores de serie intactos, marco y textos en tokens) | S; T shallow | verificado |
| G-force y diagrama GG | CircuitTelemetryReplay/GForceMeter, GGDiagram | mismos (Archivo, textos ≥11 px, sin redondeos, tokens) | S; T shallow | verificado |
| Sectores | CircuitTelemetryReplay/SectorCards | CircuitTelemetryReplay/SectorCards | S; T shallow | verificado |
| Selector de pilotos y métricas (pestañas) | CircuitTelemetryReplay/DriverSelector, MetricSelector | chips con aria-pressed; métricas y modo de vuelta en ui/Segmented | S; T shallow; I comparación en fase 9 | verificado |
| Controles: play, pausa, scrub, velocidad, vuelta | CircuitTelemetryReplay/ReplayControls + index | ReplayControls: scrub como slider (flechas, Re/Av Pág, Inicio/Fin, puntero y táctil) | I interactions.mjs: play, pausa, End/Home/flechas, scrub con puntero, velocidad, modo de vuelta, comparación | verificado |
| Sin telemetría (sesión sin precomputar / no race) | CircuitTelemetryReplay/index | mismo copy, estado del sistema | S race-11377-pro/tab-telemetry; T shallow | verificado |

### Race Engineer (chat)

| Feature | Componente viejo | Componente nuevo | Cómo se verifica | Estado |
|---|---|---|---|---|
| Overlay: apertura, preguntas sugeridas, envío | radio/RadioOverlay | radio/RadioOverlay (dialog modal con nombre, feed aria-live) | S/T chat-answer (0 pérdidas); en 390 px ya se abre (en la base no) | verificado |
| Citas (cited signals) y confianza | radio/RadioOverlay | ConfidenceBadge + citas | S/T chat-cited, chat-answer | verificado |
| Rate-limit (cuenta atrás, input bloqueado) | radio/RadioOverlay | igual (mensaje con role=status) | S/T chat-rate-limited | verificado |
| Offline (Ollama/Groq no listos) | radio/EngineerOfflineState | radio/EngineerOfflineState (role=alert) | S/T chat-offline | verificado |
| Sonido on/off | radio/AudioToggle | radio/AudioToggle (aria-pressed) | S; T | verificado |
| Botón Engineer en TopBar | radio/RadioTrigger | radio/RadioTrigger restilado (mismas etiquetas y title) | S; en 390 px ya se puede pulsar | verificado |

### Settings, Docs

| Feature | Componente viejo | Componente nuevo | Cómo se verifica | Estado |
|---|---|---|---|---|
| Settings: canje de código, toggle de badge, sign out | app/settings/page | app/settings/page (mismo switch y textos) | S/T settings, settings-pro (0 pérdidas); U page.test 9/9; I en fase 9 | verificado |
| Docs | app/docs/page | app/docs/page (PageHeader, prosa) | S/T docs (0 pérdidas) | verificado |

### Live `/live/[k]` (no se toca salvo shell y popover)

| Feature | Componente viejo | Componente nuevo | Cómo se verifica | Estado |
|---|---|---|---|---|
| Dashboard live, NotLiveYet, ConnectionBanner, vista clásica de reserva | live/** | (sin cambios) | replay de Bakú a 30x, t=20/45/75 s, 1440 y 390, antes y después del shell: mismo dashboard, cambian solo TopBar y footer (`~/.pitwall-ui-baseline/live-before` vs `live-after`) | verificado |

### Fuera de la app migrada

| Feature | Motivo | Estado |
|---|---|---|
| `/preview/*` (prototipo del rediseño) | No es parte de la app; se deja intacto. Hereda los restilados de los componentes compartidos. | descartado: prototipo, sin cambios |
| `app/api/engineer-chat/route.ts` | Ruta de API, no UI; ningún componente la llama. | descartado: no es UI |

### Inalcanzables desde cualquier ruta en main (no son features visibles; no se tocan)

`analysis/RaceBrain`, `analysis/StrategyViewGrid`, `strategy/RunTimingPanel`,
`strategy/SectorStrengthMap`, `strategy/TrackEvolutionPanel`, `strategy/TrafficAndPrepPanel`,
`stubs/DRSTrainDetector`, `stubs/WeatherOverlay`, `live/ChaosDensityMeter`,
`live/PitCyclesLive`, `live/PitWindowWatch`, `live/TrackStatusBanner`, `lib/audio/engineSound`.
`layout/RaceStartLoader` también, pero la fase 2 lo borra con la animación.

## Cobertura de campos de /analysis (F)

204 hojas bajo `FullRaceAnalysis`; 160 pintadas por algún componente alcanzable desde `/race`.
Revisadas a mano las 44 restantes:

- **Falsos negativos** (sí se pintan, leídos por clave o vía helper): `chaos.components.*`
  (ChaosProfile/ChaosIndexCard iteran las claves).
- **Nadie las pinta hoy en la UI clásica**:
  - `pit_cycles[]` entero (ciclos, participantes, undercuts, summary). Solo `/preview`
    muestra `pit_cycles.length`. El brief cita "Pit impact y ciclos": el pit impact sí está,
    los ciclos no. Pintarlos sería una feature nueva → hallazgo fuera de alcance.
  - `race.meeting_key`, `race.country_name`, `race_brain.race_phase` (solo en el inalcanzable
    RaceBrain), `race_phases[].impact`, `pit_impact[].stop_duration`, `pit_impact[].cycle_id`,
    `chaos.method_version`, `weather_analysis.events[].air_temp|rainfall`,
    `weather_analysis.lap_conditions[].air_temp|rainfall`, `crossover_windows[].early_drivers`,
    `drs_trains.*.average_gap`, `drs_trains.*.dynamics.breaker_gap_opened|dynamics_note`,
    `clean_air_value.drivers[].sample_in_train|sample_post_train`,
    `team_radio.clips_per_driver`, `team_radio.summary`.
  La migración no los añade (sin cambios de features); van a hallazgos.

## Dependencias de backend (no se tocan en este bloque)

- ~~`/races` no expone `is_cancelled` ni `location`~~ — resuelto en la rama `ops/races-meta`
  (26d, parte B; contrato en `docs/api-contract.md`). El frontend de esta rama los usa (parte C)
  y sigue funcionando con un backend que no los mande. Desplegar el backend antes o a la vez.

## Entorno (para retomar)

- iCloud desaloja archivos: objetos de git, el venv y la captura de Bakú se rehidrataron con
  `cat`. Dependencias del worktree en `frontend/.deps.nosync/node_modules` + symlink
  (excluido en `.git/info/exclude`). Venv de backend en `~/.pitwall-ui-tools/venv`.
- iCloud desalojó también el worktree a las pocas horas: se movió con `git worktree move` a
  `../Pit_Wall_ui.nosync` (iCloud no sincroniza `.nosync`) y `../Pit_Wall_ui` es un symlink a él.
- El backend local escribía en `backend/cache/` del worktree (recalcula y guarda): se restauró y
  ahora corre con `CACHE_DIR=~/.pitwall-ui-tools/cache` (clon APFS de la caché). `backend/` del
  worktree queda intacto. Secretos de prueba en `~/.pitwall-ui-tools/local.env` (fuera del repo).
- Build base congelado en `~/.pitwall-ui-baseline/app` (servido en :3100), backend local en :8000.
- Línea base: 124 capturas en `~/.pitwall-ui-baseline/screens/before` (S), textos en
  `~/.pitwall-ui-baseline/text-before.json` (T), replay de Bakú en `~/.pitwall-ui-baseline/live-before`.

## Hallazgos fuera de alcance

(se van añadiendo; no se arreglan aquí)

1. `pit_cycles` se calcula y nadie lo pinta en la UI clásica.
2. Campos sin pintar listados arriba.
3. No hay análisis de clasificación ni libres en caché: sus layouts no tienen cobertura visual.
4. `/races` sin `is_cancelled` ni `location` (dependencia) — resuelto en `ops/races-meta` (26d).
5. 14 componentes inalcanzables (lista arriba) siguen en el repo.
6. **Móvil (390 px) en la UI vieja**: la página se desborda a 524 px de ancho (Chrome móvil reduce
   el zoom). El botón Engineer del TopBar queda tapado por la etiqueta PRO de Live, y
   "Open tables" (Race Control) por la fila de filtros de Engineer Signals: no se pueden pulsar.
   La línea base marca esos 9 pasos como fallidos en móvil. El shell nuevo no debe desbordar.
7. ~~Tyre Cliff Map escribía "+" delante de toda pendiente ("+-0.011")~~ — **arreglado (26d)**:
   `formatSignedSlope` en `lib/format.ts`, usado también por `formatSlope`; tests.
8. ~~EngineerSignalSummary ordenaba por severidad **en su sitio** el array de notas que recibe~~ —
   **arreglado (26d)**: ordena una copia; test que falla con el código anterior. Las citas del chat
   **no dependían del orden**: los ids `S1…Sn` los asigna el backend sobre su propio análisis en
   caché y la respuesta trae `title` y `lap_number`, que el chat pinta tal cual; nada del frontend
   busca una cita por posición en `engineer_notes`.
9. **Colores de equipo — cambio visible intencionado (decisión tomada, se queda)**: el backend da
   `team_colour` sin `#` ("3671C6") y la UI vieja lo pasaba tal cual al CSS, así que ningún swatch
   de equipo se pintaba. Las piezas migradas lo normalizan (`teamColour()` en
   `components/analysis/TruePaceTable.tsx`) y ahora sí se ven: barras de equipo en podio, tablas,
   clasificación y tarjeta de piloto. Es la única diferencia visual buscada respecto a la base fuera
   del propio cambio de diseño.
10. ~~El estado offline del chat decía "Start Ollama"~~ — **arreglado (26d)**: copy neutral por
    categoría desde `/chat/health` (servidor que no responde / modelo no disponible), sin proveedor ni
    comandos (`lib/chat/engineerStatus.ts` + test). Además "Check connection" miraba
    `ollama_reachable` en vez de `ai_ready`, así que con otro proveedor nunca volvía a "online"; usa la
    misma regla que la apertura.
11. ~~Las píldoras "Tyres loaded · Pit mapped · Race ctrl parsed" del chat se mostraban siempre~~ —
    **arreglado (26d)**: "Tyres loaded" y "Pit mapped" solo aparecen si `tyre_degradation` /
    `pit_impact` traen filas; "Race ctrl parsed" se quita (`/analysis` no expone race control con
    que comprobarlo). `lib/chat/contextPills.ts` + test.
