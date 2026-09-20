# Speaking Script — Pit Wall Engineer (25 min)

Guión por bloque, no palabra por palabra. Las únicas frases literales son la
apertura y el cierre de cada bloque, la frase-ancla recurrente, y — solo en el
bloque 4 — la línea de apertura de cada panel del demo. Todo lo demás es el
arco de la idea, no el texto exacto.

Mapeado contra `Pit Wall Engineer Masterclass.pdf` (21 slides reales). Timings
igual que `CUE_CARDS.md`, total 22:00 de contenido + 3:00 de colchón sobre 25.

**Nota antes de empezar**: la slide 9 ("Beyond the MVP") aparece impresa en el
PDF dentro de la sección Product Philosophy, entre las slides 8 y 10. En este
guión se presenta fuera de ese orden, en el bloque 7 — hay que saltarla al
pasar por el bloque 2 y volver a ella al llegar al cierre.

---

## Bloque 1 — Hook + reencuadre del problema (0:00–1:30)

**Slides en pantalla**: 1 (portada, walk-on) → 2 (Origin Story·01, "Where this started") → 3 (Origin Story·02, "The path here") → 4 (The Problem·01, "50K+" — **slide de apoyo, 15s, sin desarrollar**) → 5 (The Problem·02, "Raw signal vs. strategic signal") → 6 (The Problem·03, "Where most tools stop")

**Apertura (literal)**: "Las historias más importantes de la Fórmula 1 son las que nunca ves."

**Arco del bloque**: de la portada se pasa casi sin pausa a la slide 2 — esa frase de apertura ES la slide, dicha antes de que el público termine de leerla. Los radios de equipo ("Leave me alone, I know what I'm doing" / "It's hammer time") se dejan respirar un segundo, sin explicarlos. La slide 3 es puro trámite biográfico — FIB, la tesis Kafka, Fermat — dicho rápido, sin detenerse, es credibilidad de fondo, no el foco. Al llegar a "The Problem", el ritmo cambia: la slide 4 es una cifra sola (50K+) que se nombra y se abandona en 15 segundos, sin desglosarla — funciona como shock cuantitativo, no como dato a analizar. Las slides 5 y 6 sí se desarrollan: la tabla de contraste (lo que da la telemetría vs. lo que necesita el ingeniero) y el diagrama "raw telemetry → ? → strategic decision" son el verdadero reencuadre del bloque — de aquí sale la pregunta que sostiene toda la charla.

**Cierre (literal)**: "Esto es lo que ves. Esto es lo que no ves. Esta charla es sobre lo segundo."

**Transición**: la frase de cierre queda flotando sobre el signo de interrogación de la slide 6 ("Where most tools stop") — es la bisagra directa hacia el principio de producto: si ahí es donde se paran las demás herramientas, el bloque 2 explica dónde no se para esta.

---

## Bloque 2 — Principio de producto (1:30–3:00)

**Slides en pantalla**: 7 (Product Philosophy·01, cita "If it doesn't answer a strategic question, it's not in the MVP") → 8 (Product Philosophy·02, "Strategic questions, not metrics" — **slide de apoyo, 20s, sin desarrollar**)

*(Slide 9, "Beyond the MVP", se salta aquí a propósito — va en el bloque 7.)*

**Apertura (literal)**: "Si no responde una pregunta estratégica, no entra en el MVP."

**Arco del bloque**: la cita de la slide 7 se lee tal cual está en pantalla — es la única slide de toda la charla donde el texto en pantalla y la frase hablada deberían coincidir casi palabra por palabra, porque es una cita de posicionamiento, no una explicación. La slide 8 se pasa más deprisa de lo que el contenido sugiere: son las 5 preguntas MVP (TRUE_PACE, TYRE_DEG, PIT_IMPACT, CHAOS_INDEX, DECISIONS), pero aquí NO se desarrolla cada una — se nombran como conjunto, 20 segundos, y se avanza. El desarrollo real de cada pregunta ocurre en el bloque 3 (cuando se explica cómo se calculan) y en el bloque 4 (cuando se ven resueltas sobre una carrera real). Repetirlas aquí sería gastar tiempo dos veces.

