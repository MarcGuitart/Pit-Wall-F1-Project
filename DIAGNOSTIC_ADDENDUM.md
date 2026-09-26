# DIAGNOSTIC_ADDENDUM.md — Segunda pasada

Fecha: 2026-09-15 · Rama `feat/race-classification` · Solo lectura sobre el código. Complementa `DIAGNOSTIC.md` (cuya Parte 2 se ha reescrito contra el `SPRINT_PLAN.md` real).

Exclusiones de escaneo aplicadas en toda esta pasada: `backend/.venv/`, `frontend/node_modules/`, `frontend/.next*/`, `__pycache__/`.

---

## B — Alcance real del bug de desempaquetado de errores

### B.1 Cómo llega el cuerpo del error al parser

`frontend/lib/api.ts:7-23` (`apiFetch`): si `!res.ok`, hace `detail = await res.json()` (`:16`) y lanza `new ApiError(res.status, "API error {status}: {path}", detail)` (`:20`). Por tanto **`err.detail` = el body JSON completo de la respuesta**, tal cual lo envía el servidor. Si el body no es JSON, `detail = undefined` (`:17-19`).

`ApiError` (`frontend/lib/errors.ts:16-26`) guarda `status` y `detail` sin transformarlos.

### B.2 Todas las rutas por las que `errors.ts` lee el cuerpo

`parseAnalysisError` (`frontend/lib/errors.ts:28-87`), en orden de evaluación:

| Línea | Condición | Ruta leída sobre el body | Qué espera |
|---|---|---|---|
| `:30-41` | `status === 404` | `body.detail.code` (`:32-33`), `body.detail.message` (`:37`) | `{ detail: { code: "session_not_cached", message } }` — **desanida correctamente** |
| `:42-52` | `status === 425` | `body.message` (`:47`), `body.retry_after_minutes` (`:49`), `body.unlock_at_utc` (`:50`) | Lee en el **nivel raíz** — **no desanida** |
| `:53-59` | `status === 429` | — (no lee body) | mensaje fijo |
| `:60-67` | `status === 503` | `body.detail` como `string` (`:64`) | `{ detail: "texto" }` — correcto para `HTTPException(detail=str)`; **incorrecto** si `detail` es objeto (`JSONResponse` de telemetría, ver B.3) — el `?? fallback` no salta porque un objeto no es nullish, y el mensaje sería `[object Object]` |
| `:68-73` | `status === 500` | — (no lee body) | mensaje fijo |
| `:76-81` | `TypeError` con "fetch" | — | mensaje fijo |
| `:83-86` | resto | `err.message` (no es body; es `"API error {status}: {path}"`) | — |

Resumen: de las 7 ramas, **3 leen el body** y usan **3 convenciones distintas** (`body.detail.x`, `body.x`, `body.detail` string). Solo la 404 coincide con lo que FastAPI produce para un `detail` objeto.

### B.3 Todas las formas en que el backend construye un error

No hay handlers globales: `grep -rn "exception_handler|add_exception_handler|RequestValidationError|@app.middleware" backend/app` → 0. Solo `CORSMiddleware` (`main.py:21-27`). Por tanto aplican los defaults de FastAPI/Starlette.

