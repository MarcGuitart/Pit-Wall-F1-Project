# Technical Deep Dive — Pit Wall Engineer

Notas técnicas para explicar en voz alta, no documentación formal. Cada sección
dice exactamente en qué archivo y función vive la lógica, con el código real
(no pseudocódigo) y, cuando aplica, la comparación contra el diseño original en
`docs/CLAUDE.md` / `docs/CLAUDE_v2.md`.

## Antes de empezar: lo que NO coincide al 100% con el diseño original

Verificado línea por línea contra `docs/CLAUDE.md` y `docs/CLAUDE_v2.md`. Tres
cosas que vale la pena decir en voz alta en vez de asumir que todo cuadra:

1. **El pipeline de precompute (GitHub Actions) no existe en ningún diseño
   previo.** No aparece ni en `CLAUDE.md` ni en `CLAUDE_v2.md`. Es una pieza de
   infraestructura añadida después, motivada por un límite físico de Render
   (512 MB en el free tier), no por el diseño de producto original.
2. **El Chaos Index está implementado casi exacto al pseudocódigo del diseño,
   con una diferencia real**: el spec cuenta cualquier mensaje que contenga
   `"SAFETY CAR"` o `"VSC"`; el código shipped exige el mensaje exacto
   `"SAFETY CAR DEPLOYED"` / `"VIRTUAL SAFETY CAR DEPLOYED"`. Cambia qué
   mensajes de race control puntúan.
3. **La regla de exclusión nº6 del "clean lap filter" (datos de sector
   incompletos) está deliberadamente sin implementar** — y está bien que sea
   así: el propio `CLAUDE.md` dice en otra sección que `segments_sector_*` no
   existe en sesiones de carrera, así que la regla 6 es inaplicable a Race por
   diseño, no un olvido.

Con eso por delante, vamos pieza por pieza.

---

## 1. Reconstrucción de posición por timestamp — `position_at_lap`

**Dónde vive:** [`backend/app/utils/time.py:42-87`](../../backend/app/utils/time.py)

El problema de fondo: OpenF1 no te da "la posición del piloto X en la vuelta
Y". Te da dos streams independientes que solo comparten reloj:

- `laps` → cada vuelta tiene un `date_start` (timestamp de cuándo empezó)
- `position` → un stream de eventos de posición con su propio `date`, que se
  actualiza cada vez que cambia el orden, no una vez por vuelta

Así que "la posición al empezar la vuelta N" se reconstruye buscando el último
evento de posición **anterior o igual** al `date_start` de esa vuelta:

```python
def position_at_lap(
    driver_number: int,
    lap_number: int,
    position_data: list[dict],
    laps_data: list[dict],
) -> int | None:
    driver_laps = [
        l for l in laps_data
        if l.get("driver_number") == driver_number
        and l.get("lap_number") == lap_number
    ]
    if not driver_laps:
        return None

    lap_ts: str | None = driver_laps[0].get("date_start")
    ...
    driver_positions = [
        p for p in position_data
        if p.get("driver_number") == driver_number and p.get("date")
    ]
    eligible = [p for p in driver_positions if p["date"] <= lap_ts]
    if not eligible:
        all_sorted = sorted(driver_positions, key=lambda p: p.get("date", ""))
        return all_sorted[0].get("position") if all_sorted else None

    return sorted(eligible, key=lambda p: p["date"])[-1].get("position")
```

El caso borde real que maneja: la vuelta 1 casi siempre tiene `date_start =
None` (la vuelta empieza en el grid, no hay timestamp limpio). En ese caso cae
a un fallback: coge el primer registro de posición cronológicamente para ese
piloto, en vez de intentar comparar contra un timestamp que no existe (líneas
67-76).

Esta función es compartida — no es solo para pit stops. Cualquier sitio del
código que necesite "¿dónde estaba este piloto en esta vuelta concreta?" pasa
por aquí. El consumidor más claro es el pit impact (sección 5).

---

## 2. Clean lap filter y `exclusion_log`

**Dónde vive:** [`backend/app/services/pace_service.py:19-121`](../../backend/app/services/pace_service.py), función `compute_true_pace`