**Cierre (literal)**: "Cinco preguntas. Cinco módulos. Ahora, cómo se calculan de verdad."

**Transición**: "cómo se calculan de verdad" es literal — el bloque 3 abre directamente con el cómo, sin recapitular el qué.

---

## Bloque 3 — Arquitectura (3:00–8:00)

**Slides en pantalla**: 10 (Architecture·01, "System overview") → 11 (Architecture·02, "Normalization and metrics") → 12 (Architecture·03, "Serving the dashboard") → 13 (Case Study, portada "2024 Brazilian Grand Prix") → 14 (Case Study, "The dashboard, at a glance" — **slide de apoyo, 10s, funciona como índice del demo, sin desarrollar**)

**Apertura (literal)**: "Detrás de cada número hay una decisión de diseño — y algunas nos han costado caro."

**Arco del bloque**: es el bloque más largo (5 minutos) y el que más se apoya en `CUE_CARDS.md`, no en las slides — las slides 10 y 11 son esqueletos (cuatro cajas con flechas, cinco filas de tabla) que sirven de percha visual mientras se cuenta lo real: `position_at_lap` reconstruyendo posición por timestamp, las 4 reglas del clean lap filter con los números reales de VER y NOR, que True Pace ordena por mediana y no por la vuelta más rápida (con el top 5 nuevo de 9636 como evidencia), la regresión de degradación, y el Chaos Index con sus componentes reales. La slide 12 ("Serving the dashboard") es donde se cuela la precisión importante: la slide dice "GitHub Actions, on a timer" — en la implementación real NO hay temporizador, es `workflow_dispatch` manual más un disparo por `push` cuando cambia `laps.json`. Merece la pena decirlo en voz alta como matiz, no como corrección incómoda: "en la práctica lo disparamos a mano o con cada commit de datos nuevos, no con un cron" cierra la slide sin contradecirla de forma abrupta. El dato de las 33 stints / 0 en "High cliff risk" y el de los 7.9MB por piloto crudo vs 380KB servido son los dos números que deberían quedar en el aire al llegar a la slide 13. La slide 13 es un simple título de sección — "2024 Brazilian Grand Prix" — se anuncia y se pasa. La slide 14 es el índice de los 5 paneles que se van a ver en vivo: se lee la lista en 10 segundos, sin explicar ninguno todavía — el desarrollo de cada uno es exclusivamente el bloque 4.

**Cierre (literal)**: "Esto es la teoría. Vamos a verlo con una carrera real: São Paulo 2024, Chaos 100 sobre 100."

**Transición**: el número "Chaos 100 sobre 100" es el gancho hacia la slide 15 (Live Demo) — se dice de pie, mirando ya hacia el portátil o la pantalla del navegador, no hacia el proyector.

---

## Bloque 4 — Live demo, Brasil 2024 (8:00–14:00)

**Slides en pantalla**: 15 (Live Demo, portada "Now, let's look at the real thing" — pitwallengineer.com). A partir de aquí no hay más slides: los siguientes 6 minutos son la aplicación real en el navegador, no el PDF.

**Apertura (literal)**: "Esto es lo que ves. Esto es lo que no ves. Ahora mismo, vamos a ver las dos cosas a la vez."

**Secuencia del demo, panel por panel** — cada panel se abre con la afirmación, el nombre del panel llega después, nunca antes:

