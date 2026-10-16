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
| 3 Pantalla de carga | hecho | (estos commits) |
| 4 Landing, selector, popover | pendiente | |
| 5 Análisis módulo a módulo | pendiente | |
| 6 Telemetría | pendiente | |
| 7 Race Engineer | pendiente | |
| 8 Settings, Docs, ProWall, estados | pendiente | |
| 9 Auditoría de paridad | pendiente | |

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

## Inventario (alcanzable desde app/ en main)

### Shell y global

| Feature | Componente viejo | Componente nuevo | Cómo se verifica | Estado |
|---|---|---|---|---|
| TopBar: logo, PRO badge, breadcrumb, Historical/Live, Docs, botón Engineer | layout/TopBar | layout/TopBar + shell.module.css | S todas; U TopBar.test (12, sin cambios); 390 px sin desbordar | verificado |
| Popover "próxima sesión" (hover hoy) con Notify | layout/TopBar | | S landing-pro/live-popover; I clic/tap/teclado/Escape/fuera; U | pendiente |
| Footer (aviso legal, Docs, atribución LinkedIn/CV en home) | layout/SiteFooter | layout/SiteFooter (mismo texto y enlaces) | S landing, todas | verificado |
| AppShell (estructura, main) | layout/AppShell | layout/AppShell sobre `PwRoot` | S todas; scrollWidth 390 en /, /docs, /settings, /race (base: 492-530) | verificado |
| Animación de apertura (coche) | brand/IntroAnimation + brand/CarSilhouette | app/template.tsx (transición de entrada) | grep cero refs en app/components/lib/hooks/stores/public/docs; U template.test (8) | descartado: eliminada por el brief; sustituta verificada |
| Race-start loader (no montado: comentado en layout) | layout/RaceStartLoader (+ public/start-lights.mp3, public/loader-preview.html) | — | R: inalcanzable; grep cero refs | descartado: eliminado por el brief (era inalcanzable) |
| Arranque de acceso PRO (estado del token) | access/AccessBootstrap | (lógica, se conserva) | U accessStore | pendiente |
| Notify me when it starts (Notification API, decisión: **se conserva restilado**) | notify/NotifyButton + NotifyWatcher | | U notify; S race-425 | pendiente |
| Página 404 de Next | (default de Next) | | S not-found | pendiente |

### Landing `/`

| Feature | Componente viejo | Componente nuevo | Cómo se verifica | Estado |
|---|---|---|---|---|
| Hero, stats, tres pasos | app/page | | S landing; T | pendiente |
| Selector temporada / GP / sesión, Analyze | landing/RaceSelector + ui/PitWallSelect | | S; T; I selector | pendiente |
| Botón .ics en sesiones futuras del selector | ui/AddToCalendarButton | | I descarga .ics; U ics | pendiente |
| Tarjetas destacadas (chaos, telemetría, tags) | landing/RaceSelector | | S; T | pendiente |
| Sección PRO informativa, con .ics de la próxima carrera | access/ProSection | | S landing / landing-pro; T | pendiente |
| Fondo (degradado; "video" no carga vídeo) | landing/LandingVideoBackground | | S | pendiente |

### Página de análisis `/race/[k]`

| Feature | Componente viejo | Componente nuevo | Cómo se verifica | Estado |
|---|---|---|---|---|
| Cabecera de carrera (chaos, pilotos, stints, nivel) | analysis/AnalysisPage | | S race-*; T | pendiente |
| Fases de carrera | analysis/RacePhaseTimeline | | S; T; módulos failed/n.a. | pendiente |
| Barra de sesión (sin fases) | analysis/SessionTimelineBar | | S modules-*; T | pendiente |
| Carril de radios por vuelta | teamradio/TeamRadioLane + RadioClipPlayer | | S; T expand; I un solo audio, clip muerto | pendiente |
| Pestañas (6, con badges) | analysis/TabNav | | S; T | pendiente |
| Strategy / Data View | analysis/AnalysisModeToggle | | S; T | pendiente |
| Driver focus strip | analysis/DriverFocusStrip | | S driver-card | pendiente |
| Race Brain | strategy/RaceBrainV2 | | S; T | pendiente |
| Race DNA | analysis/RaceDNACard | | S; T; módulos failed/n.a. | pendiente |
| True Pace (podio + clasificación modal) | strategy/TruePacePodium | | S; T expand | pendiente |
| True Pace (tabla, traffic score) | analysis/TruePaceTable | | T data view | pendiente |
| Clasificación | analysis/RaceClassificationPanel | | T data view | pendiente |
| Degradación de neumáticos (cliff map) | strategy/TyreCliffMap | | S tyre-pit; T | pendiente |
| Degradación (tabla) | analysis/TyreDegradationPanel | | T data view | pendiente |
| Pit impact (secuencia) | strategy/PitSequenceSummary | | S; T | pendiente |
| Pit impact (tabla) | analysis/PitImpactPanel | | T data view | pendiente |
| Chaos | strategy/ChaosProfile + analysis/ChaosIndexCard | | S; T | pendiente |
| Engineer notes (resumen) | strategy/EngineerSignalSummary | | S; T | pendiente |
| Engineer notes (lista) | analysis/EngineerNotes | | T data view / control-tables | pendiente |
| Decisiones (tarjetas) | strategy/KeyDecisionCards | | S; T expand | pendiente |
| Decisiones (timeline) | analysis/DecisionsTimeline | | T data view | pendiente |
| Exclusion log | data/ExclusionLogPanel | | T data view | pendiente |
| Data View (índice y secciones) | data/DataViewTables | | S; T | pendiente |
| Meteo | strategy/WeatherOverlay | | S weather; T | pendiente |
| Crossovers | analysis/CrossoverWindowPanel | | S; T expand | pendiente |
| Weather winners & losers | analysis/WeatherWinnersLosers | | T; módulos | pendiente |
| Tren de DRS | strategy/DRSTrainDetector | | S tyre-pit; T expand | pendiente |
| Tráfico / dirty air (clean air value) | analysis/CleanAirValueCard | | S; T | pendiente |
| Lap charts (4 gráficas) | tabs/LapChartsTab + charts/LapCharts | | S lap-charts; T svg | pendiente |
| Pestañas contenedoras | tabs/StrategyTab, ManagementTab, WeatherTab, TelemetryTab, RaceControlTab | | S | pendiente |
| Tarjeta de piloto con radios | analysis/DriverCard | | T driver-card:* (todos los pilotos); I radios | pendiente |
| ModuleUnavailable (ok / failed / not_applicable) | analysis/ModuleUnavailable | | S race-9636-modules-failed / -not_applicable | pendiente |
| Chips de confianza, "estimated", metodología | ui/ConfidenceChip, ui/EstimatedLabel, ui/MethodologyBadge | | T aria; T expand methodology | pendiente |
| Pantalla de carga | analysis/AnalysisLoadingScreen | analysis/AnalysisLoadingScreen + lib/loadPhase + app/race/[k]/loading.tsx + lib/raceNav | S race-loading; diagnose_loading (navegador real); U fake timers (loadPhase 5, loader 7, hook 4, AppShell 3) | verificado |
| SessionUnavailableState 425 (cuenta atrás), 404, 429, 503 | analysis/SessionUnavailableState | | S race-425, -425-no-unlock, -404, -429, -503 | pendiente |
| Error genérico (500) y offline | app/race/[k]/page (inline) | | S race-500, race-offline | pendiente |
| ProWall (402) | access/ProWall | | S race-402; I canje | pendiente |