| # | Archivo:línea | Construcción | Status | JSON exacto que sale |
|---|---|---|---|---|
| 1 | `analysis.py:192-204` | `HTTPException(detail={...})` | 425 | `{"detail": {"code":"SESSION_NOT_HISTORICAL_YET","message":"…","unlock_at_utc":"<iso>","retry_after_minutes":<int>}}` |
| 2 | `analysis.py:248-260` | `HTTPException(detail={...})` | 425 | `{"detail": {"code":"SESSION_NOT_HISTORICAL_YET","message":"…","unlock_at_utc":null,"retry_after_minutes":30}}` |
| 3 | `analysis.py:238-247` | `HTTPException(detail={...})` | 404 | `{"detail": {"code":"session_not_cached","message":"…"}}` |
| 4 | `analysis.py:261-264` | `HTTPException(detail=str)` | 404 | `{"detail": "No lap data found for session N"}` |
| 5 | `analysis.py:221-222` | `HTTPException(detail=str(exc))` | 503 | `{"detail": "OpenF1 unreachable after 4 attempts: laps"}` (rama inalcanzable hoy: `openf1_client.py:118` traga el `RuntimeError`) |
| 6 | `chat.py:76-82` | `HTTPException(detail=str)` | 404 | `{"detail": "No analysis cached for session N. Call GET /analysis/N first."}` |
| 7 | `chat.py:88-90` | `HTTPException(detail=str)` | 500 | `{"detail": "Cached analysis is corrupted."}` |
| 8 | `races.py:38`, `:139` | `HTTPException(detail=str)` | 503 | `{"detail": "OpenF1 unreachable: …"}` |
| 9 | `races.py:43` | `HTTPException(status=<de OpenF1>, detail=str)` | 4xx/5xx variable (el que devuelva OpenF1, p. ej. 401/429/500) | `{"detail": "OpenF1 error"}` |
| 10 | `races.py:130-133` | `HTTPException(detail=str)` | 404 | `{"detail": "Session list not in cache and OpenF1 requires authentication. Set OPENF1_API_TOKEN."}` |
| 11 | `telemetry.py:101-107` | `JSONResponse(content={...})` | 503 | `{"error":"telemetry_race_only","message":"…"}` — **sin envoltorio `detail`** |
| 12 | `telemetry.py:112-122` | `JSONResponse(content={...})` | 503 | `{"error":"telemetry_not_precomputed","message":"…"}` — **sin envoltorio `detail`** |
| 13 | `telemetry.py:131-137` | `HTTPException(detail={...})` | 404 | `{"detail": {"code":"ANALYSIS_NOT_FOUND","message":"…"}}` |
| 14 | `telemetry.py:162-168` | `HTTPException(detail={...})` | 404 | `{"detail": {"code":"TELEMETRY_UNAVAILABLE","message":"…"}}` |
| 15 | (default FastAPI) validación de query/body — p. ej. `lap_mode` fuera del patrón `telemetry.py:33`, `session_key` no entero, body de `/chat` inválido | 422 | `{"detail": [{"loc":[…],"msg":"…","type":"…"}]}` — `detail` es **array** |
| 16 | (default Starlette) excepción no capturada — servicios V1-V3 sin try/except `analysis.py:277-316`, `model_validate` `:172,:214` | 500 | **`Internal Server Error` en texto plano, no JSON** (`ServerErrorMiddleware`). En petición cross-origin, la respuesta sale sin cabeceras CORS porque `CORSMiddleware` (`main.py:21`) queda por dentro del middleware de error — comportamiento estándar de Starlette; NO VERIFICADO en runtime aquí. |

**Formas distintas de body que produce el backend: 5.**
- (a) `{"detail": "<string>"}` — filas 4-10.
- (b) `{"detail": {code, message, …}}` — filas 1-3, 13-14 (con campos extra en 1-2).
- (c) `{"error", "message"}` sin `detail` — filas 11-12.
- (d) `{"detail": [ {loc,msg,type} ]}` — fila 15.
- (e) texto plano no JSON — fila 16.

### B.4 Cruce backend ↔ frontend