1. *(cargar sesión 9636, dejar que se vea el Chaos 100 sin comentarlo todavía)*
2. **"Si preguntas quién fue más rápido, la respuesta cambia según qué 'más rápido' quieras decir. Por vuelta única, Verstappen le saca 1.045 segundos a Norris. Por ritmo sostenido — la mediana de sus vueltas limpias — la ventaja real es de 0.333. Menos de un tercio."** → se revela el panel de True Pace, se abre `exclusion_log` en vivo.
3. **"En una carrera con seis transiciones de condición de pista, el compuesto que mejor aguantó no fue el que todo el mundo esperaría."** → se revela Tyre Degradation, señalando `best_compound: INTERMEDIATE`.
4. **"Una parada en boxes puede costarte ocho posiciones sin que el coche haga nada mal en pista."** → se revela Pit Impact, señalando la parada de HUL en la vuelta 27.
5. **"El pico de caos de toda la carrera no lo causó la lluvia. Lo causó un choque en la curva uno."** → se revela Chaos Index / Race Phase Timeline, marcando la vuelta 28 y el VSC por el incidente PIA-LAW. *(Esta frase es intencional: es el mismo hecho que en el bloque 5 la IA local llegó a atribuir a "weather" — dejar esta afirmación clara aquí hace que el error de la IA, cuando se cuente después, se entienda al instante sin tener que reexplicar el hecho.)*
6. **"De todos los eventos de esta carrera, solo cuatro cambiaron el resultado de verdad. El primero: una parada doce segundos más lenta de lo que debía."** → se revela Decisions, con HUL L27 como rank 1.

**Cierre (literal)**: "Cinco paneles. Cinco preguntas. Cero opiniones — solo lo que dice el dato."

**Transición**: se vuelve al PDF (slide 16, "Where AI fits") justo cuando se cierra la pestaña del navegador o se minimiza — el gesto físico de volver a las slides marca el cambio de bloque.

---

## Bloque 5 — Dónde encaja la IA (14:00–17:00)

**Slides en pantalla**: 16 (Where AI Fits·01, "Race Engineer Discussion") → 17 (Where AI Fits·02, "Confidence and exclusion log")

**Apertura (literal)**: "La IA de este proyecto no ve nunca un solo número que no haya sido calculado y validado antes."

**Arco del bloque**: la slide 16 muestra el screenshot del chat — ojo, ese screenshot tiene una captura antigua ("Engineer radio offline") de antes de arreglar Groq esta misma semana; si se nota, se puede señalar como parte de la anécdota de producción del bloque 6, no como error a esconder. El contenido real de este bloque no está en el screenshot sino en lo que se cuenta encima: `build_chat_context` recorta el análisis ya calculado a un JSON de ~800 tokens, el modelo nunca toca un array crudo de OpenF1, y la prioridad real es Ollama local → Groq → mensaje offline explícito. La slide 17 está marcada como "ILLUSTRATIVE EXAMPLE" en el propio PDF — el `confidence: 0.82` numérico de esa slide es una simplificación de la charla, no lo que hace el código (la confianza real es Low/Medium/High, no un float) — no hace falta corregirlo en voz alta, pero tampoco hay que citar el 0.82 como si fuera un número real del sistema. Lo que sí es real y verificado esta semana es la demo en vivo: preguntar "¿por qué VER más rápido que NOR?" y que la IA responda citando 83.657 contra 83.990, gap 0.333 — el mismo número exacto de la tabla. Y justo después, el límite: en las mismas pruebas, la IA atribuyó el VSC de la vuelta 28 a "weather" — el mismo VSC que en el bloque 4 se dijo, con la afirmación abierta, que vino de un choque en curva 1. Cita bien el dato, construye mal la causa encima. Se mitigó con una regla explícita contra lenguaje causal no cubierto por el contexto, no se eliminó del todo.

**Cierre (literal)**: "Cita bien los datos. Pero construir la causa encima del dato es un problema distinto — y ahí todavía tiene límites."

**Transición**: "límites" es la palabra puente hacia el bloque 6 — de los límites del modelo a los límites de la infraestructura que lo sirve.

---

