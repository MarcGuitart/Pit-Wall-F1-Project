# DIAGNOSTIC.md — Estado verificado del repositorio Pit Wall

Fecha: 2026-09-14 (primera pasada) · 2026-09-15 (segunda pasada: Parte 2 reescrita contra `SPRINT_PLAN.md`, ver también `DIAGNOSTIC_ADDENDUM.md`) · Rama: `feat/race-classification` (HEAD `4142627`) · Método: solo lectura de código + medición en disco. Ningún archivo del código ha sido modificado.

Convenciones de veredicto:
- **CONFIRMADO** — la afirmación (o el problema) existe tal cual en el código.
- **YA RESUELTO** — el código ya cubre lo que se pedía.
- **DESACTUALIZADO** — la afirmación describe un estado que ya no coincide con el código.
- **NO VERIFICADO** — no se ha podido comprobar leyendo el repo; se explica por qué.

Todas las referencias son `archivo:línea` sobre el working tree actual. Las mediciones de tamaño se hicieron con `ls -l` / `du` sobre disco, no estimadas.

---

## Nota previa: estado de `SPRINT_PLAN.md` (RESUELTO en la segunda pasada)

- **Primera pasada (2026-09-14):** `SPRINT_PLAN.md` no estaba en el working tree ni en el índice de ninguna rama (`find`, `git ls-tree` sobre `main|V3|Environment|origin/main` → vacío), así que la Parte 2 se verificó contra afirmaciones reconstruidas a partir de la petición.
- **Segunda pasada (2026-09-15):** el archivo está en la raíz (`SPRINT_PLAN.md`, 243 líneas, sin trackear: `git status` → `?? SPRINT_PLAN.md`). La Parte 2 se ha reescrito íntegramente contrastando el texto real del plan, con cita textual y línea para cada punto. La versión anterior de la Parte 2 queda sustituida; el resto del documento (Partes 1, 3, 4, 5 y Resumen) conserva los hallazgos de la primera pasada, que no dependen del plan.

---

## PARTE 1 — Inventario

### 1.1 Estructura del repo

| Ruta | Qué es | Referencia |
|---|---|---|
| `backend/app/main.py` | FastAPI app, CORS, registro de 5 routers + `/health` | `backend/app/main.py:15-45` |
| `backend/app/api/` | Routers: `races.py`, `analysis.py`, `admin.py`, `chat.py`, `telemetry.py` | `backend/app/main.py:6-10` |
| `backend/app/clients/` | `openf1_client.py` (fetch + caché + backoff), `ollama_client.py` (LLM: Ollama → Groq) | — |
| `backend/app/core/` | `config.py` (Settings), `cache.py` (caché JSON en disco), `fastf1_config.py` | — |
| `backend/app/domain/` | `models.py` (Pydantic), `race_timeline.py` (dataclass `RaceTimeline`), `enums.py` (**no importado por nadie**: `grep -rn "domain.enums" backend/app` → 0) | `backend/app/domain/enums.py:1-43` |
| `backend/app/services/` | 17 servicios de análisis (ver 1.3) | — |
| `backend/app/utils/` | `time.py` (guard histórico, `position_at_lap`, `sc_vsc_laps`), `statistics.py` | — |
| `backend/scripts/precompute_telemetry.py` | Script CI para precomputar telemetría FastF1 | `.github/workflows/precompute-telemetry.yml:1-99` |
| `backend/cache/` | Fixture cache comprometida en git (108 archivos, 121 MB) | `.gitignore:32` (`!backend/cache/`) |
| `backend/fastf1_cache/` | Caché FastF1 local (461 MB, ignorada) | `.gitignore:33` |
| `frontend/app/` | Next.js 14 App Router: `page.tsx` (landing), `race/[sessionKey]/page.tsx`, `api/engineer-chat/route.ts` | `frontend/package.json:14` |
| `frontend/components/` | `analysis/` (tabs, strategy, data, stubs, CircuitTelemetryReplay), `landing/`, `layout/`, `radio/`, `ui/` | — |
| `frontend/lib/` | `api.ts`, `errors.ts`, `utils.ts`, `format.ts`, `constants.ts`, `chat/suggestedQuestions.ts`, `audio/`, `mock/brazil_2024.json` | — |
| `frontend/hooks/useRaceAnalysis.ts`, `frontend/stores/raceStore.ts` | Carga de análisis y estado Zustand | — |
| `frontend/types/index.ts`, `frontend/types/telemetry.ts` | Tipos TS del contrato | — |
| `docs/` | Ignorado por git (`.gitignore:15`; `git ls-files docs` → 0). Existe localmente con `api-contract.md`, `CLAUDE*.md`, `masterclass/` | — |
| `CLAUDE_v3.md`, `CLAUDE_v4.md` | En raíz, **no trackeados** (`git ls-files` no los lista; `.gitignore:4-5` los ignora con otra capitalización (`CLAUDE_V3.md`/`CLAUDE_V4.md`), macOS es case-insensitive) | — |
| `netlify.toml`, `frontend/vercel.json`, `backend/render.yaml` | Deploy: frontend Netlify (base `frontend`) y/o Vercel; backend Render (`ENVIRONMENT=production`) | `netlify.toml:1-7`, `backend/render.yaml:1-15` |

### 1.2 Endpoints del backend

| Ruta | Método | Archivo:línea | Devuelve |
|---|---|---|---|
| `/health` | GET, HEAD | `backend/app/main.py:43-45` | `{"status":"ok"}` |
| `/races?year=` | GET | `backend/app/api/races.py:17-66` | `list[RaceListItem]`; sirve `meetings_{year}.json` si existe; 503 si OpenF1 inalcanzable y sin caché; `status_code` de OpenF1 con `"OpenF1 error"` si HTTP error |
| `/races/{meeting_key}/sessions` | GET | `backend/app/api/races.py:111-154` | `list[SessionInfo]`; en 401 de OpenF1 escanea `_session_meta.json`/`_analysis.json` de la caché (`:69-108`); 404 si nada; 503 si inalcanzable |
| `/analysis/{session_key}?force_refresh=` | GET | `backend/app/api/analysis.py:160-384` | `FullRaceAnalysis`. Errores: 425 `SESSION_NOT_HISTORICAL_YET` (`:192-204`, `:248-260`), 404 `session_not_cached` (`:238-247`), 404 string (`:261-264`), 503 string (`:221-222`) |
| `/admin/clear-cache/{session_key}` | POST | `backend/app/api/admin.py:8-11` | `{"cleared":true,"session_key":N}`. **Sin autenticación.** |
| `/chat` | POST | `backend/app/api/chat.py:71-104` | `ChatResponse {answer, cited_signals, confidence}`; 404 si no hay `_analysis.json`; 500 si no valida |
| `/chat/health` | GET | `backend/app/api/chat.py:38-68` | Dict con `ollama_reachable`, `model_available`, `groq_available`, `ai_ready` |
| `/telemetry/{session_key}?drivers=&lap_mode=` | GET | `backend/app/api/telemetry.py:29-172` | `TelemetryData`; 503 `telemetry_race_only` (`:100-107`), 503 `telemetry_not_precomputed` en producción (`:111-122`), 404 `ANALYSIS_NOT_FOUND` (`:130-137`), 404 `TELEMETRY_UNAVAILABLE` (`:161-168`) |
| `/api/engineer-chat` (Next.js, no FastAPI) | POST | `frontend/app/api/engineer-chat/route.ts:99-145` | `{answer}` vía Anthropic `claude-sonnet-4-6` (`:126`). Ver Parte 4.3: **ningún cliente lo llama**. |

### 1.3 Servicios de análisis y orden de ejecución en el pipeline

Orden exacto dentro de `get_analysis` (`backend/app/api/analysis.py`):