| Backend (fila B.3) | Status | Rama de `errors.ts` | ¿Encaja? | Efecto real |
|---|---|---|---|---|
| 3 (`session_not_cached`) | 404 | `:30-41` lee `body.detail.code/message` | **Sí** | `SESSION_NOT_CACHED` con mensaje del backend |
| 4 (`"No lap data found…"`) | 404 | `:30-41` → `body.detail.code` es `undefined` en un string → cae al final | **No** | `UNKNOWN`, mensaje `"API error 404: /analysis/N"` (`api.ts:20`); el texto del backend se pierde |
| 1, 2 (425 objeto) | 425 | `:42-52` lee `body.message`, `body.retry_after_minutes`, `body.unlock_at_utc` | **No** (lee un nivel arriba) | `SESSION_NOT_HISTORICAL_YET` con mensaje **fallback** de `errors.ts:48`; `retryAfterMinutes`/`unlockAtUtc` `undefined` → `SessionUnavailableState.tsx:58-60` no arranca countdown, `:78-83` no muestra hora |
| 5 (503 string) | 503 | `:60-67` lee `body.detail` string | Sí en forma, **inalcanzable** en práctica | — |
| 9 (status de OpenF1, p. ej. 429) | variable | si 429 → `:53-59`; si 401 → ninguna rama → `UNKNOWN` | Parcial | Solo aplica a `/races`, que no usa `parseAnalysisError` (ver B.5) |
| 15 (422 array) | 422 | ninguna rama | **No** | `UNKNOWN` con `"API error 422: …"` |
| 16 (500 texto plano) | 500 | `api.ts:16-19` → `res.json()` falla → `detail=undefined`; `:68-73` no lee body | Sí por accidente (mensaje fijo) | `ANALYSIS_FAILED` con mensaje falso «Available modules are shown below» (`page.tsx:72-100` no muestra ningún módulo). Si el browser bloquea por CORS ausente → `TypeError` → `OPENF1_ERROR` «Could not connect to the backend» (`:76-81`). NO VERIFICADO cuál de los dos ocurre en producción. |
| 6, 7 (`/chat`) | 404/500 | — | **No pasa por `errors.ts`** | `sendToEngineer` (`api.ts:84-86`) lanza `ApiError` **sin leer el body**; `RadioOverlay.tsx:167-171` muestra texto fijo «Comms interference…». El mensaje "Cached analysis is corrupted." nunca llega al usuario. |
| 11, 12 (`{error,message}`) | 503 | — | Parser propio: `api.ts:125-132` lee `body.error` | **Sí** (contrato distinto, consumidor distinto) |
| 13, 14 (telemetría 404 objeto) | 404 | — | `api.ts:133` → `return null` sin leer body | El `code`/`message` se descartan |
| 8, 10 (`/races*`) | 503/404 | — | `RaceSelector.tsx:65,104` `.catch` genérico | Texto fijo «Backend offline…» o lista vacía |

### B.5 Otros consumidores de errores fuera de `errors.ts`

| Archivo:línea | Endpoint | Qué hace con el error |
|---|---|---|
| `frontend/lib/api.ts:84-86` (`sendToEngineer`) | `/chat` | `throw new ApiError(res.status, "Chat error N")` — **no lee body** |
| `frontend/lib/api.ts:63-66` (`fetchChatHealth`) | `/chat/health` | Devuelve objeto sintético `{ollama_reachable:false, error:"HTTP N"}` |
| `frontend/lib/api.ts:45-51` (`clearCache`, sin usos) | `/admin/clear-cache` | `ApiError` sin body |
| `frontend/lib/api.ts:116-138` (`getTelemetry`) | `/telemetry` | Parser propio: `503` → `body.error` (`:127-129`); otro `!ok` → `null` (`:133`); excepción → `null` (`:135-137`) |
| `frontend/components/radio/RadioOverlay.tsx:167-171` | `/chat` | `catch {}` → mensaje fijo |
| `frontend/components/radio/RadioOverlay.tsx:96-98,147-149` | `/chat/health` | → estado `offline` |
| `frontend/components/landing/RaceSelector.tsx:65` | `/races` | `.catch(() => setBackendError('Backend offline — use featured races below'))` |
| `frontend/components/landing/RaceSelector.tsx:104` | `/races/{id}/sessions` | `.catch` → `setSessions([])` si no es `AbortError` |
| `frontend/components/analysis/CircuitTelemetryReplay/index.tsx:67,150,192-193` | `/telemetry` | Interpreta los strings `'race_only' \| 'not_precomputed' \| 'production_unavailable'` que devuelve `getTelemetry` |
| `frontend/hooks/useRaceAnalysis.ts:72-76` | `/analysis` | Único punto que llama a `parseAnalysisError` |
| `frontend/app/api/engineer-chat/route.ts:138-143` | (ruta muerta) | 500 `{answer:"Radio signal lost…"}` |