## Bloque 6 — Lecciones de producción (17:00–20:00)

**Slides en pantalla**: 18 (Engineering Lessons·01, "Module-level imports and OOM") → 19 (Engineering Lessons·02, "Caching and absolute paths")

**Apertura (literal)**: "No todos los errores de producción son de lógica. Algunos son de memoria, y otros son de una carpeta que no existe donde tú crees que existe."

**Arco del bloque**: la slide 18 usa `pandas` como ejemplo genérico de import pesado — en el caso real fue `fastf1`, importado a nivel de módulo en el fichero de telemetría, cargándose en memoria en cuanto arrancaba el proceso, antes de servir una sola request. Con 512MB totales en el free tier de Render, eso solo ya se comía el margen. El fix real fue mover el import dentro de la rama de desarrollo únicamente — en producción ese paquete no se importa nunca, ni una vez. La slide 19 junta dos lecciones en una: la de GitHub Actions (aquí también la slide dice "on a timer" con un cron — la realidad, otra vez, es disparo manual o por push, no un temporizador; mismo matiz que en el bloque 3) y la de rutas absolutas. Aquí el ejemplo de la slide (`DATA_DIR = os.environ["DATA_ROOT"]`) tampoco es el fix literal — el real fue `Path(__file__).parents[2] / "cache"`, una ruta derivada del propio fichero en vez de una variable de entorno, porque Render a veces arrancaba uvicorn desde la raíz del repo en vez de desde `backend/`. La idea de fondo es la misma que en la slide: nunca una ruta relativa en producción. No hace falta enseñar el diff exacto — hace falta que quede clara la causa (`__file__` da una ruta que no depende de dónde te lanzan el proceso).

**Cierre (literal)**: "Dos bugs, la misma lección: en producción, nunca asumas — compruébalo."

**Transición**: de "comprobarlo todo" en producción se pasa naturalmente a comprobar qué queda por hacer — el roadmap.

---

## Bloque 7 — Roadmap y cierre (20:00–22:00)

**Slides en pantalla**: 9 (Product Philosophy·03, "Beyond the MVP" — **movida aquí desde el bloque 2, slide de apoyo, 15s, sin desarrollar**) → 20 (Roadmap, "What's next") → 21 (Questions)

**Apertura (literal)**: "Todo lo que habéis visto son cinco preguntas. Hay ocho módulos más detrás."

**Arco del bloque**: la slide 9 se pasa rápido a propósito — nombrar los 8 módulos (RACE_PHASE, RACE_DNA, DRS_TRAINS, WX_CROSSOVER, CLEAN_AIR_VALUE, ENGINEER_NOTES, RACE_ENGINEER_CHAT, TELEMETRY_REPLAY) sin detenerse en ninguno, 15 segundos, es la prueba de que el MVP de 5 preguntas no es todo el sistema, es solo el núcleo. La slide 20 sí se dice en voz alta punto por punto, pero sin vender: after-race analysis, reproducción de datos en vivo, notificaciones post-carrera, un modelo de razonamiento mejor para el chat, y nuevas métricas por feedback de usuarios. Aquí es también donde caben los huecos reales dichos en voz alta si hay tiempo: el Chaos Index sin normalizar por número de vueltas (Mónaco y Spa puntúan igual con los mismos eventos), y que `/analysis` no valida caché corrupta igual que `/chat`. No hace falta disculparse por ellos — decirlos en un contexto de ingeniería es lo que da credibilidad, no lo que la quita. La slide 21 es el cierre de contacto — pitwallengineer.com, email, LinkedIn — se deja en pantalla mientras se dicen las últimas frases, no se pasa a negro antes.

**Cierre (literal, últimas palabras de la charla)**: "Esto es lo que ves. Esto es lo que no ves. Pit Wall Engineer existe para que dejes de tener que elegir."

**Transición**: ninguna — es el final. La slide 21 se queda en pantalla para preguntas.
