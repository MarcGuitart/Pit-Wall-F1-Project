# Rehearsal Checklist — Pit Wall Engineer (25 min)

Checklist de ensayo, no notas de charla (eso ya está en `CUE_CARDS.md`). Sesión
de referencia: **9636 — São Paulo GP 2024**, meeting_key **1249**.

---

## 1. Verificación: 9636 carga desde caché estática, sin depender de OpenF1 en directo

Importante distinguir dos riesgos distintos, porque se arreglan diferente:

- **OpenF1 caído/lento/rate-limited pero el venue SÍ tiene internet** → esto
  está cubierto: toda la cadena de 9636 sirve desde caché en disco, cero
  llamadas a OpenF1. Verificado en vivo el 2026-08-23 contra producción
  (Render), los cuatro saltos que hace el frontend antes de llegar al demo:

  ```
  GET /races?year=2024          → 200, 0.196s, 25 meetings, São Paulo incluido (meeting_key 1249)
  GET /races/1249/sessions      → 200, 0.189s, session_key 9636 "Race"
  GET /analysis/9636            → 200, 0.196s, chaos.score=100
  GET /telemetry/9636?drivers=VER,NOR,LEC,PIA,RUS&lap_mode=fastest_clean → 200, 0.443s
  ```

  - [ ] Re-correr estos 4 `curl` la mañana de la charla contra
        `https://pit-wall-f1-project.onrender.com` y confirmar los mismos 200.
  - [ ] Si algo falla, mirar logs de Render: debe decir `[CACHE HIT]`, nunca
        `[FETCHING]` ni `[COMPUTING]` para session_key 9636.

- **El venue NO tiene internet en absoluto** → la web desplegada
  (pitwallengineer.com) es inalcanzable pase lo que pase, cache o no cache.
  Esto NO se arregla con caché — se arregla con una de estas dos opciones:
  - [ ] Opción A (recomendada si hay duda del wifi del venue): correr todo el
        stack en local durante la charla (`uvicorn` + `npm run dev` en el
        portátil), apuntando el frontend a `localhost:8000`. Cero dependencia
        de red — 9636 ya está en `backend/cache/9636/`.
  - [ ] Opción B: aceptar el riesgo y tener listo el fallback de capturas
        (sección 2).

- [ ] **Render free tier hace spin-down por inactividad** — si el servicio
      lleva ~15 min dormido, la primera petición puede tardar 50+ segundos en
      responder, cache o no cache. Esto es más probable que un fallo real de
      OpenF1. Mitigación: 15-20 minutos antes de salir a hablar, abrir
      `https://pit-wall-f1-project.onrender.com/health` para despertar el
      contenedor y dejarlo caliente.
- [ ] Probar el flujo completo con el wifi del portátil apagado (modo avión)
      al menos una vez antes del día de la charla, usando la Opción A. Es la
      única prueba que realmente confirma "no dependo de nada externo".
- [ ] El chat de IA (bloque 5) es la única pieza que **no** es cache-inmune:
      necesita que Groq (cloud) responda. Si se usa Opción A en local, arrancar
      `ollama serve` antes de la charla como red de seguridad — el backend
      prueba Ollama local primero, Groq después, automáticamente, sin tocar
      código. Si se usa la web desplegada (Opción B / normal), esto depende de
      que Render alcance Groq, no del wifi del venue.

---

## 2. Capturas y GIFs de respaldo por panel (si falla la conexión)

Todos existen ya en `assets/` y están confirmados en disco. Casi todos son de
esta misma sesión (São Paulo 2024, Chaos 100) — coinciden con lo que se
enseña en directo:

| Momento del demo | Asset | ¿Misma sesión (9636)? |
|---|---|---|
| Landing / selector de sesión | `assets/landing.png` | Genérico |
| Vista Strategy, badge Chaos 100 | `assets/strategy-dashboard.png` | Sí — misma carrera |
| True Pace (VER 80.472 vs NOR 81.517) | `assets/true-pace-card.png` | Sí — foco en Verstappen |
| Tyre Degradation + Pit Impact | `assets/tyre-pit-panel.png` | No confirmado, panel genérico |
| Race Phase Timeline (peak lap 28) | `assets/chaos-timeline.png` | Sí — caption dice "Chaos 100" |
| Weather Winners / Crossover | `assets/weather-crossover.png` | No confirmado, panel genérico |
| Circuit Telemetry Replay | `assets/telemetry-replay.gif` | Sí — caption dice "Interlagos" |
| AI Race Engineer chat | `assets/ai-chat.gif` | No confirmado, panel genérico |

- [ ] Duplicado detectado: `chaos-timeline.png` y `race-phase-timeline.png`
      pesan exactamente igual (64 816 bytes) — son la misma imagen con dos
      nombres. Solo `chaos-timeline.png` está enlazado en el README; usar ese.
- [ ] Meter estas 8 imágenes en una carpeta local o en un PDF de una sola
      página, accesible sin conexión (no solo en el repo de GitHub) — si el
      venue no tiene wifi, tampoco vas a poder clonar el repo ahí mismo.
- [ ] Ensayar UNA VEZ el demo entero narrando solo sobre las capturas fijas,
      sin tocar la app real, cronometrado — para saber si el bloque 4 sigue
      cabiendo en 6 minutos cuando no hay clicks reales que rellenen tiempo.

---

## 3. Checkpoints de tiempo por bloque

Los 7 bloques suman exactamente **23:00** — quedan 2 minutos de colchón antes
del límite de 25:00. Si un checkpoint te pilla tarde, corta lo que dice la
columna de la derecha, no todo el bloque.

| # | Bloque | Empieza | Termina | Dur. | Si vas tarde, corta esto |
|---|---|---|---|---|---|
| 1 | Hook + reencuadre | 0:00 | 1:30 | 1:30 | — (es el arranque, no se recorta) |
| 2 | Principio de producto | 1:30 | 3:00 | 1:30 | El bullet de "histórico por diseño" — retómalo en bloque 6 |
| 3 | Arquitectura | 3:00 | 8:00 | 5:00 | Checkpoint 5:30 → si no has llegado a Chaos Index, salta `RaceTimeline` (último bullet) |
| 4 | Live demo Brasil 2024 | 8:00 | 14:00 | 6:00 | Checkpoint 11:00 → si no has llegado al Pit Impact, salta Weather Crossover y ve directo a Race Phase Timeline |
| 5 | IA y grounding | 14:00 | 17:00 | 3:00 | La anécdota de los 3 modelos Groq deprecados — es la más prescindible |
| 6 | Lecciones de producción | 17:00 | 20:00 | 3:00 | Explica solo el bug de OOM a fondo; el de rutas absolutas en una frase |
| 7 | Roadmap y cierre | 20:00 | 23:00 | 3:00 | Corta a 2 huecos reales en vez de 4, deja tiempo para el cierre |
| — | Colchón / preguntas | 23:00 | 25:00 | 2:00 | — |

- [ ] Llevar el móvil o un reloj visible en modo cuenta-arriba desde 25:00, no
      cuenta-adelante desde 0 — es más fácil leer "quedan 14:00" que restar
      mentalmente en directo.
- [ ] Marcar físicamente (post-it en el portátil o en la mano) solo dos
      checkpoints: **8:00** (debe estar arrancando el demo) y **17:00** (debe
      estar arrancando lecciones de producción). Son los dos puntos donde un
      retraso acumulado de bloques anteriores se nota más.
- [ ] Ensayar el bloque 3 y el bloque 4 por separado, cronometrados, al menos
      dos veces cada uno — son los dos bloques largos y los que tienen más
      probabilidad de comerse el colchón final.