### Telemetría (pestaña Telemetry)

| Feature | Componente viejo | Componente nuevo | Cómo se verifica | Estado |
|---|---|---|---|---|
| Replay: mapa del circuito | CircuitTelemetryReplay/TrackReplayMap | | S tab-telemetry; I | pendiente |
| Canales (speed, throttle, brake…) | CircuitTelemetryReplay/TelemetryChannels | | S; T svg | pendiente |
| G-force y diagrama GG | CircuitTelemetryReplay/GForceMeter, GGDiagram | | S | pendiente |
| Sectores | CircuitTelemetryReplay/SectorCards | | S; T | pendiente |
| Selector de pilotos y métricas (pestañas) | CircuitTelemetryReplay/DriverSelector, MetricSelector | | S; I comparación | pendiente |
| Controles: play, pausa, scrub, velocidad, vuelta | CircuitTelemetryReplay/ReplayControls + index | | I | pendiente |
| Sin telemetría (sesión sin precomputar / no race) | CircuitTelemetryReplay/index | | S race-11377-pro/tab-telemetry | pendiente |

### Race Engineer (chat)

| Feature | Componente viejo | Componente nuevo | Cómo se verifica | Estado |
|---|---|---|---|---|
| Overlay: apertura, preguntas sugeridas, envío | radio/RadioOverlay | | S chat-answer; I | pendiente |
| Citas (cited signals) y confianza | radio/RadioOverlay | | S chat-answer/answered; T | pendiente |
| Rate-limit (cuenta atrás, input bloqueado) | radio/RadioOverlay | | S chat-rate-limited | pendiente |
| Offline (Ollama/Groq no listos) | radio/EngineerOfflineState | | S chat-offline | pendiente |
| Sonido on/off | radio/AudioToggle | | S; I | pendiente |
| Botón Engineer en TopBar | radio/RadioTrigger | radio/RadioTrigger restilado (mismas etiquetas y title) | S; en 390 px ya se puede pulsar | verificado |

### Settings, Docs

| Feature | Componente viejo | Componente nuevo | Cómo se verifica | Estado |
|---|---|---|---|---|
| Settings: canje de código, toggle de badge, sign out | app/settings/page | | S settings, settings-pro; I; U page.test | pendiente |
| Docs | app/docs/page | | S docs; T | pendiente |

### Live `/live/[k]` (no se toca salvo shell y popover)

| Feature | Componente viejo | Componente nuevo | Cómo se verifica | Estado |
|---|---|---|---|---|
| Dashboard live, NotLiveYet, ConnectionBanner, vista clásica de reserva | live/** | (sin cambios) | replay de Bakú a 30x, t=20/45/75 s, 1440 y 390, antes y después del shell: mismo dashboard, cambian solo TopBar y footer (`~/.pitwall-ui-baseline/live-before` vs `live-after`) | verificado (shell) |

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

- `/races` no expone `is_cancelled` ni `location` (`RaceListItem`: meeting_key, meeting_name,
  country_name, circuit_short_name, date_start, year). Bloquea, de la tarea 3 del 26b:
  "Cancelled" sin enlace y el nombre por `location`. Ronda ascendente sin pretemporada sí se
  puede hacer en el frontend.

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
4. `/races` sin `is_cancelled` ni `location` (dependencia).
5. 14 componentes inalcanzables (lista arriba) siguen en el repo.
6. **Móvil (390 px) en la UI vieja**: la página se desborda a 524 px de ancho (Chrome móvil reduce
   el zoom). El botón Engineer del TopBar queda tapado por la etiqueta PRO de Live, y
   "Open tables" (Race Control) por la fila de filtros de Engineer Signals: no se pueden pulsar.
   La línea base marca esos 9 pasos como fallidos en móvil. El shell nuevo no debe desbordar.