### B.6 Conclusión

- **El backend produce 5 formas de body distintas** (a-e en B.3) por **16 puntos de emisión**, sin ninguna capa común: cada router elige `HTTPException(str)`, `HTTPException(dict)` o `JSONResponse` a mano; los defaults de FastAPI añaden dos formas más (422 array, 500 texto plano).
- **El frontend entiende 3 formas, en 3 parsers independientes**: `errors.ts` (solo `/analysis`; desanida bien el 404-objeto, mal el 425-objeto, y el 503 solo como string), `getTelemetry` (`{error,message}` solo en 503) y `sendToEngineer`/`RaceSelector`/`RadioOverlay` (no leen body).
- **El bug del 425 no es aislado: es la manifestación visible de que no existe un contrato de error.** De las 5 formas del backend, solo la (b) tiene un parser que la desanida — y solo en la rama 404. Las combinaciones que encajan por diseño son 2 (fila 3 y filas 11-12); las que encajan por accidente son 1 (fila 16); las que se pierden son todas las demás.
- Dato adicional: `SessionUnavailableState` consume `code` ya normalizado (`SessionUnavailableState.tsx:6-12`); nunca ve el body. Corregir solo `errors.ts:42-52` arregla el 425 pero deja el 404-string, el 422, el 500-texto y todo `/chat` sin mensaje del servidor.

**Esfuerzo para cerrarlo:** medio — un `exception_handler` global + un envelope único en backend (bajo) y un único parser en `api.ts` que lo desanide para todos los endpoints (bajo), pero toca 16 puntos de emisión y 4 consumidores.

---

## C — Verificación de la nota "Rainfall" de la sesión 9539

### C.1 Datos crudos: `backend/cache/9539/weather.json`

Inspeccionado con un script de solo lectura sobre el archivo cacheado (154 registros, un registro por minuto aprox.):

| Métrica | Valor |
|---|---|
| Registros totales | **154** (12:06:37 → 14:39:38 UTC) |
| Ventana de carrera (`_session_meta.json`) | `date_start` 13:00:00, primer `laps.date_start` 13:03:14, última vuelta 66 a 14:31:28 |
| Tipo de `rainfall` | `int` en los 154 registros; distribución **`{0: 153, 1: 1}`**. OpenF1 lo entrega como flag 0/1, no como mm/h. |
| Registros con `rainfall > 0` | **1** |
| Registros con `rainfall >= 1.0` | **1** (el mismo) |
| Registros antes de la primera vuelta | 57, ninguno con lluvia |

El único registro mojado, con su contexto minuto a minuto:

| Hora UTC | rainfall | track °C | air °C | humedad % | presión | viento |
|---|---|---|---|---|---|---|
| 13:02:38 | 0 | 40,6 | 24,3 | 66 | 1001,4 | 3,2 |
| 13:03:38 | 0 | 40,9 | 24,3 | 66 | 1001,3 | 3,8 |
| 13:04:38 | 0 | 40,2 | 24,2 | 67 | 1001,3 | 2,9 |
| 13:05:38 | 0 | 39,8 | 24,2 | 67 | 1001,3 | 2,6 |
| **13:06:38** | **1** | **38,7** | **24,1** | **67** | 1001,4 | 3,2 |
| 13:07:38 | 0 | 38,3 | 24,1 | 67 | 1001,3 | 2,3 |
| 13:08:38 | 0 | 39,5 | 24,1 | 68 | 1001,4 | 1,7 |
| 13:09:38 | 0 | 40,6 | 23,9 | 67 | 1001,3 | 3,4 |
| 13:10:38 | 0 | 41,4 | 23,9 | 67 | 1001,3 | 2,2 |

Es decir: **un único minuto marcado como lluvia, a los 3 min de carrera (vuelta 3), con pista a 38,7 °C, humedad plana en 66-68 % y temperatura de pista que vuelve a subir al minuto siguiente.**