| # | Servicio | Función | Llamada en | Inputs | Envuelto en try/except |
|---|---|---|---|---|---|
| 0 | `race_loader.load_session` → `openf1_client.fetch_all` | fetch 8 endpoints con caché | `analysis.py:220` | `session_key` | Solo `RuntimeError` → 503 (`:221-222`) |
| 1 | `pace_service.compute_true_pace` | True Pace (mediana vueltas limpias) | `analysis.py:277` | laps, stints, pit, race_control, drivers | **No** |
| 2 | `tyre_service.compute_tyre_degradation` | pendiente degradación/stint | `analysis.py:278` | laps, stints, race_control, drivers | **No** |
| 3 | `pit_service.compute_pit_impact` | impacto pit stops | `analysis.py:279` | pit, position, laps, drivers | **No** |
| 4 | `chaos_service.compute_chaos_index` | Chaos Index | `analysis.py:280` | race_control, weather, position | **No** |
| 5 | `classification_service.compute_race_classification` | grid/finish/positions gained; se inyecta en cada `TruePaceRow` | `analysis.py:284-291` | position, drivers | **No** |
| 6 | `_build_race_brain` (local) | RaceBrain | `analysis.py:292-295` | chaos, pace, tyre, pit | **No** |
| 7 | `notes_service.generate_engineer_notes` | notas deterministas (sin LLM) | `analysis.py:296-298` | tyre, pit, chaos, race_control, weather, laps | **No** |
| 8 | `decisions_service.compute_decisions` | 5 decisiones clave | `analysis.py:299` | pit, tyre, chaos, n_pace | **No** |
| 9 | `weather_service.compute_weather_analysis` | análisis meteo | `analysis.py:300` | weather, laps | **No** |
| 10 | `timeline_builder.build_race_timeline` | `RaceTimeline` compartido (una sola vez) | `analysis.py:304-313` | laps, weather, race_control, pit, intervals, position | **No** |
| 11 | `drs_service.compute_drs_trains` | trenes DRS agregados | `analysis.py:316` | intervals, laps, drivers, timeline | **No** |
| 12 | `crossover_service.detect_crossover_windows` | ventanas crossover | `analysis.py:327` | timeline, stints, pit_impact | Sí (`:326-329`) |
| 13 | `crossover_service.compute_weather_winners_losers` | ganadores/perdedores meteo | `analysis.py:332-334` | crossover, pit, position, race_control, timeline | Sí (`:331-336`) |
| 14 | `race_phase_service.classify_race_phases` | fases de carrera | `analysis.py:339-342` | timeline, tyre, pit, crossover, trains, total_laps | Sí (`:338-344`) |
| 15 | `race_dna_service.compute_race_dna` | Race DNA | `analysis.py:347-350` | chaos, weather, trains, pace, tyre, pit, phases | Sí (`:346-352`) |
| 16 | `clean_air_service.estimate_clean_air_value` | valor aire limpio | `analysis.py:355-357` | trains, pace, laps, timeline | Sí (`:354-359`) |
| — | Persistencia `cache.set_full_analysis` | | `analysis.py:381` | `result.model_dump()` | — |

Servicios que existen pero **no forman parte del pipeline `/analysis`**: `telemetry_service.py` (solo `/telemetry`, import lazy `telemetry.py:127`), `chat_service.py` (solo `/chat`). Funciones importadas pero no usadas en `analysis.py`: `aggregate_drs_trains`, `compute_raw_snapshots` (`analysis.py:19`; único uso `:316` es `compute_drs_trains`).

### 1.4 Componentes frontend que consumen cada endpoint

| Endpoint | Función cliente | Consumidor(es) |
|---|---|---|
| `GET /races` | `fetchRaces` `frontend/lib/api.ts:25-28` | `components/landing/RaceSelector.tsx:63` |
| `GET /races/{id}/sessions` | `fetchSessions` `api.ts:30-35` | `RaceSelector.tsx:92` |
| `GET /analysis/{key}` | `fetchAnalysis` `api.ts:37-39` | `hooks/useRaceAnalysis.ts:65` → `app/race/[sessionKey]/page.tsx:18` → `components/analysis/AnalysisPage.tsx` |
| `GET /analysis/{key}?force_refresh=true` | `fetchAnalysisForceRefresh` `api.ts:41-43` | **Nadie** (grep en `app/ components/ hooks/ stores/ lib/` → solo la definición) |
| `POST /admin/clear-cache/{key}` | `clearCache` `api.ts:45-51` | **Nadie** |
| `GET /chat/health` | `fetchChatHealth` `api.ts:53-68` | `components/radio/RadioOverlay.tsx:89,140` |
| `POST /chat` | `sendToEngineer` `api.ts:74-88` | `RadioOverlay.tsx:160-164` (solo usa `res.answer`, `:165`) |
| `POST /chat` (alias legacy) | `engineerChat` `api.ts:93-104` | **Nadie** |
| `GET /telemetry/{key}` | `getTelemetry` `api.ts:116-138` | `components/analysis/CircuitTelemetryReplay/index.tsx:65,149` |
| `POST /api/engineer-chat` (Next) | — | **Nadie** (`grep -rn "engineer-chat" frontend/{app,components,lib,hooks,stores}` → solo `route.ts:139`, su propio log) |

Consumo por campo de `FullRaceAnalysis` (grep por nombre de campo en `app/ components/ lib/ hooks/ stores/`):
`race_phases` → solo `AnalysisPage.tsx`; `race_dna`, `race_classification`, `weather_winners_losers`, `clean_air_value` → `StrategyTab.tsx` / `ManagementTab.tsx` / `WeatherTab.tsx` (+ `StrategyViewGrid.tsx`, que no se importa desde ningún sitio — ver 4.3). El resto se usa en varios tabs y en `lib/chat/suggestedQuestions.ts`.

---

## PARTE 2 — Verificación de afirmaciones (reescrita contra el `SPRINT_PLAN.md` real)

> Segunda pasada (2026-09-15). `SPRINT_PLAN.md` está ahora en la raíz (243 líneas). Esta sección sustituye a la anterior, que se había verificado contra afirmaciones reconstruidas. Las citas son textuales del plan, con línea. Puntos no cubiertos por la pasada anterior marcados con **[nuevo]**.

### 2.0 · Premisas del plan (cabecera y "Estado de partida") **[nuevo]**

| Afirmación del plan | Código | Veredicto | Esfuerzo |
|---|---|---|---|
| «Referencia de validación … **9636 (São Paulo 2024, Chaos 100/Extreme)**» (`SPRINT_PLAN.md:6-7`) | `backend/cache/9636/_analysis.json`: `chaos.score=100`, `level="Extreme"`, componentes `{safety_car:30, yellow_flags:20, investigations:20, penalties:8, weather:15, position_volatility:20}` | CONFIRMADO | — |
| «**9539 (España 2024, Chaos 62/Medium)**» (`:7`) | `backend/cache/9539/_analysis.json`: `chaos.score=62`, **`level="High"`**, `race_brain.race_phase="High-incident race"`. Umbrales: `chaos_service.py:65-72` (`>=50 → "High"`). Recalculado desde `race_control.json`/`position.json` de 9539: invest 8×5→cap 20, penalty 3×4=12, weather 10, volatilidad 724//5→cap 20 = 62. | **DESACTUALIZADO** — el plan etiqueta 9539 como Medium; el código y la caché dicen High. Afecta a 2.3 ("debe seguir siendo Medium"): hoy no lo es. | bajo (corregir el plan) |
| «True Pace ordena por `median_clean_lap`, no por `clean_pace`» (`:15`) | `backend/app/services/pace_service.py:117` `rows.sort(key=lambda r: r.median_clean_lap)`; `clean_pace` no aparece en el repo | YA RESUELTO | — |
| «`LICENSE` existe en la raíz y el README enlaza a él» (`:16`) | `LICENSE` (1 077 B) en raíz; `README.md:193-195` «MIT — see [LICENSE](LICENSE)» | YA RESUELTO | — |
| «System prompt con reglas anti-causalidad, verificado en tres rondas contra 9636» (`:17`) | Reglas presentes en `backend/app/clients/ollama_client.py:26-28`. Las "tres rondas" no dejan rastro en el repo (no hay tests ni fixtures de preguntas). | Reglas: CONFIRMADO · Verificación: NO VERIFICADO (proceso manual, sin artefacto) | — |
| «Caché de 9636 y 9539 regenerada y servida desde disco» (`:18`) | `backend/cache/{9636,9539}/_analysis.json` fechados 24 ago 21:08; ambos validan hoy contra `FullRaceAnalysis` (comprobado con `model_validate` en la pasada 1); servidos por `analysis.py:167-172` | YA RESUELTO | — |
| «Nada del Sprint 1 está bloqueado. Se puede ejecutar entero hoy.» (`:33`) | 1.2-1.5 son cambios de código sin dependencia externa (ver abajo). 1.1 es consola del proveedor. | CONFIRMADO | — |

