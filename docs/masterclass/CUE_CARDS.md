# Cue Cards — Pit Wall Engineer (25 min)

Palabras clave y números, no guion. Sesión de referencia para todos los datos
en vivo: **9636 — São Paulo GP 2024**.

---

## 1. Hook + reencuadre (0:00–1:30)

- Broadcast responde QUIÉN ganó. No responde POR QUÉ.
- Cold open directo con 9636: **Chaos 100/100, Extreme** — la más caótica del calendario 2024.
- Reencuadre: esto no es un dashboard bonito — es reconstrucción forense de una carrera ya terminada.
- Pregunta que abre la charla: "¿qué habría visto el ingeniero de pista si hubiera podido parar la cinta?"

## 2. Principio de producto (1:30–3:00)

- Cada métrica lleva su propio nivel de confianza — nunca un número pelado.
- `exclusion_log`: no solo el resultado, también qué vueltas se tiraron y por qué.
- Filosofía: auditable > bonito. Si no puedo explicar por qué salió ese número, no lo muestro.
- Histórico por diseño, no por pereza: caché inmutable, sin TTL — en vivo rompería esa asunción.

## 3. Arquitectura (3:00–8:00)

- **`position_at_lap`**: dos streams que no se tocan (`laps.date_start` vs `position.date`) — se reconstruye buscando el último evento de posición ≤ ese timestamp.
- Clean lap filter, 4 reglas activas — dato real 9636: **VER 52 vueltas limpias (14 excluidas por SC/VSC), NOR 53 (12 excluidas)** → ambos High confidence.
- True Pace ordena por **median_clean_lap** (ritmo sostenido), no por la vuelta más rápida — `fastest_clean_lap` queda como campo secundario. Top 5 real 9636: **VER · RUS · NOR · GAS · OCO**.
- Degradación: regresión lineal NumPy, cliff risk a 0.08/0.04 s/vuelta — dato real 9636: **33 stints mapeados, 0 en "High cliff risk"** pese al caos — chaos y degradación son señales independientes.
- Chaos Index, 6 componentes ponderados, tope 100 — dato real 9636: **3 SC/VSC · 19 yellow · 7 investigaciones · 6 periodos de lluvia · 340 cambios de posición → 100/100**, peak en vuelta **28**.
- Precompute: FastF1 nunca corre en producción — dato real 9636: **car_data crudo = 7.9MB por piloto (48MB sesión completa) → JSON servido final = 380KB**, >100x más pequeño.
- `RaceTimeline`: objeto canónico construido UNA vez; todos los servicios V4 leen de ahí, nadie recalcula límites de vuelta por su cuenta.

## 4. Live demo — Brasil 2024 (8:00–14:00)

- Cargar 9636 → señalar Chaos 100 Extreme antes de tocar nada más.
- True Pace: **VER 83.657 vs NOR 83.990 → gap de ritmo sostenido 0.333s** (mediana). Por mejor vuelta limpia el gap seguía siendo **1.045s** (80.472 vs 81.517) — momento deliberado: enseña en vivo por qué el criterio de orden es la mediana y no el pico. Abrir `exclusion_log`, contrastar 14 vs 12 vueltas excluidas.
- Tyre panel: `best_compound` = **INTERMEDIATE** — explicar por qué (carrera de lluvia, no casualidad).
- Pit Impact: **35 paradas registradas** — buscar una en vivo con veredicto negativo claro.
- Race Phase Timeline: marcar la vuelta **28** (peak chaos) sobre el eje.
- Dejar hueco para pregunta en vivo tipo "¿por qué se excluyó esta vuelta?" — responder señalando el log, no de memoria.

## 5. Dónde encaja la IA (14:00–17:00)

- `build_chat_context`: JSON comprimido, tope **~800 tokens** — nunca arrays crudos de OpenF1.
- El modelo solo ve campos ya validados de `FullRaceAnalysis` — contención por diseño, no fact-check posterior.
- Prioridad real: Ollama local → Groq cloud → mensaje offline explícito (nunca un 500 sin explicar).
- Demo en vivo: preguntar "¿por qué VER más rápido que NOR?" → la IA cita **83.657 vs 83.990, gap 0.333s** — mismo número que la tabla, sin mezclarlo con la vuelta más rápida.
- Límite real, dicho en voz alta: el modelo cita bien los datos pero puede construir causalidad falsa encima — en pruebas atribuyó un VSC a "weather" cuando la causa real en race control era un choque en curva 1. Mitigado con una regla anti-causalidad explícita en el system prompt, no eliminado del todo.
- Anécdota real de esta semana: Groq deprecó **3 modelos en cascada en producción** (`llama-3.1-8b-instant` → `llama3-8b-8192` → `llama-3.3-70b-versatile` → `openai/gpt-oss-120b`) — depender de un free tier cloud tiene ese coste.

## 6. Lecciones de producción (17:00–20:00)

- **Bug OOM**: `fastf1` importado a nivel de módulo en `telemetry.py` → se cargaba en memoria al arrancar el proceso, antes de la primera request.
- Render free tier: **512MB totales** — solo cargar FastF1 ya se come el margen.
- Fix: import perezoso, solo dentro de la rama de desarrollo — en producción ese paquete no se importa nunca, ni una vez.
- **Bug de rutas**: Render a veces arranca uvicorn desde la raíz del repo, no desde `backend/` → `./cache` relativo apuntaba a un sitio inexistente.
- Fix: `Path(__file__).parents[2] / "cache"` — ruta absoluta derivada del propio archivo, independiente del cwd del proceso.
- Lección común a los dos: en producción nunca asumas memoria disponible ni directorio de trabajo — hazlo explícito o te explota en silencio.

## 7. Roadmap y cierre (20:00–22:00)

- Huecos reales, dichos en voz alta: Chaos Index sin normalizar por número de vueltas — Mónaco y Spa puntúan igual con los mismos eventos.
- `/analysis` no valida caché corrupta igual que `/chat` — asimetría pendiente de cerrar.
- Tiempo real: bloqueado por diseño de caché sin TTL, no por falta de ambición — requeriría invalidación activa.
- Cierre — volver al hook: esto no reemplaza al ingeniero de pista, lo arma con la pregunta correcta antes de hacerla.