Evidencia colateral en la misma caché:
- `stints.json` de 9539: compuestos `{SOFT: 30, MEDIUM: 19, HARD: 13}` — **ningún INTERMEDIATE ni WET** en toda la carrera.
- `pit.json` de 9539: primeras paradas en vuelta 9 (dos) y 10; **nadie paró en las vueltas 3-8**.

### C.2 Código que consume ese campo y umbral exacto

| Consumidor | Condición | Línea | Resultado con 9539 |
|---|---|---|---|
| Nota de ingeniero | `is_wet = (w.get("rainfall") or 0) > 0`; emite una nota por transición `not was_wet → is_wet`, asignando la vuelta más cercana anterior al timestamp | `backend/app/services/notes_service.py:175-201` | 1 transición → **1 nota** `"Rainfall — strategy window opens"`, `severity="High"`, `lap_number=3` |
| Chaos Index, componente `weather` | `_count_rain_periods`: mismo criterio `> 0` y misma cuenta de transiciones; `weather_pts = min(rain_periods * 10, 15)` | `backend/app/services/chaos_service.py:18-27,90,97` | 1 periodo → **+10 puntos** |
| Timeline por vuelta | `_weather_condition(max_rain)`: `>= 1.0 → "WET"`, `> 0 → "DAMP"`, else `"DRY"`; usa el **máximo** de los registros de la vuelta | `backend/app/services/timeline_builder.py:102-108,224-228` | Vuelta 3 = `WET`; como `rainfall` es 0/1, `DAMP` es inalcanzable |
| Weather analysis | `_condition` idéntica (`>= 1.0 WET`); `avg_rain = max(rainfalls)`; eventos `RAIN_ONSET`/`RAIN_END`/`PEAK_RAIN`; `strategy_impact` según nº de laps mojadas o nº de eventos | `backend/app/services/weather_service.py:56-63,102-119,225-230` | `wet_laps=1`, eventos `[(3,RAIN_ONSET),(3,PEAK_RAIN),(4,RAIN_END)]`, `strategy_impact="Low"`, pero `summary` = «Mixed conditions … **Strategy significantly influenced by weather.**» |
| Crossover windows | Detecta cambio de `condition` entre vueltas consecutivas del timeline; ventana `[lap-2, lap+4]`; impacto por `_compute_crossover_impact` | `backend/app/services/crossover_service.py:95-103` | **2 ventanas `High`**: `DRY→WET` L1-7 y `WET→DRY` L2-8, ambas `concurrent_sc=False` |
| Race phases | Cada crossover genera una fase `"Weather Crossover"` | `backend/app/services/race_phase_service.py:196-203` | Fase **"Weather Crossover" L1-8** |
| Contexto del chat | `ctx["crossover_summary"]` toma `crossover_windows[0]`; `top_signals` ordena High primero | `backend/app/services/chat_service.py:91-103,153-162` | La nota de lluvia es la **primera** de `top_signals` y la ventana L1-7 DRY→WET es el `crossover_summary` que ve el modelo; `cited_signals[0]` = «Rainfall — strategy window opens» (`chat.py:102`) |

**Umbral exacto:** `rainfall > 0` en un solo registro de 1 minuto. No hay mínimo de duración, ni de registros consecutivos, ni corroboración por temperatura/humedad, ni filtro de "antes de la primera vuelta" en `chaos_service` (sí lo hay implícitamente en `notes_service.py:185-187`, que descarta notas sin vuelta resoluble).

### C.3 Aplicación de la condición a 9539

- `sorted(weather, key=date)` → en el registro 61 (13:06:38) `is_wet=True` y `was_wet=False` → transición → `periods=1`, nota emitida con `nearest_lap=3` (última vuelta cuyo `date_start ≤ 13:06:38`).
- Registro 62 → `is_wet=False`. No hay más transiciones.
- Resultado reproducido exactamente contra `_analysis.json`: `chaos.components.weather=10`, nota `(3, "Rainfall — strategy window opens")`, `weather_analysis.wet_laps=1`, crossovers L1-7/L2-8, fase L1-8.