### 1.1 · Límite de gasto del proveedor de LLM

**Plan:** «Configurar un tope de gasto en la consola del proveedor.» (`SPRINT_PLAN.md:46-51`)
**Código:** fuera de alcance del repo. Lo único relacionado en código: el proveedor efectivo se decide por `GROQ_API_KEY`/`GROQ_MODEL` (`config.py:31-32`) y no hay ningún contador de uso ni corte por presupuesto en `ollama_client.py`.
**Veredicto:** FUERA DE ALCANCE DEL REPO. **Esfuerzo:** — (configuración externa).

### 1.2 · Rate limit en `/chat`

**Plan:** «No existe hoy. Un solo usuario puede consumir sin límite.» (`:55`) · «Respuesta 429 con mensaje claro» (`:58`) · «Verificar que el frontend muestra ese estado de forma legible» (`:59`) · «La infraestructura de conteo ya está medio montada: existe un `asyncio.Lock` por `session_key` en `analysis.py`.» (`:61-62`)

**Código:**
- No existe: `backend/app/api/chat.py:71-104` sin lock/semaforo/contador; `main.py:21-27` solo CORS; `requirements.txt:1-11` sin `slowapi`. `grep -rni "rate.limit|slowapi|limiter|throttl" backend/app` → solo `OpenF1RateLimitError` (`openf1_client.py:30`) y `throttle` de telemetría. → CONFIRMADO.
- «Infraestructura de conteo medio montada» → **DESACTUALIZADO/incorrecto**: `_analysis_locks` (`analysis.py:33-41`) es un single-flight por sesión (`:207-214`), no cuenta nada, no conoce IPs ni usuarios, vive en `analysis.py` y `/chat` no lo importa. No hay ninguna estructura reutilizable para contar mensajes.
- «Frontend muestra ese estado» **[nuevo]**: hoy `sendToEngineer` lanza `ApiError(res.status, ...)` **sin leer el body** (`frontend/lib/api.ts:84-86`) y `RadioOverlay.tsx:167-171` convierte cualquier fallo en el texto fijo «Comms interference. Unable to reach pit wall. Try again.». Un 429 con mensaje claro del backend **no llegaría al usuario** sin tocar también el frontend. El mapeo `429 → OPENF1_RATE_LIMIT` de `errors.ts:53-59` solo se aplica a `/analysis` (vía `useRaceAnalysis.ts:74`), no a `/chat`.

**Veredicto:** CONFIRMADO (no hay rate limit); la premisa del lock como base de conteo es DESACTUALIZADA; el tercer checkbox requiere trabajo de frontend que el plan atribuye solo a backend (`:41-42` «Todo el trabajo es de backend»).
**Esfuerzo:** bajo (backend) + bajo (frontend: leer body en `sendToEngineer` y distinguir 429).

### 1.3 · Guard de caché corrupta en `/analysis`

**Plan:** «`/chat` valida contra el modelo Pydantic y devuelve un 500 con mensaje claro; `/analysis`, en su lectura rápida de caché, no tiene ese guard y lanzaría un error de validación sin capturar.» (`:66-69`) · «Replicar en `analysis.py` el guard que ya existe en `chat.py`» (`:71`) · «Test con un JSON deliberadamente corrupto» (`:73`)

**Código:**
- `chat.py:84-90` → `try: FullRaceAnalysis.model_validate(raw) except Exception → HTTPException(500, "Cached analysis is corrupted.")`. CONFIRMADO.
- `analysis.py:172` y `:214` → `return FullRaceAnalysis.model_validate(cached)` sin try/except. CONFIRMADO. (El plan y `QA_PREP.md:45` citan `analysis.py:167-171`; la línea exacta hoy es `:172`, y hay un **segundo** punto sin guard en `:214` que el plan no menciona.)
- Matiz **[nuevo]**: el guard de `chat.py` **tampoco invalida el archivo** — `cache.get_full_analysis` solo borra en `JSONDecodeError/OSError` (`cache.py:71-77`); un JSON válido con esquema viejo persiste y ambos endpoints fallan en cada petición hasta un `?force_refresh=true` (`analysis.py:168,381`), que ningún componente del frontend invoca (`fetchAnalysisForceRefresh` sin usos, `api.ts:41-43`). "Replicar el guard" tal cual daría un 500 legible pero no autorrepara.
- «Test con JSON corrupto»: no existe ningún test en el repo (Parte 4.1).

**Veredicto:** CONFIRMADO. **Esfuerzo:** bajo (guard + borrado/recompute) · medio si se añade el primer test (no hay infraestructura de tests).

### 1.4 · Emitir los códigos de error que el frontend ya espera

**Plan:** «`SessionUnavailableState.tsx` maneja `OPENF1_RATE_LIMIT`, `ANALYSIS_FAILED` y `OPENF1_ERROR`. El backend no emite ninguno de los tres: grep sobre el repo, cero resultados.» (`:77-79`) · «`OPENF1_RATE_LIMIT` cuando OpenF1 responde 429» (`:81`) · «`OPENF1_ERROR` cuando un endpoint falla tras agotar reintentos» (`:82`) · «`ANALYSIS_FAILED` cuando un servicio V4 explota y deja el campo vacío» (`:83`)

**Código:**
- Grep en `backend/` → 0 resultados para los tres códigos. CONFIRMADO. En el frontend se **derivan del status HTTP**, no del body: `errors.ts:53-59` (429), `:60-67` (503), `:68-73` (500).
- «`SessionUnavailableState.tsx` maneja …»: tiene `CONFIG` para los tres (`SessionUnavailableState.tsx:28-42`) pero `page.tsx:51-56` solo lo renderiza para `OPENF1_RATE_LIMIT` y `OPENF1_ERROR`; **`ANALYSIS_FAILED` va al panel genérico** (`page.tsx:72-100`). Parcialmente DESACTUALIZADO.
- Checkbox 429 **[nuevo]**: hoy el 429 de OpenF1 muere en `openf1_client.py:118-122` (endpoint omitido en silencio) → si falta `laps`, `/analysis` responde 404 string (`analysis.py:261-264`) → frontend `UNKNOWN` (`errors.ts:83-86`). Emitir `OPENF1_RATE_LIMIT` exige dejar de tragar `OpenF1RateLimitError` en `fetch_all` y añadir una rama 429 en `analysis.py`.
- Checkbox "falla tras agotar reintentos": `RuntimeError` de `_fetch_endpoint` (`openf1_client.py:95-97`) también se traga en `:118`; la rama 503 de `analysis.py:221-222` es inalcanzable hoy.
- Checkbox V4 **[nuevo]**: la premisa está invertida. Un servicio V4 que explota **no produce error**: `analysis.py:326-359` lo captura, deja `None`/`[]` y responde **200**. El 500 que el frontend traduce a `ANALYSIS_FAILED` solo lo producen hoy los servicios V1-V3 sin try/except (`analysis.py:277-316`) y `model_validate` (`:172,214`). Decidir si "V4 vacío" debe ser 200 con flag o 500 es una decisión de contrato, no un checkbox.
- Además, el detalle del **425** se pierde en el frontend por el bug de desanidado (`errors.ts:42-52` lee `body.message` en vez de `body.detail.message`; ver `DIAGNOSTIC_ADDENDUM.md` §B).

**Veredicto:** CONFIRMADO (no se emiten); DESACTUALIZADO en el mecanismo propuesto para V4 y en «la UI está preparada» (solo 2 de 3 códigos llegan a `SessionUnavailableState`, y el body 425 no se parsea bien).
**Esfuerzo:** medio.

### 1.5 · Resolver `cited_signals`

**Plan:** «Hoy no analiza la respuesta del modelo: son siempre las 3 `engineer_notes` top por severidad, digan lo que digan. Es un elemento de UI que afirma una trazabilidad que no existe.» (`:88-90`) · «**Quitarlo**: eliminar los chips de la UI hasta que sea real.» (`:95`)

**Código:**
- `chat.py:102` `cited = [n.title for n in analysis.engineer_notes[:3]]`; orden High→Medium→Low, luego lap (`notes_service.py:286-289`). CONFIRMADO.
- «Elemento de UI» / «chips» **[nuevo]**: **no existe en la UI.** `RadioOverlay.tsx:165` usa solo `res.answer`; `grep -rni "cited" frontend/{app,components,lib}` → 0 resultados fuera de la firma de `sendToEngineer` (`api.ts:78`). No hay chips que quitar. La trazabilidad falsa hoy solo existe en el JSON de la API (`ChatResponse`, `chat.py:32-35`), y `confidence` es siempre `"Medium"` (`:35`, nunca asignado).