La idea de producto: un ranking de ritmo real no puede incluir vueltas de pit,
vueltas bajo safety car, o vueltas sin dato. El filtro corre por piloto, vuelta
a vuelta, con 4 reglas activas (líneas 50-71):

```python
for lap in driver_laps:
    ln = lap.get("lap_number", 0)
    dur = lap.get("lap_duration")

    # Rule 1: no timing
    if not dur:
        null_n += 1
        continue
    # Rule 2 + 3: pit out or pit in lap
    if lap.get("is_pit_out_lap") or ln in pit_laps.get(dn, set()):
        pit_n += 1
        continue
    # Rule 4: SC/VSC/yellow period
    if ln in neutralised:
        sc_n += 1
        continue
    # Rule 5: statistical outlier (>2.5 IQR)
    if is_outlier(dur, all_durs):
        outlier_n += 1
        continue
    # Rule 6: (sectors not available in races — skip that check per CLAUDE.md)
    clean.append(dur)
```

El diseño original (`docs/CLAUDE.md:226-233`) especifica 6 reglas, incluyendo
una sexta ("fewer than 3 sector durations available"). Esa regla no está
aplicada, y el propio comentario en el código lo dice. No es un descuido: el
mismo `CLAUDE.md`, en otra sección, es explícito sobre por qué:

> `docs/CLAUDE.md:177` — "`segments_sector_*` are NOT available during races
> (only qualifying). Do not use for clean lap detection."

O sea, la regla 6 solo tendría sentido en Qualifying, y este servicio es para
Race. Aplicarla habría sido aplicar una regla de un dataset que ni siquiera
existe en producción para este caso de uso.

El `exclusion_log` no es un array de números — es texto ya formateado, pensado
para mostrarse tal cual en la UI sin transformación adicional:

```python
excl: list[str] = []
if sc_n:
    excl.append(f"{sc_n} lap{'s' if sc_n > 1 else ''} excluded: SC/VSC")
if pit_n:
    excl.append(f"{pit_n} lap{'s' if pit_n > 1 else ''} excluded: pit in/out")
if outlier_n:
    excl.append(f"{outlier_n} lap{'s' if outlier_n > 1 else ''} excluded: outlier (>2.5 IQR)")
if null_n:
    excl.append(f"{null_n} lap{'s' if null_n > 1 else ''} excluded: no timing data")
```

Y el frontend efectivamente lo pinta literal, sin reprocesar:
[`frontend/components/analysis/TruePaceTable.tsx:123`](../../frontend/components/analysis/TruePaceTable.tsx)
— `rows[0].exclusion_log.map(...)`.

**Nota de actualización**: hasta la sesión de trabajo del 2026-08-23, el
ranking ordenaba por `clean_pace` (la vuelta limpia más rápida, un pico) en
vez de por la mediana, contradiciendo tanto el README como `docs/CLAUDE.md`.
Se corrigió para que el criterio de orden sea la mediana — la definición
metodológicamente correcta de "ritmo real": una vuelta única en aire limpio es
un pico, no ritmo sostenido. Los campos también se renombraron para que no
quede ambigüedad sobre cuál es cuál:

```python
med = median(clean)
fastest = min(clean)
...
rows.append(TruePaceRow(
    median_clean_lap=round(med, 3),
    fastest_clean_lap=round(fastest, 3),
    ...
))
...
rows.sort(key=lambda r: r.median_clean_lap)
```

`fastest_clean_lap` (antes `clean_pace`) se mantiene como campo secundario
visible en la UI — ya no se usa como criterio de orden. El README y el diseño
original en `docs/CLAUDE.md` ya decían "median" desde el principio; era el
código el que no coincidía, no al revés.

---

## 3. Degradación de neumáticos — regresión y `cliff_risk`

**Dónde vive:** [`backend/app/services/tyre_service.py:9-77`](../../backend/app/services/tyre_service.py) +
[`backend/app/utils/statistics.py:25-49`](../../backend/app/utils/statistics.py)

Por cada stint (un piloto con un compuesto concreto entre dos pits), se
construyen dos listas paralelas: `x` es el índice de vuelta dentro del stint
(0, 1, 2...), `y` es el tiempo de vuelta. Se filtran vueltas de pit-out y
vueltas bajo SC/VSC antes de entrar a la regresión:

```python
for ln in range(lap_start, lap_end + 1):
    lap = driver_laps_map.get(ln)
    if not lap:
        continue
    dur = lap.get("lap_duration")
    if not dur or lap.get("is_pit_out_lap") or ln in neutralised:
        continue
    xs.append(float(ln - lap_start))
    ys.append(dur)

if len(xs) < 3:
    continue

slope = linear_slope(xs, ys)
```

La regresión en sí es una recta de mínimos cuadrados con NumPy, nada más:

```python
def linear_slope(x_values: list[float], y_values: list[float]) -> float:
    if len(x_values) < 2:
        return 0.0
    x = np.array(x_values, dtype=float)
    y = np.array(y_values, dtype=float)
    return float(np.polyfit(x, y, 1)[0])
```

`slope` son segundos por vuelta de caída de ritmo. La clasificación de riesgo
es un corte por umbrales fijos, sin ambigüedad:

```python
def cliff_risk_from_slope(slope: float) -> str:
    """High ≥0.08 s/lap, Medium ≥0.04, else Low."""
    if slope >= 0.08:
        return "High"
    if slope >= 0.04:
        return "Medium"
    return "Low"
```

Estos umbrales (0.08 / 0.04) coinciden exactamente con `docs/CLAUDE.md:246` —
aquí sí, diseño e implementación están alineados al milímetro. El frontend
consume `cliff_risk` directo para pintar la barra de color:
[`frontend/components/analysis/TyreDegradationPanel.tsx:39-40`](../../frontend/components/analysis/TyreDegradationPanel.tsx)
— `CLIFF_STYLES[row.cliff_risk]`.

Nota de mínimo de muestra: si un stint tiene menos de 3 vueltas limpias
(`len(xs) < 3`), el stint entero se descarta y no genera fila. No hay
"degradación estimada con baja confianza" para stints cortos — directamente no
aparece en el análisis.

---

## 4. Chaos Index — componentes del score y `peak_chaos_lap`

**Dónde vive:** [`backend/app/services/chaos_service.py:75-134`](../../backend/app/services/chaos_service.py)

Es una suma ponderada de 6 señales, cada una con su propio tope individual
antes de sumar, y luego un tope global de 100:

```python
sc_pts    = min(sc_count * 15, 30)
yellow_pts = min(yellow_count * 3, 20)
invest_pts = min(invest_count * 5, 20)
penalty_pts = min(penalty_cnt * 4, 15)
weather_pts = min(rain_periods * 10, 15)
vol_pts    = min(pos_vol // 5, 20)

score = min(
    sc_pts + yellow_pts + invest_pts + penalty_pts + weather_pts + vol_pts, 100
)
```

Dato para la charla: los topes individuales suman 120 (30+20+20+15+15+20), no
100. Es intencional — con 2-3 categorías graves ya saturas el score a 100 sin
necesitar las seis a la vez. El nivel textual (`Low/Medium/High/Extreme`) es
un corte simple sobre ese score:

```python
def _level(score: int) -> str:
    if score >= 80:
        return "Extreme"
    if score >= 50:
        return "High"
    if score >= 25:
        return "Medium"
    return "Low"
```

El `peak_chaos_lap` no es "la vuelta con el score más alto" (el score es una
sola cifra para toda la sesión, no por vuelta). Es la vuelta con más mensajes
de race control de un tipo concreto, contando ocurrencias por vuelta:

```python
def _peak_chaos_lap(race_control: list[dict]) -> int | None:
    lap_events: dict[int, int] = defaultdict(int)
    for m in race_control:
        ln = m.get("lap_number")
        if not ln or ln <= 1:
            continue
        txt = (m.get("message") or "").upper()
        if any(
            kw in txt
            for kw in ("SAFETY", "YELLOW", "INVESTIGATION", "PENALTY", "VIRTUAL")
        ):
            lap_events[ln] += 1
    if not lap_events:
        return None
    return max(lap_events, key=lap_events.__getitem__)
```

La vuelta 1 se excluye explícitamente (`ln <= 1`) porque los mensajes
pre-carrera (formación, luces, etc.) inflarían artificialmente esa vuelta.