### C.4 Veredicto para 9539

**Falso positivo** (en el sentido de la etiqueta de análisis: no hubo ventana de estrategia por lluvia). Base:
1. Un solo registro de 60 s marcado, aislado entre 153 en seco.
2. Sin firma meteorológica: temperatura de pista 38,7 °C y subiendo al minuto siguiente, humedad estable, presión estable.
3. Sin respuesta estratégica: cero compuestos de lluvia en `stints.json`, cero paradas en L3-8.
4. La propia `weather_analysis` califica el impacto como `"Low"` (`weather_service.py:228`) mientras su `summary` (`:245-250`) y los crossovers lo escalan a "significantly influenced"/`High` — el sistema se contradice sobre el mismo dato.

Lo que **no** puedo verificar desde el repo: si en Montmeló cayeron realmente unas gotas a las 13:06 UTC. Es irrelevante para el veredicto: aunque hubiera sido cierto, un minuto de llovizna sin cambio de neumáticos no es un "rain period" que abra una ventana de estrategia, que es lo que el sistema afirma en 5 módulos distintos.

### C.5 Peso del componente `weather` en 9539

`chaos.components` (recomputado desde `race_control.json`/`position.json`, coincide con `_analysis.json`):

| Componente | Cálculo | Puntos |
|---|---|---|
| safety_car | 0 SC/VSC | 0 |
| yellow_flags | 0 | 0 |
| investigations | 8 mensajes × 5 = 40 → cap 20 | 20 |
| penalties | 3 × 4 | 12 |
| **weather** | 1 periodo × 10 | **10** |
| position_volatility | 724 cambios // 5 = 144 → cap 20 | 20 |
| **score** | | **62 → "High"** |

Sin el componente weather: **52 → sigue siendo "High"** (`>= 50`, `chaos_service.py:69`). Para ser "Medium" (25-49) haría falta además quitar ≥3 puntos de otro componente. **El plan (`SPRINT_PLAN.md:7,139`) llama a 9539 "Medium"; ni con ni sin el falso positivo lo es con los umbrales actuales.**

Efectos del falso positivo fuera del score: nota High en `engineer_notes[0]`, `cited_signals[0]`, `crossover_summary` en el contexto del LLM, fase "Weather Crossover" L1-8 en la UI (`RacePhaseTimeline`), y la cadena `"Strategy significantly influenced by weather"` en `weather_analysis.summary`. Como referencia de calibración, 9539 está contaminada en todos esos módulos, no solo en Chaos.

### C.6 Control: 9636 (São Paulo 2024, carrera mojada real)

`backend/cache/9636/weather.json`: 201 registros (14:38:25 → 17:58:26), `rainfall` **`{1: 117, 0: 84}`**, 117 registros mojados (58 %). `stints.json`: `{INTERMEDIATE: 49, WET: 5}` — solo neumáticos de lluvia. Verdadero positivo sin discusión.

Aplicando el mismo código:
- `_count_rain_periods` → **6 transiciones** (14:38, 14:59, 15:50, 16:55, 17:19, 17:22): **las dos primeras son anteriores a la primera vuelta** (15:49:57) y las tres últimas son huecos de 1-3 minutos en el flag dentro de un periodo continuamente mojado. `weather_pts = min(6*10, 15) = 15` → el cap absorbe el sobreconteo, pero el número "6 rain periods" es artefacto del flag 0/1 con huecos, no seis chubascos.
- `_weather_notes` → 4 notas (las 2 pre-carrera se descartan por `nearest_lap=None`, `notes_service.py:185-187`): vueltas 1, 33, 42, 44. Las de 42 y 44 son el mismo episodio con un hueco de 3 min.
- `weather_analysis`: `wet=50`, `dry=19`, `strategy_impact="High"`, 4 eventos. Coherente.
- `crossover_windows`: 3 (L39-45 WET→DRY, L40-46 DRY→WET, L50-56 WET→DRY), dos de ellas `concurrent_sc=True`. La pareja L39-45/L40-46 es un parpadeo de una vuelta del flag, no una transición real.