**Veredicto:** CONFIRMADO en backend; DESACTUALIZADO en la parte de UI (la opción "Quitarlo" ya está de facto en el frontend; solo queda el campo del contrato).
**Esfuerzo:** bajo (quitar/dejar `null` en `ChatResponse`) · medio (extraer citas reales de la respuesta).

### 2.1 · Migración del modelo de lenguaje

**Plan:** «El modelo actual es abierto y gratuito, y su razonamiento es limitado» (`:108`) · «Cadena de fallback mantenida (local → nuevo modelo → mensaje offline)» (`:113`) · «Reejecutar las 3 preguntas de validación contra 9636» (`:114-117`)

**Código:**
- Modelo actual: Ollama `llama3.1:8b` local (`config.py:28`) o, si no está, **el primer modelo que Ollama tenga instalado** (`ollama_client.py:56`); Groq `openai/gpt-oss-120b` (`config.py:32`) — abierto y en free tier según comentarios (`config.py:30`). `.env.example:34` documenta otro modelo (`llama-3.1-8b-instant`). CONFIRMADO con matiz: el "modelo actual" no es único; depende del entorno.
- Cadena actual: Ollama → Groq → texto offline (`ollama_client.py:172-207`). El plan pide "local → nuevo → offline": encaja con sustituir `_call_groq`. CONFIRMADO.
- Las 3 preguntas de validación **[nuevo]**: no existen en el repo como fixture, script o test (`grep -rn "why was VER faster\|lap 28\|did the pit stop help" backend frontend docs` → 0). NO VERIFICADO que se hayan ejecutado alguna vez; no hay artefacto.
- Coste "variable por uso" (`:27`): sin contador ni tope en código (ver 1.1).

**Veredicto:** CONFIRMADO. **Esfuerzo:** bajo (integración) · medio (harness de validación, hoy inexistente).

### 2.2 · Prompt caching

**Plan:** «El contexto de una sesión es idéntico en todos los mensajes de una conversación y entre usuarios que preguntan por la misma carrera.» (`:123-124`) · «Bloque de contexto de sesión marcado como cacheable» (`:127`)

**Código:**
- Idéntico entre mensajes: sí — `build_chat_context` es determinista sobre `_analysis.json` (`chat_service.py:12-230`) y no se envía historial (`ollama_client.py:177-182`). Idéntico entre usuarios: sí, no hay nada por usuario. CONFIRMADO.
- Matiz **[nuevo]**: cambia con `focused_driver` (`chat_service.py:185-228` añade ~900-1 100 chars) → dos variantes de prefijo por sesión.
- Ningún proveedor actual expone marcado de bloque cacheable en el código (Ollama `:176-184`, Groq `:129-137`). El `{session_name}` está en la **primera línea** del prompt (`ollama_client.py:19`) → el prefijo común entre sesiones distintas es 0; entre mensajes de la misma sesión es el 100 % del `system` (≈6,9-8,8k chars, medido en pasada 1).
- «Verificar que el cacheo no altera las respuestas» (`:129`): sin harness (ver 2.1).

**Veredicto:** CONFIRMADO. **Esfuerzo:** bajo — depende del proveedor elegido en 2.1.

### 2.3 · Normalización del Chaos Index

**Plan:** «Hoy es un conteo absoluto de eventos, sin usar `total_laps`. El mismo número de safety cars puntúa igual en un circuito de 78 vueltas que en uno de 44.» (`:133-134`) · «Validar contra 9636 (debe seguir siendo Extreme)» (`:138`) · «Validar contra 9539 (debe seguir siendo Medium)» (`:139`) · «Si 9636 deja de ser 100/100, conviene dejar constancia» (`:143-144`)

**Código:**
- Sin `total_laps`: `chaos_service.py:75-79` recibe solo `race_control, weather, position_data`; 0 apariciones de `total_laps` en el archivo. Conteo absoluto con caps (`:93-98`). CONFIRMADO.
- «9539 debe seguir siendo Medium» → **DESACTUALIZADO**: hoy es **High** (62 ≥ 50, `chaos_service.py:69`). La condición de validación es imposible de cumplir "siguiendo" un estado que no existe. Además, el componente `weather=10` de 9539 proviene de **un único registro** de `rainfall=1` de 1 minuto (`DIAGNOSTIC_ADDENDUM.md` §C); sin él el score sería 52 → sigue High.
- «9636 100/100 mostrado públicamente»: `README.md:42` y `:65` lo muestran. CONFIRMADO.
- Umbrales duplicados en 4 sitios (`chaos_service.py:65-72`, `analysis.py:109-124`, `RaceSelector.tsx:13-18`, `RaceBrainV2.tsx:8-14` con tramo ≥60 divergente) — "Recalibrar umbrales" (`:137`) tocaría los cuatro.

**Veredicto:** CONFIRMADO (sin normalización); referencia 9539 DESACTUALIZADA y contaminada por el falso positivo de lluvia.
**Esfuerzo:** medio (normalizar + centralizar umbrales + regenerar 4 cachés + corregir README si cambia 9636).

### 2.4 · Umbrales por tipo de sesión

**Plan:** «El pipeline corre igual para sprints que para carreras normales: ningún servicio comprueba `session_name`. Los umbrales de degradación y chaos están pensados para una carrera completa.» (`:148-150`)

**Código:** ningún servicio del pipeline recibe `session_name`/`session_type` (firmas en `analysis.py:277-357`). Únicas ramas "Sprint" del backend: `utils/time.py:13-19` (guard histórico) y `telemetry_service.py:59-60` (FastF1). `analysis.py:270` fuerza `"Race"` si falta. `race_phase_service.py:239-240` asume ≥10 vueltas finales; `analysis.py:313` fallback 70 vueltas. Frontend colapsa sprint en `'Race'` (`lib/utils.ts:10`). Ninguna sesión sprint en `backend/cache/` (las 5 con meta son `Race`; 9304/9644 sin meta) → «validar contra una sprint real» (`:153`) requiere descargar una (token OpenF1, `config.py:16`).

**Veredicto:** CONFIRMADO. **Esfuerzo:** medio.

### 3.1 · Decisión previa: qué se almacena **[nuevo]**

**Plan:** «Opción A — guardar solo el JSON procesado. ~380 KB por sesión. Cuatro temporadas caben en ~200 MB.» (`:166-167`) · «Opción B — guardar también el crudo. ~48 MB por sesión, ~25 GB para el histórico completo.» (`:168-169`)

**Código / disco (medido con `ls -l`):**
- JSON procesado (`_analysis.json`): **47 121 – 51 185 B** (9197/9539/9566/9636). **≈48 KB, no ~380 KB** — el plan lo sobreestima ~8×. Si "procesado" incluye la telemetría precomputada (`telemetry_*.json`, 0,4-1,35 MB cada uno, 4-6 por sesión), el total por sesión sube a ≈4-5 MB, lo que tampoco es 380 KB. NO VERIFICADO qué incluía el plan en "procesado".
- Crudo OpenF1 (8 endpoints): 9636 ≈ **3,9 MB**, 9539 ≈ 4,8 MB. Los "~48 MB" coinciden con el **directorio completo** (9636 = 55 MB, de los que ≈50 MB son `car_data_*.json`, que **no son parte del pipeline `/analysis`**: solo los usa el fallback de telemetría en desarrollo, `telemetry_service.py:135-136`). Sin `car_data`, la opción B pesa ≈4-5 MB/sesión, ~10× menos de lo que asume el plan.
- Extrapolación "25 GB" y "200 MB": NO VERIFICADO (depende del número de sesiones del histórico, no está en el repo).
- «Si el pipeline es descargar → computar → guardar procesado → descartar»: hoy el crudo **sí se relee** — `telemetry.py:151-152` lee `laps.json`/`drivers.json` y `races.py:69-108` escanea `_session_meta.json`/`_analysis.json`; `force_refresh` (`analysis.py:220`) recomputa desde el crudo cacheado sin volver a OpenF1.