**La discrepancia real con el diseño**: el pseudocódigo de `docs/CLAUDE.md:254`
cuenta safety car así:

```python
sc_count = count_keywords(race_control, ["SAFETY CAR", "VIRTUAL SAFETY CAR", "VSC"])
```

El código shipped es más estricto — exige el mensaje de despliegue completo:

```python
sc_count = _count_keywords(
    race_control, ["SAFETY CAR DEPLOYED", "VIRTUAL SAFETY CAR DEPLOYED"]
)
```

Con el spec original, un mensaje tipo "SAFETY CAR IN THIS LAP" (fin de SC)
también contaría como evento de safety car. Con el código real, solo cuenta el
despliegue, no el cierre. Es una diferencia de matiz, pero cambia el número
exacto en carreras con múltiples entradas/salidas de safety car.

El frontend lee `chaos.components` como diccionario directo para las barras:
[`frontend/components/analysis/ChaosIndexCard.tsx:64`](../../frontend/components/analysis/ChaosIndexCard.tsx)
— `chaos.components[key]`.

---

## 5. Pit impact — lógica de veredicto

**Dónde vive:** [`backend/app/services/pit_service.py:8-81`](../../backend/app/services/pit_service.py)

Dos señales independientes se combinan en un solo texto de veredicto: cuánto
duró la parada en el pit lane, y cuántas posiciones se ganaron o perdieron
alrededor de ella.

La duración se clasifica contra un benchmark fijo de 22.5s:

```python
if lane_dur < 21.5:
    quality = f"Excellent stop ({lane_dur:.1f}s lane, benchmark class)."
elif lane_dur < 23.5:
    quality = f"Good stop ({lane_dur:.1f}s lane)."
elif lane_dur < 26.0:
    quality = f"Standard stop ({lane_dur:.1f}s lane, +{lane_dur - 22.5:.1f}s vs target)."
else:
    quality = f"Slow stop ({lane_dur:.1f}s lane, +{lane_dur - 22.5:.1f}s vs target — costly)."
```

El cambio de posición usa `position_at_lap` (sección 1) con una ventana
concreta y deliberada: **1 vuelta antes** de entrar a boxes, **3 vueltas
después** de salir — no la vuelta inmediatamente siguiente:

```python
pos_before = position_at_lap(dn, ln - 1, position_data, laps)
pos_after = position_at_lap(dn, ln + 3, position_data, laps)

net_change: int | None = None
if pos_before is not None and pos_after is not None:
    net_change = pos_before - pos_after
```

El motivo de las 3 vueltas de margen: justo al salir de boxes el piloto suele
estar en tráfico o con el undercut/overcut todavía resolviéndose contra otros
que aún no han parado. Medir en `ln + 1` daría una foto de posición todavía
inestable. `ln + 3` deja que el orden se asiente antes de decidir si la parada
"ganó" o "perdió" posiciones.

La confianza del veredicto depende de si hay dato de posición o no — sin
`net_change` el veredicto se queda en calidad de parada únicamente, con
confianza `Medium`; con ambos datos, `High`:

```python
if net_change is None:
    return quality, "Medium"
...
return quality + pos_txt, "High"
```

El frontend pinta `position_before → position_after` y el texto de veredicto
literal:
[`frontend/components/analysis/PitImpactPanel.tsx:81-83,106`](../../frontend/components/analysis/PitImpactPanel.tsx).

---

## 6. El pipeline de precompute vía GitHub Actions (y por qué NO es on-request)

Aquí hay dos pipelines completamente distintos en el mismo repo, y es fácil
confundirlos si no se nombran explícitamente:

### El análisis principal (pace, tyre, chaos, pit, DNA...) SÍ es on-request

**Dónde vive:** [`backend/app/api/analysis.py:159-215`](../../backend/app/api/analysis.py)

Primera petición a `/analysis/{session_key}`: cache miss, se calcula todo en
el momento, se escribe a `_analysis.json`, se devuelve. Segunda petición:
cache hit, respuesta inmediata sin recalcular. Nada de esto pasa por GitHub
Actions.

Hay un lock por sesión para que dos requests concurrentes a la misma sesión
(dos pestañas del navegador cargando a la vez, por ejemplo) no disparen el
cálculo dos veces:

```python
lock = await _get_analysis_lock(session_key)
async with lock:
    # Double-check cache inside lock (another request may have computed while we waited)
    if not force_refresh:
        cached = analysis_cache.get_full_analysis(session_key)
        if cached:
            logger.info("[CACHE HIT inside lock] %s", session_key)
            return FullRaceAnalysis.model_validate(cached)

    logger.info("[COMPUTING] Analysis for %s — fetching endpoints", session_key)
```

Esto es barato de calcular on-request porque son operaciones sobre JSON ya
descargado de OpenF1 (listas de vueltas, stints, pits...) — Polars/NumPy sobre
unos pocos miles de filas, milisegundos.

### La telemetría de circuito (FastF1) NO es on-request en producción

**Dónde vive:** [`.github/workflows/precompute-telemetry.yml`](../../.github/workflows/precompute-telemetry.yml) +
[`backend/scripts/precompute_telemetry.py`](../../backend/scripts/precompute_telemetry.py) +
[`backend/app/api/telemetry.py:109-122`](../../backend/app/api/telemetry.py)

Este es un caso completamente distinto de coste. FastF1 no lee un JSON
pequeño — descarga telemetría cruda de coche (posición, velocidad, marcha,
por canal, a alta frecuencia) directamente de la API de F1, del orden de
decenas a cientos de MB por sesión. El propio código lo dice sin rodeos:

```python
# Production guard — FastF1 downloads 50-200 MB and would OOM Render free tier.
# If we reach here in production it means the precompute workflow hasn't run yet.
if settings.environment == "production":
    return JSONResponse(
        status_code=503,
        content={
            "error": "telemetry_not_precomputed",
            "message": (
                f"Telemetry for session {session_key} with drivers "
                f"{','.join(driver_list)} has not been precomputed yet. "
                "Run the 'Precompute Telemetry Cache' workflow on GitHub Actions."
            ),
        },
    )
```

Render free tier son 512 MB de RAM totales para todo el proceso. Cargar FastF1
una sola vez ya se come ese margen. Por eso el import de `fastf1` ni siquiera
es a nivel de módulo — es un import perezoso dentro de la rama de desarrollo,
para que en producción el paquete no se cargue nunca en memoria, ni aunque no
se use:

```python
# telemetry_service is imported lazily inside the dev-path branch only.
# Keeping it out of the module-level imports ensures that fastf1 (which
# telemetry_service pulls in) is never imported on Render, where it would
# OOM the 512 MB container before the route handler is even registered.
```

La solución: el cálculo pesado se hace **una vez, en CI, no en el servidor de
producción**. El workflow de GitHub Actions instala FastF1 en un runner de
Ubuntu (recursos gratis e ilimitados en comparación con Render free), calcula
la telemetría para las sesiones cacheadas, y hace commit del JSON resultante
directo al repo:

```yaml
- name: Commit telemetry cache
  run: |
    git config user.name "github-actions[bot]"
    git add backend/cache/*/telemetry_*.json
    if git diff --staged --quiet; then
      echo "No changes to commit"
      exit 0
    fi
    git commit -m "ci: precompute telemetry cache [skip ci]"
```

En producción, `/telemetry/{session_key}` es puramente un lector de archivos
estáticos ya committeados — nunca ejecuta FastF1. Si el JSON no existe todavía
para esa combinación de sesión+pilotos, la respuesta es un 503 explícito
pidiendo correr el workflow, no un intento de calcularlo al vuelo.

**Para la charla**: esto no estaba en el diseño original del producto — no
aparece en `CLAUDE.md` ni `CLAUDE_v2.md`. Nació después, como respuesta directa
a una restricción de infraestructura real (Render free tier), no como una
decisión de arquitectura planeada desde el principio.

---

## 7. Arquitectura de grounding de la IA

**Dónde vive:** [`backend/app/services/chat_service.py`](../../backend/app/services/chat_service.py) (construye el contexto) +
[`backend/app/api/chat.py:71-104`](../../backend/app/api/chat.py) (endpoint) +
[`backend/app/clients/ollama_client.py:145-202`](../../backend/app/clients/ollama_client.py) (llamada al modelo)