**Conclusión del control:** en 9636 el resultado agregado es correcto (score 100 capado, nivel Extreme, impacto High) **pero por saturación de caps**, no porque la detección sea fina: el mismo criterio `> 0 en un registro` que produce el falso positivo de 9539 produce en 9636 transiciones espurias (6 en vez de ~2 reales) y una ventana de crossover fantasma. El umbral no distingue "un minuto" de "una hora"; los caps ocultan el problema en carreras muy mojadas y lo exponen en carreras secas con un blip.

**Implicación para 2.3 del plan:** cualquier recalibración de Chaos que use 9539 como ancla "Medium" parte de (a) un nivel que hoy no es Medium y (b) 10 puntos de un falso positivo. Recomendación de datos, no de código (fuera del alcance de este diagnóstico): antes de recalibrar, definir "rain period" con duración mínima o corroboración (p. ej. ≥ N registros consecutivos, o caída de temperatura de pista), y regenerar la caché de 9539.

**Esfuerzo:** bajo (criterio de duración mínima en `_count_rain_periods` y `_weather_notes`, unificado con `timeline_builder`/`weather_service`) · medio si se quiere corroboración multi-señal · requiere regenerar las 4 cachés `_analysis.json`.

---

## Preguntas abiertas nuevas

1. ~~**`DIAGNOSTIC.md` fuera de la Parte 2** sigue diciendo que `SPRINT_PLAN.md` no existe.~~ **RESUELTO (2026-09-15):** actualizadas la cabecera, la «Nota previa», la pregunta abierta nº 1 de la Parte 5 y la fila del Resumen ejecutivo de `DIAGNOSTIC.md`. Ningún otro veredicto se ha tocado.
2. **9539 como "Medium":** ¿el plan se escribió con umbrales distintos a los de `chaos_service.py:65-72`, o con una versión anterior de la caché? La fecha de la caché (24 ago) es posterior al commit `04355d9`/`6942714` de regeneración; no hay rastro en git de un score distinto de 62 (no he podido ejecutar `git log -p` sobre la caché por los timeouts de disco).
3. **¿Qué significa `rainfall` en OpenF1?** En las dos sesiones es un flag entero 0/1. Si es un booleano de sensor (y no mm), los umbrales `>= 1.0 → WET` / `> 0 → DAMP` de `timeline_builder.py:102-108` y `weather_service.py:56-63` hacen que `DAMP` sea inalcanzable. ¿Se diseñó pensando en un valor continuo?
4. **Decisión de contrato para 1.4:** cuando un servicio V4 falla, ¿quieres 200 con un campo de estado por módulo, o 500? El plan asume 500 (`ANALYSIS_FAILED`), pero el código actual devuelve 200 con `null` y el frontend muestra "Coming soon" en dos de esos casos.
5. **¿Sigue habiendo intención de mostrar `cited_signals` en la UI?** Hoy no existe ningún render. Si no, la opción "Quitarlo" del plan es un cambio de una línea en `chat.py`.
6. **3.1 — ¿qué incluía "JSON procesado ~380 KB"?** El `_analysis.json` real pesa 47-51 KB. Si la cifra incluía telemetría precomputada, el orden de magnitud sigue sin cuadrar (4-5 MB).
7. **500 cross-origin en producción:** ¿se ha observado alguna vez en el frontend desplegado el panel «Analysis Failed» o el mensaje «Could not connect to the backend» ante un fallo interno del backend? Determina cuál de las dos ramas de B.4 (fila 16) ocurre realmente; no lo puedo reproducir sin ejecutar.
8. **Las "tres rondas" de validación del system prompt y las 3 preguntas de 2.1**: ¿existen las respuestas guardadas en algún sitio fuera del repo? Sin ellas no hay línea base para «confirmar que no reaparece causalidad inventada».