**Veredicto:** DESACTUALIZADO (las dos cifras de tamaño no coinciden con disco). **Esfuerzo:** bajo (rehacer la estimación con las cifras medidas).

### 3.2 · Backend con más memoria **[nuevo]**

**Plan:** «El límite actual de 512 MB es la causa del import perezoso de FastF1 y del alcance recortado del precómputo.» (`:179-180`) · «Verificar que desaparece el spin-down» (`:183`)

**Código:** el import perezoso y su motivo están documentados en `telemetry.py:6-10,20-24,125-127` y `fastf1_config.py:8-10` («512 MB free-tier container OOMs»). `render.yaml:1-15` no declara plan ni memoria. "Spin-down" y el límite real de 512 MB no son verificables desde el repo (configuración de Render). El "alcance recortado del precómputo" se refiere al workflow `.github/workflows/precompute-telemetry.yml:11-14` (14 pilotos por defecto) — el recorte allí no lo impone la memoria de Render sino el `timeout-minutes: 120` (`:26`) y la lista de pilotos.

**Veredicto:** CONFIRMADO (import perezoso por 512 MB, según comentarios del código); NO VERIFICADO el plan/memoria/spin-down actuales. **Esfuerzo:** — (presupuesto).

### 3.3 · Backfill histórico **[nuevo]**

**Plan:** «Script de backfill con respeto al rate limit» (`:189`) · «Confirmar que el precómputo sigue corriendo en GitHub Actions (7 GB de RAM, gratuito para repos públicos)» (`:192-193`)

**Código:**
- No existe script de backfill. `backend/scripts/` contiene solo `precompute_telemetry.py` (telemetría FastF1, no descarga OpenF1). El único mecanismo de descarga es `openf1_client.fetch_all` (`openf1_client.py:100-124`) invocado desde `/analysis` — es decir, el "backfill" hoy sería llamar al endpoint sesión a sesión. El respeto al rate limit existe a nivel de cliente: `Semaphore(2)` (`:13`), jitter 0,2-0,6 s (`:50`), backoff 2/5/10/20 s y `Retry-After` (`:26-27,65-78`).
- «Validar integridad de cada sesión descargada»: no hay validación; `fetch_all` devuelve lo que consigue y omite lo que falla (`:118-122`).
- Workflow de precómputo: existe y hace push a `main` (`precompute-telemetry.yml:79-99`). Los "7 GB de RAM" son una característica de los runners de GitHub, no verificable en el repo. NO VERIFICADO.
- «Backfill histórico completo … Plan Sponsor de OpenF1» (`:30`): el código soporta token (`config.py:16`, `openf1_client.py:42-44`) pero no distingue planes.

**Veredicto:** CONFIRMADO (nada de esto existe aún). **Esfuerzo:** medio.

### Sprint 4 · Modo live — premisas sobre la caché **[nuevo]**

**Plan:** «Toda la caché actual asume sesión inmutable y ausencia de TTL» (`:201-203`) · «Invalidación activa de caché, que hoy no existe en ningún servicio.» (`:212`)

**Código:** sin TTL: CONFIRMADO (`grep -rni "ttl|expir|mtime" backend/app` → 0). «Invalidación activa no existe» → **DESACTUALIZADO/parcial**: existen `POST /admin/clear-cache/{key}` (`admin.py:8-11` → `cache.clear`, `cache.py:201-204`), `?force_refresh=true` (`analysis.py:163,168`) y borrado automático de JSON ilegible (`cache.py:43-49` y análogos). Lo que no existe es invalidación **automática por tiempo o por evento**, que es lo que necesita el live.

**Veredicto:** CONFIRMADO en lo esencial; matiz de redacción. **Esfuerzo:** — (fuera de plan).

### Deuda técnica conocida (`SPRINT_PLAN.md:232-243`) **[nuevo]**

| Afirmación | Código | Veredicto | Esfuerzo |
|---|---|---|---|
| «Ventana fija de 3 vueltas en pit impact, no adaptativa por densidad de tráfico.» (`:236-237`) | `pit_service.py:54-56`: `pos_before = position_at_lap(dn, ln - 1, …)`, `pos_after = position_at_lap(dn, ln + 3, …)` — constantes `-1`/`+3`, sin lectura de intervals ni timeline. La ventana efectiva es de 4 vueltas (−1 … +3). | CONFIRMADO | medio |
| «`engineer-chat/route.ts`: segundo camino de chat en el frontend que no se usa en producción. Parece vestigial.» (`:238-239`) | 0 consumidores (`grep -rn "engineer-chat" frontend/{app,components,lib,hooks,stores}` → solo `route.ts:139`); `RadioOverlay.tsx:160` usa `sendToEngineer` → backend `/chat` (`api.ts:79`); `ANTHROPIC_API_KEY` comentada en `.env.local`; `.env.local.example:2` lo declara innecesario; aún arrastra `@anthropic-ai/sdk` (`package.json:12`) y `docs/api-contract.md:27-30` lo documenta como endpoint vigente. | CONFIRMADO (es vestigial) | bajo |
| «Confianza de telemetría fijada por fuente, no por cantidad real de datos disponibles.» (`:240-241`) | `telemetry_service.py:517` `confidence="High"` (FastF1), `:245` `confidence="Medium"` (OpenF1 car_data), `precompute_telemetry.py:213` `confidence="High"`. Constantes; no dependen de nº de puntos ni de pilotos servidos (el flex-match de `telemetry.py:81-89` puede devolver solo 2 de 5 pilotos y la confianza no cambia). | CONFIRMADO | bajo |
| «Cuando un servicio V4 falla, la tarjeta desaparece sin distinguir "falló" de "no aplica a esta carrera".» (`:242-243`) | Backend: fallo → `None`/`[]` sin flag (`analysis.py:320-359`); `race_phases=[]` y `crossover_windows=[]` son indistinguibles de "sin fases/sin crossover". Frontend: `race_dna` null → **desaparece** (`StrategyTab.tsx:63`); `drs_trains` null → **stub "Coming soon"** (`ManagementTab.tsx:47-49` → `stubs/DRSTrainDetector.tsx`, texto «available in next update»); `weather_analysis` null → **stub "Coming soon"** (`WeatherTab.tsx:14-16`); `clean_air_value` null → tarjeta con estado vacío (`CleanAirValueCard.tsx:6,17-18`). | CONFIRMADO, y peor de lo descrito: en dos casos no desaparece sino que muestra "Coming soon" para una funcionalidad ya existente. | bajo (flag en respuesta) · bajo (quitar stubs) |

### Resumen de la Parte 2

| Punto | Veredicto | Esfuerzo |
|---|---|---|
| Premisa 9539 = 62/Medium | DESACTUALIZADO (es High) | bajo |
| Estado de partida (4 ítems) | YA RESUELTO ×3 · NO VERIFICADO ×1 (rondas de validación) | — |
| 1.1 | Fuera de alcance del repo | — |
| 1.2 | CONFIRMADO; premisa del lock DESACTUALIZADA; UI de `/chat` no muestra errores del body | bajo |
| 1.3 | CONFIRMADO; segundo punto sin guard (`:214`); ningún guard invalida el archivo | bajo |
| 1.4 | CONFIRMADO; mecanismo V4 DESACTUALIZADO; parseo 425 roto | medio |
| 1.5 | CONFIRMADO backend; "chips de UI" no existen | bajo |
| 2.1 | CONFIRMADO; sin harness de validación | bajo/medio |
| 2.2 | CONFIRMADO; prefijo cacheable 100 % por sesión | bajo |
| 2.3 | CONFIRMADO; referencia 9539 DESACTUALIZADA y con `weather` falso positivo | medio |
| 2.4 | CONFIRMADO; no hay sprint en caché | medio |
| 3.1 | DESACTUALIZADO (380 KB → 48 KB; 48 MB → ≈4-5 MB sin `car_data`) | bajo |
| 3.2 | CONFIRMADO (código) · NO VERIFICADO (infra) | — |
| 3.3 | CONFIRMADO (no existe) | medio |
| Sprint 4 premisas | CONFIRMADO con matiz (hay invalidación manual) | — |
| Deuda técnica (4) | CONFIRMADO ×4; la 4ª es peor de lo descrito | bajo/medio |

---

## PARTE 3 — Deriva entre contratos (Pydantic ↔ TypeScript)