La garantía central, dicha literal en el propio docstring del servicio:

```python
"""
build_chat_context — compact JSON summary (~800 tokens max) sent to Ollama.
The model never receives raw OpenF1 arrays.
"""
```

Esto coincide con el diseño (`docs/CLAUDE_v2.md:460` dice lo mismo casi
palabra por palabra), y coincide con lo que hace el código: `build_chat_context`
recibe un `FullRaceAnalysis` — el objeto Pydantic **ya calculado** — y extrae
de ahí campos concretos, nunca las listas crudas de `laps`, `position`,
`car_data`, etc.:

```python
def build_chat_context(
    analysis: FullRaceAnalysis,
    focused_driver: str | None = None,
) -> str:
    chaos = analysis.chaos
    pace_sorted = sorted(analysis.true_pace, key=lambda r: r.rank)

    ctx: dict = {
        "session": f"{analysis.race.meeting_name} {analysis.race.year} — {analysis.race.session_name}",
        "race_brain": {
            "phase": analysis.race_brain.race_phase,
            "chaos": chaos.score,
            "peak_chaos_lap": chaos.peak_chaos_lap,
        },
        "pace_top3": [
            {"driver": r.driver_code, "median_clean_lap": r.median_clean_lap, "verdict": r.verdict}
            for r in pace_sorted[:3]
        ],
        ...
    }
```

Nótese que ni siquiera pasa las 20 filas de `true_pace` completas — corta a
`[:3]`, a los `cliff_risk == "High"` únicamente para neumáticos, a los pits
con impacto real (`stop_duration > 0.5`), etc. No es solo "sin telemetría
cruda": es un resumen deliberadamente comprimido incluso de los datos ya
procesados, para mantenerse dentro de ~800 tokens.

El flujo completo, de un vistazo:

1. **Frontend** (`frontend/components/radio/RadioOverlay.tsx:160-163`) manda
   `{session_key, question, focused_driver}` — nunca telemetría, nunca
   contexto de carrera. El comentario en `frontend/lib/api.ts:72` lo confirma:
   *"The race context lives in the backend cache — only session_key is
   needed."*
2. **Backend** (`chat.py:74`) recupera `_analysis.json` de ese `session_key`
   desde caché — si no existe, 404 pidiendo llamar antes a `/analysis`.
3. **`build_chat_context`** comprime ese análisis ya calculado a un JSON
   compacto.
4. **`answer_engineer_question`** inyecta ese JSON dentro del *system prompt*,
   no como mensaje de usuario:

```python
system = ENGINEER_SYSTEM_PROMPT.format(
    session_name=session_name,
    context=context,
    focused_driver_note=focused_driver_note,
)
```

5. Prioridad de modelo: Ollama local primero, Groq si Ollama no responde,
   mensaje offline si ninguno de los dos está disponible:

```python
# 1. Try Ollama (local)
model = await _resolve_model()
if model is not None:
    try:
        ...
        return r.json()["message"]["content"].strip()
    except Exception as exc:
        logger.warning("[AI] Ollama failed, will try Groq: %s", exc)

# 2. Fall back to Groq (free cloud)
if settings.groq_api_key:
    try:
        answer = await _call_groq(system, question)
        return answer
    except Exception as exc:
        logger.error("[AI] Groq also failed: %s", exc)

# 3. Nothing available
return (
    "Engineer radio offline. "
    "For local use: ollama pull llama3.1:8b · "
    "For deployment: set GROQ_API_KEY at console.groq.com (free)"
)
```

**Por qué esto importa para la charla, más allá de "es más barato"**: al
limitar el modelo a un resumen ya validado por lógica determinista (los
mismos números que ve el usuario en el dashboard), la IA no puede alucinar un
tiempo de vuelta o inventar una posición — solo puede razonar en lenguaje
natural sobre cifras que ya fueron calculadas y verificadas antes de llegar al
prompt. Si el dato no está en `build_chat_context`, el modelo no lo tiene, y
el `ENGINEER_SYSTEM_PROMPT` se lo pide explícito: *"If a number or fact is
present in the analysis, use it. If it is genuinely absent, say briefly what
you have and what you don't."*