Comparación campo a campo de `backend/app/domain/models.py` con `frontend/types/index.ts` y `frontend/types/telemetry.ts`.

### 3.1 Campos con tipo/nombre distinto

| Modelo.campo | Backend | Frontend | Riesgo |
|---|---|---|---|
| `DriverCleanAirEstimate.confidence` | `Literal["Low","Medium"]` (`models.py:261`, comentario "never High") | `'Low' \| 'Medium' \| 'High'` (`index.ts:263`) | Frontend más laxo; inofensivo |
| `CleanAirValue.confidence` | `Literal["Low","Medium"]` (`models.py:266`) | `'Low' \| 'Medium' \| 'High'` (`index.ts:268`) | ídem |
| `RaceListItem.country_name` / `circuit_short_name` / `date_start` | `Optional[str] = None` (`models.py:302-304`) | `string` no-null (`index.ts:298-301`) | Frontend asume no-null; `RaceSelector.tsx:128` ya hace `?? ''` para `circuit_short_name`; `date_start` sin guard NO VERIFICADO en uso |
| `SessionInfo.date_start` | `Optional[str] = None` (`models.py:312`) | `string` (`index.ts:309`) | ídem |
| `RacePhase.color_token` | `str` (`models.py:171`, comentario con valores) | unión literal (`index.ts:154`) | Frontend más estricto; backend no valida |
| `DriverTelemetry.lap_mode` | `str = "fastest_clean"` (`models.py:337`) | `'fastest_clean' \| 'representative'` (`telemetry.ts:42`) | ídem |
| `TelemetryData.sector_boundaries` | `dict` (`models.py:357`) | `SectorBoundaries {sector_1_end, sector_2_end}` (`telemetry.ts:55-58,67`) | Frontend más estricto |
| `TyreDegradationRow.compound` | `str` (`models.py:57`) | `'SOFT'\|…\| string` (`index.ts:52`) | Equivalente |
| `TelemetryPoint.lat_g/lon_g/lap_number/race_time` | `Optional[...] = None` (`models.py:326-329`) | `?: number \| null` (`telemetry.ts:13-16`) | Equivalente |
| `ChatResponse` | Pydantic `answer, cited_signals: list[str]=[], confidence: str="Medium"` (`chat.py:32-35`) | Inline `{answer; cited_signals?: string[]; confidence?: string}` (`api.ts:78`) — no hay tipo nombrado | Equivalente |
| `ChatRequest` | `session_key:int, question:str, focused_driver:str\|None` (`chat.py:26-29`) | inline `api.ts:74-78` | Equivalente |

### 3.2 Existe en uno y no en otro

- **Solo en TS:** `DRSTrainAnalysis` (`index.ts:246-253`, comentario "Legacy") — no existe en Pydantic (el backend expone `DRSAnalysisAggregated`, `models.py:210-214`). `GGPoint`, `GForceState`, `SectorBoundaries`, `TelemetryMetric` (`telemetry.ts:19-35,55-58,74`) son tipos internos de UI sin contraparte (legítimo).
- **Solo en Pydantic:** ninguno de los modelos incluidos en `FullRaceAnalysis` (`models.py:273-296`) falta en TS. `DRSTrainSnapshot` (`models.py:155-159`) existe en ambos pero **no se serializa** en `FullRaceAnalysis` (no es campo de ningún modelo expuesto) — solo uso interno de `drs_service`.
- `FullRaceAnalysis`: 16 campos en ambos lados con los mismos nombres (`models.py:273-296` ↔ `index.ts:275-292`). `RaceMeta`, `RaceBrain`, `TruePaceRow`, `RaceClassificationRow`, `TyreDegradationRow`, `PitImpactRow`, `ChaosIndex/Components`, `EngineerNote`, `RaceDecision`, `WeatherEvent/Lap/Analysis`, `RacePhase`, `RaceDNA`, `TrainDynamics`, `MeaningfulDRSTrain`, `DRSAnalysisAggregated`, `CrossoverWindow`, `WeatherWinner/Loser/WinnersLosers`: mismos campos y nombres.

### 3.3 Campos definidos en los tipos TS que ningún componente usa

Método: grep por palabra completa en `frontend/{app,components,lib,hooks,stores}` (es decir, fuera de `types/`); 0 apariciones ⇒ no usado. Conservador: no detecta acceso dinámico (`obj[key]`), no se ha observado ninguno.

| Campo | Tipo TS | Nota |
|---|---|---|
| `air_temp` | `WeatherEvent`, `WeatherLap` (`index.ts:119,127`) | El backend lo calcula y envía |
| `average_gap` | `MeaningfulDRSTrain` (`:224`) | ídem |
| `breaker_gap_opened`, `dynamics_note` | `TrainDynamics` (`:212,215`) | ídem |
| `early_drivers` | `CrossoverWindow` (`:179`) | ídem (`best_timed_drivers` y `late_drivers` sí se usan) |
| `sample_in_train`, `sample_post_train` | `DriverCleanAirEstimate` (`:261-262`) | ídem |
| `circuit_key` | `TelemetryData` (`telemetry.ts:61`) | ídem |
| `driver_codes`, `gaps`, `train_length` | `DRSTrainSnapshot` (legacy, `index.ts:239-244`) | Tipo entero no usado |
| `trains_detected`, `peak_train_length`, `peak_train_lap`, `most_affected_drivers` | `DRSTrainAnalysis` (legacy, `:246-253`) | Tipo entero no usado |
| `total_g` | `GForceState` (`telemetry.ts:34`) | Tipo entero no usado |

**Tipos exportados que nadie importa fuera de `types/`:** `RaceMeta`, `WeatherEvent`, `TrainDynamics`, `DRSTrainSnapshot`, `DRSTrainAnalysis`, `DriverCleanAirEstimate`, `GGPoint`, `GForceState`, `SectorBoundaries`, `TelemetryMetric` (los tres primeros y `DriverCleanAirEstimate` se consumen igualmente vía el tipo padre; los legacy/UI son código muerto).

**Veredicto global Parte 3:** deriva **baja**; sin roturas en runtime detectables por lectura. Principales puntos: `RaceListItem`/`SessionInfo` nullabilidad, `confidence` de clean-air, tipo legacy `DRSTrainAnalysis`.
**Esfuerzo:** bajo.

---

## PARTE 4 — Salud general

### 4.1 Tests

- **No existe ningún test en el repo.** `find backend frontend` (excluyendo `.venv`, `node_modules`, `.next*`) por `test_*.py`, `*_test.py`, `*.test.ts(x)`, `*.spec.ts`, `conftest.py`, `pytest.ini`, `pyproject.toml`, `jest.config*`, `vitest.config*` → **0 resultados**. No existen `backend/tests/`, `frontend/__tests__/` ni `frontend/tests/`.
- `frontend/package.json:5-10` no tiene script `test`; sin dependencias de test (`:11-27`). `backend/requirements.txt:1-11` no incluye `pytest`. `.gitignore:26` ignora `backend/.pytest_cache/` pero no hay tests que lo generen.
- CI: el único workflow (`.github/workflows/precompute-telemetry.yml`) precomputa telemetría y hace commit a `main` (`:79-99`); **no ejecuta tests, lint ni type-check**.
- Por tanto: **no hay test sobre el pipeline de análisis ni sobre utilidades.** La única "validación" documentada es un comentario manual en `classification_service.py:7-9` (comparación con F1.com para 9636).

**Veredicto:** CONFIRMADO — cobertura 0 %. **Esfuerzo:** medio (fixtures ya existen en `backend/cache/` para tests de snapshot del pipeline).

### 4.2 Variables de entorno

Backend — todas tienen default en `Settings` (`config.py:13-34`, lee `backend/.env`, `extra="ignore"`). **Ninguna es estrictamente requerida para arrancar**:

| Variable | Default | Si falta / efecto |
|---|---|---|
| `OPENF1_BASE_URL` | `https://api.openf1.org/v1` (`:14`) | — |
| `OPENF1_API_TOKEN` | `""` (`:16`) | Sin token: 401 de OpenF1 → `[]` sin reintento (`openf1_client.py:57-63`); `/races/{id}/sessions` cae al escaneo de caché o 404 (`races.py:123-133`); `/analysis` de sesión no cacheada → 404 `session_not_cached` (`analysis.py:237-247`). Solo funcionan las sesiones con raw en `backend/cache/`. |
| `CACHE_DIR` | `backend/cache` absoluto (`:10,17`) | — |
| `ENVIRONMENT` | `development` (`:18`) | Si no es `production`, `/telemetry` intenta importar FastF1 (`telemetry.py:111,127`) — en Render sin `production` OOM según comentarios `telemetry.py:6-10`, `fastf1_config.py:8-10`. `render.yaml:11-12` lo fija. |
| `CORS_ORIGINS` | 4 orígenes localhost (`:19-24`) | En producción sin setear, el frontend desplegado es bloqueado por CORS (`main.py:21-27`). `render.yaml:13-14` solo lo comenta. |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | `127.0.0.1:11434` / `llama3.1:8b` (`:27-28`) | Sin Ollama: 5 s de timeout por mensaje y salto a Groq (`ollama_client.py:43-48`). |
| `GROQ_API_KEY` | `""` (`:31`) | Sin key y sin Ollama: respuesta fija "Engineer radio offline" con HTTP 200 (`ollama_client.py:194,202-207`); `/chat/health.ai_ready=false`. |
| `GROQ_MODEL` | `openai/gpt-oss-120b` (`:32`) | Discrepa de `.env.example:34` (`llama-3.1-8b-instant`). |
| `PYTHON_VERSION` | `3.11.0` (`render.yaml:9-10`) | Solo Render. |

Frontend:
| Variable | Default | Efecto si falta |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` (`api.ts:5`, `RaceSelector.tsx:10`) | En producción apuntaría a localhost → todas las llamadas fallan → `RaceSelector` muestra "Backend offline" (`:65`); `useRaceAnalysis` → `OPENF1_ERROR` por `TypeError` de fetch (`errors.ts:76-81`). `frontend/.env.local` la define (valor no reproducido). |
| `ANTHROPIC_API_KEY` | ninguno | Solo la usa `route.ts:5-7,112`; comentada en `.env.local`; sin ella la ruta responde "Demo mode" (`route.ts:112-121`). Irrelevante en producción (ruta sin consumidores). |

**Veredicto:** CONFIRMADO. **Esfuerzo:** bajo (alinear `.env.example` y `render.yaml`).

### 4.3 Código muerto o duplicado

**`frontend/app/api/engineer-chat/route.ts` — ¿se usa en producción?** **No.** Verificación:
- Ningún `fetch('/api/engineer-chat')` ni referencia en `frontend/{app,components,lib,hooks,stores}` (`grep -rn "engineer-chat"` → solo `route.ts:139`, su propio `console.error`).
- La UI de chat (`RadioOverlay.tsx:160`) llama a `sendToEngineer` → `POST {NEXT_PUBLIC_API_URL}/chat` (`api.ts:79`), es decir, al backend FastAPI. El alias `engineerChat` (`api.ts:93-104`) también va al backend y tampoco lo llama nadie.
- `ANTHROPIC_API_KEY` está comentada en `frontend/.env.local` y `.env.local.example:2` dice explícitamente "No ANTHROPIC_API_KEY needed".
- La ruta **sí se compila y despliega** como función serverless (Next.js App Router + `@netlify/plugin-nextjs`, `netlify.toml:6-7`) pero nada la invoca. Arrastra la dependencia `@anthropic-ai/sdk ^0.100.1` (`package.json:12`). `docs/api-contract.md:27-30` aún la documenta como el endpoint de chat → DESACTUALIZADO.
- Está trackeada en git (`git ls-files` la lista).

Otro código muerto verificado (0 referencias fuera de su definición):
| Elemento | Referencia |
|---|---|
| `call_ollama()` | `backend/app/clients/ollama_client.py:59-120` |
| `cache.get_telemetry/set_telemetry/_TELEMETRY_FILENAME` | `backend/app/core/cache.py:17,90-118` |
| `cache.get_analysis/set_analysis` alias | `cache.py:121-128` (solo `chat.py:74` usa `get_analysis`; `set_analysis` sin uso) |
| Imports `aggregate_drs_trains, compute_raw_snapshots` | `backend/app/api/analysis.py:19` |
| `backend/app/domain/enums.py` completo | 0 imports en `backend/app` |
| `fetchAnalysisForceRefresh`, `clearCache`, `engineerChat` | `frontend/lib/api.ts:41-51,93-104` |
| `frontend/components/analysis/StrategyViewGrid.tsx` | no importado (sustituido por `tabs/*`); único sitio que importa `stubs/WeatherOverlay` junto con `WeatherTab` |
| `frontend/components/analysis/RaceBrain.tsx` | no importado (existe `strategy/RaceBrainV2.tsx`) |
| `frontend/lib/audio/engineSound.ts` | no importado |
| `frontend/lib/mock/brazil_2024.json` (13 241 B, trackeado) | 0 referencias |
| Tipos `DRSTrainAnalysis`, `DRSTrainSnapshot`, `GGPoint`, `GForceState`, `SectorBoundaries`, `TelemetryMetric` | `frontend/types/*` (ver 3.3) |
| `SessionUnavailableState` `CONFIG.ANALYSIS_FAILED` / `CONFIG.UNKNOWN` | `SessionUnavailableState.tsx:38-47` (nunca se renderiza con esos códigos, `page.tsx:51-56`) |

Duplicados verificados:
| Qué | Dónde |
|---|---|
| `_parse_ts`, `_build_lap_time_index`, `_lap_for_time` (3 copias casi idénticas) | `weather_service.py:12-55`, `drs_service.py:29-64`, `timeline_builder.py:14-50`; `_parse_ts` también en `telemetry_service.py:80` |
| Umbrales Chaos 25/50/80 | `chaos_service.py:65-72`, `analysis.py:109-124`, `RaceSelector.tsx:13-18`, `RaceBrainV2.tsx:8-14` (divergente) |
| `TELEMETRY_SESSIONS` y `TELEMETRY_PREFETCH_SESSIONS` (mismo set) | `RaceSelector.tsx:11,20` |
| Lógica `focused_driver_note` | `ollama_client.py:76-82` y `:160-165` |
| Log duplicado en fallback de sesiones | `races.py:126-127` (dos `logger.info` consecutivos con el mismo hecho) |
| Componentes `strategy/DRSTrainDetector` y `stubs/DRSTrainDetector` (ídem `WeatherOverlay`) coexistiendo | `ManagementTab.tsx:7,9`, `WeatherTab.tsx:4-5` |
| `frontend/.next.stale/` (build viejo, 30+ archivos, ignorado por git) | `.gitignore:40` |

**Esfuerzo:** bajo (borrado) · medio (unificar helpers de timeline y umbrales, requiere regenerar cachés si cambia output).

### 4.4 Manejo de errores — sitios donde se captura una excepción y se devuelve algo genérico

Backend:
| Archivo:línea | Captura | Qué recibe el usuario |
|---|---|---|
| `analysis.py:175-179` | `Exception` al obtener meta de sesión | Nada; sigue con `{}` → puede acabar en 404 `session_not_cached` con mensaje "not available in the production demo" aunque la causa fuera red/OpenF1 |
| `analysis.py:82-83` | `Exception` en reintentos de `/meetings` | `meeting_name` vacío/fallback "Session N" (`:269`) |
| `analysis.py:221-222` | `RuntimeError` de `load_session` | 503 con `str(exc)` — rama inalcanzable (ver 1.4) |
| `analysis.py:326-359` (×5) | `Exception` en cada servicio V4 | Módulo ausente (`None`/`[]`) **sin indicación** en la respuesta; solo `logger.warning` |
| `analysis.py:172,214,277-316` | **sin captura** | 500 `Internal Server Error` de FastAPI → frontend `ANALYSIS_FAILED` con mensaje falso ("Available modules are shown below") |
| `chat.py:84-90` | `Exception` en `model_validate` | 500 "Cached analysis is corrupted." (no borra el archivo) |
| `chat.py:60-68` | `Exception` en `/chat/health` | 200 con `ollama_reachable=false, error=str(exc)` |
| `ollama_client.py:47-48` | `Exception` en `/api/tags` | `None` → salta Ollama en silencio |
| `ollama_client.py:190-191` | `Exception` en Ollama chat | Salta a Groq; causa solo en log |
| `ollama_client.py:199-200` | `Exception` en Groq | **200 con "Engineer radio offline… set GROQ_API_KEY"** aunque la key exista y el fallo sea 429/timeout/modelo inválido |
| `ollama_client.py:112-120` | (código muerto `call_ollama`) | — |
| `openf1_client.py:85-93` | `HTTPStatusError`/`RequestError` | reintento; tras 4 → `RuntimeError` |
| `openf1_client.py:118-122` | `RuntimeError`/`OpenF1RateLimitError` | **Endpoint omitido en silencio**; análisis parcial sin aviso |
| `races.py:34-43` | `RequestError`/`HTTPStatusError` | 503 `"OpenF1 unreachable: …"` / status de OpenF1 con `"OpenF1 error"` |
| `races.py:92-93,106-107` | `Exception` leyendo JSON de caché | Sesión omitida del fallback |
| `races.py:138-139` | `RequestError` | 503 |
| `telemetry.py:77-79` | `Exception` leyendo candidato | Candidato ignorado |
| `cache.py:43-49,71-77,104-110,139-144,161-166,184-189` | `JSONDecodeError`/`OSError` | Archivo borrado, `None` → recomputa |

Frontend:
| Archivo:línea | Captura | Qué ve el usuario |
|---|---|---|
| `lib/api.ts:14-20` | body no JSON | `ApiError(status, "API error {status}: {path}")` |
| `lib/errors.ts:83-86` | cualquier otro error | `UNKNOWN` con `err.message` (p. ej. "API error 404: /analysis/N") |
| `hooks/useRaceAnalysis.ts:72-76` | todo → `parseAnalysisError` | ver `page.tsx:50-100` |
| `app/race/[sessionKey]/page.tsx:72-100` | `ANALYSIS_FAILED`/`UNKNOWN` | Panel "Analysis Failed" + `error.message` |
| `components/radio/RadioOverlay.tsx:167-171` | cualquier fallo de `/chat` | "Comms interference. Unable to reach pit wall. Try again." |
| `RadioOverlay.tsx:96-98,147-149` | fallo de `/chat/health` | estado `offline` |
| `components/landing/RaceSelector.tsx:65` | fallo de `/races` | "Backend offline — use featured races below" |
| `RaceSelector.tsx:103-105` | fallo de `/sessions` (no abort) | lista vacía sin mensaje |
| `lib/api.ts:130,135-137` | `/telemetry` | `null` / `'production_unavailable'` |
| `app/api/engineer-chat/route.ts:138-143` | cualquier error | 500 "Radio signal lost. Try again." (ruta muerta) |

**Esfuerzo:** medio (contrato de errores parciales en `FullRaceAnalysis` + propagación de causa real en `/chat`).

---

## PARTE 5 — Preguntas abiertas (no determinables leyendo el código)

1. ~~**¿Dónde está `SPRINT_PLAN.md`?**~~ **RESUELTO (2026-09-15):** el archivo está en la raíz, sin trackear. La Parte 2 se ha reconciliado contra él. Queda pendiente solo si se quiere commitear.
2. **Proveedor LLM real en producción y modelo efectivo de Groq.** Render puede tener `GROQ_MODEL`/`GROQ_API_KEY` en el dashboard; el código por defecto usa `openai/gpt-oss-120b` (`config.py:32`) y `.env.example` dice `llama-3.1-8b-instant`. ¿Cuál está activo? (Determina si el prompt caching de 2.2 es aplicable.)
3. **Valores de `CORS_ORIGINS` y `NEXT_PUBLIC_API_URL` en producción** (Render / Netlify / Vercel): el repo tiene configuración para Netlify (`netlify.toml`) y Vercel (`frontend/vercel.json`); ¿cuál es el deploy vivo?
4. **¿Se ha observado alguna vez el 500 por `_analysis.json` con esquema antiguo (1.3) en producción?** Las 4 cachés del repo tienen fecha `Aug 24 21:08` (posteriores al último cambio de modelo en git log: `6942714 fix: regenerate remaining cached sessions…`), pero no puedo verificar que validen contra el modelo actual sin ejecutar el servidor. El script de medición de 2.1 sí las validó con `FullRaceAnalysis.model_validate` sin error para 9636, 9539, 9197, 9566 → **para esas 4, validan hoy**. 9662, 9304, 9644 no tienen `_analysis.json`.
5. **Sesiones 9304 y 9644** en `backend/cache/`: no tienen `_session_meta.json` ni `_analysis.json`. ¿Qué son y deben seguir en el repo (3,5 MB)?
6. ~~**Nota "Rainfall — strategy window opens" en 9539 (España 2024, carrera seca)** aparece como primera `engineer_note` (y por tanto como `cited_signal`). ¿Es conocido?~~ **RESUELTO (2026-09-15):** verificado en `DIAGNOSTIC_ADDENDUM.md` §C. Es un **falso positivo**: un único registro de `rainfall=1` de 1 minuto (13:06:38 UTC, vuelta 3) entre 153 registros en seco en `backend/cache/9539/weather.json`, sin firma térmica ni de humedad, sin compuestos de lluvia en `stints.json` y sin paradas en L3-8. Dispara la nota (`notes_service.py:175-201`), +10 puntos de Chaos (`chaos_service.py:18-27,97`), 2 crossovers `High` y la fase "Weather Crossover" L1-8. Sin el componente weather el score de 9539 sería 52 → sigue "High".
7. **¿Debe `car_data_*.json` (≈82 MB, 11 archivos) seguir trackeado en git?** Solo lo usa el fallback OpenF1 de telemetría en desarrollo (`telemetry.py:141-159`); en producción la ruta corta en `:111-122` antes de llegar ahí.
8. **Intención de `frontend/app/api/engineer-chat/route.ts`:** ¿se mantiene como alternativa futura (Anthropic) o es residuo a eliminar junto con `@anthropic-ai/sdk`?
9. **Rendimiento del disco local:** durante el diagnóstico `git log --all` falló con `mmap failed: Operation timed out` y algunos comandos tardaron >2 min; no es un hallazgo del repo, pero conviene saber si el repo (121 MB de caché + 461 MB FastF1) está en un volumen lento o sincronizado.

---

## Resumen ejecutivo (solo hallazgos verificados)

| Área | Estado | Esfuerzo |
|---|---|---|
| SPRINT_PLAN.md | Presente en la raíz (sin trackear); Parte 2 reconciliada contra su texto. Dos premisas del plan DESACTUALIZADAS: 9539 es Chaos 62/**High**, no Medium; tamaños de 3.1 (380 KB / 48 MB) no coinciden con disco (48 KB / ≈4-5 MB sin `car_data`) | bajo |
| Rate limit `/chat` | No existe | bajo |
| Lock `/analysis` | Single-flight por sesión/proceso; no cubre caché rápida ni `/chat`; dict sin evicción | bajo |
| Caché corrupta | Guard solo en `chat.py`; `analysis.py:172,214` sin try/except; ninguno borra el archivo | bajo |
| Códigos `OPENF1_*`/`ANALYSIS_FAILED` | Solo frontend, derivados de status; 429/503 inalcanzables desde `/analysis`; parseo del 425 roto (`errors.ts:42-52`) | medio |
| `cited_signals` | 3 primeros títulos de notas; `confidence` fijo "Medium"; frontend los ignora | medio |
| LLM | Ollama → Groq → texto offline; prompt en `ollama_client.py:19-37`; ≈1.7-2.2k tokens/mensaje; sin historial | bajo |
| Prompt caching | Ninguno; system prompt 100 % idéntico por sesión | bajo |
| Chaos Index | Sin `total_laps`; umbrales 25/50/80 duplicados ×4 con divergencia en `RaceBrainV2` | bajo/medio |
| Sprint vs Race | Ningún servicio lo distingue | medio |
| Caché | JSON sin TTL; 9636 = 55 MB (3,9 MB raw + 48 KB análisis + 50 MB car_data) | bajo/medio |
| Contratos | Deriva baja; nullabilidad `RaceListItem`/`SessionInfo`; 16 campos TS sin uso; 10 tipos sin uso | bajo |
| Tests | **0** | medio |
| Código muerto | `route.ts` (no usado en prod), `call_ollama`, `StrategyViewGrid`, `RaceBrain.tsx`, `enums.py`, mock JSON, etc. | bajo |
| Errores | Fallos parciales silenciosos (V4 y endpoints OpenF1); mensajes genéricos que ocultan la causa en `/chat` y `ANALYSIS_FAILED` | medio |
