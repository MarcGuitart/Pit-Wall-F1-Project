# Q&A Prep — Pit Wall Engineer

18 preguntas que una audiencia de ingenieros de motorsport/defensa probablemente
haría después de esta charla, con la respuesta real verificada contra el
código — no la respuesta que "suena bien". Cada respuesta está pensada para
decirse en voz alta en 2-3 frases. Donde el código no tiene una respuesta
limpia, lo digo explícito en vez de improvisar una.

---

### 1. ¿Qué pasa si a OpenF1 le falta un endpoint entero para una sesión (p. ej. weather)?

Cada servicio trata la lista vacía como caso normal, no como error — todo el
pipeline lee con `data.get("weather", [])`, nunca asume que la clave existe.
Si falta weather, el Chaos Index simplemente no suma puntos de lluvia
(`rain_periods=0`) y sigue. El caso que sí es duro es que falten las vueltas
(`laps`): ahí la API corta con un 404/425 explícito en vez de devolver un
análisis vacío. *(`analysis.py:223-263`)*

### 2. ¿Qué pasa si OpenF1 te rate-limita a media petición?

El cliente reintenta cada endpoint hasta 4 veces con backoff (2s, 5s, 10s,
20s) y respeta el header `Retry-After` si OpenF1 lo manda. Si aun así falla,
ese endpoint se descarta en silencio y el resto sigue — el análisis se calcula
igual, con esa pieza vacía. Dato curioso: el frontend ya tiene un estado de
error `OPENF1_RATE_LIMIT` diseñado y listo, pero el backend hoy nunca emite
ese código — lo comprobé con grep sobre todo el repo, cero resultados.
*(`openf1_client.py:26-27,65-78`; `SessionUnavailableState.tsx:28-32`)*

### 3. ¿Qué pasa si falla el cálculo de una métrica nueva (Race DNA, crossover, race phases...)?

Cada servicio "V4" está envuelto en su propio try/except dentro de
`analysis.py`. Si uno explota, se loggea como warning en el servidor y ese
campo se queda `None` o vacío, pero el resto del análisis se sirve igual con
código 200. El usuario nunca ve un error — esa tarjeta simplemente no aparece,
sin distinguir "falló de verdad" de "no aplica a esta carrera". *(`analysis.py:314-347`)*

### 4. ¿Qué pasa si el JSON cacheado en disco se corrompe?

Depende de por dónde entres, y ahí hay una asimetría real: el endpoint de
chat valida explícitamente contra el modelo Pydantic y devuelve un 500 con
mensaje claro ("Cached analysis is corrupted") si no cuadra. El endpoint
`/analysis`, en su lectura rápida de caché, no tiene ese mismo guard — un JSON
corrupto ahí lanzaría un error de validación sin capturar, sin mensaje amable.
*(`chat.py:84-90` vs. `analysis.py:167-171`)*

### 5. ¿Qué pasa si dos usuarios piden la misma sesión al mismo tiempo?

Hay un `asyncio.Lock` por `session_key`. La segunda petición que llega
mientras la primera está calculando espera a que suelte el lock y entonces
relee caché en vez de recalcular desde cero — double-checked locking clásico.
Evita pegarle a OpenF1 dos veces por la misma sesión si dos pestañas cargan a
la vez. *(`analysis.py:30-40,205-213`)*

### 6. ¿Por qué esto no funciona con una sesión en curso, en vivo?

Todo el diseño de caché asume que una sesión histórica es inmutable — se
guarda para siempre, sin TTL, sin lógica de expiración. Una sesión en vivo
cambia cada segundo, así que ese caché "para siempre" estaría mal desde el
primer request. Por eso hay un guard explícito que bloquea el análisis hasta
30 minutos después de que la sesión termine, y porque además OpenF1 exige un
token de autenticación distinto para datos en vivo que el modo demo no usa.
*(`time.py:30-37`; `openf1_client.py:41-44`)*

### 7. ¿Cuánto costaría hacerlo en vivo sin rehacer todo?

Respuesta honesta: no está implementado, y no hay ni un plan escrito en el
código ni en los docs de diseño. El bloqueo estructural es el caché sin TTL —
soportar vivo exigiría invalidación activa y recalcular sobre datos que
todavía están cambiando, algo que ningún servicio actual contempla porque
todos asumen "la carrera ya terminó".

### 8. ¿Cómo se decide si una métrica es "High confidence" o "Low confidence"?

No hay una fórmula única — cada servicio decide la suya. Pace y tyre
degradation lo calculan por tamaño de muestra (≥12 vueltas limpias = High,
≥6 = Medium, si no Low). Pit impact es binario según si hay dato de posición
disponible o no. Telemetría directamente lo fija por fuente: FastF1 siempre
"High", el fallback de OpenF1 siempre "Medium", sin mirar cuántos puntos hay
de verdad. *(`statistics.py:34-40`; `pit_service.py:8-33`; `telemetry_service.py:245,517`)*

### 9. ¿Se puede comparar el Chaos Index de una carrera con el de otra directamente?

No, y es un hueco real que hay que decir en voz alta: el Chaos Index no
normaliza por número de vueltas ni por duración de carrera. El mismo número
de safety cars puntúa igual en Mónaco (~78 vueltas) que en Spa (~44), aunque
la densidad de caos por vuelta sea muy distinta. Es una cuenta absoluta de
eventos, no una tasa. *(`chaos_service.py:75-102`, sin ningún uso de `total_laps`)*

### 10. ¿Por qué el pit impact mide posición en vuelta+3 y no en vuelta+1?

Es una ventana fija de diseño, no adaptativa: 1 vuelta antes del stop, 3
después, para dejar que el tráfico inmediato a la salida de boxes se asiente.
No se ajusta por densidad de tráfico ni por si hay un tren de DRS justo ahí —
en una zona muy comprimida, 3 vueltas pueden no bastar para que el orden se
estabilice de verdad. *(`pit_service.py:54-56`)*

### 11. ¿Qué pasa si la IA interpreta mal una métrica o directamente inventa un dato?

El system prompt le da al modelo un resumen ya calculado de ~800 tokens y le
exige citar vueltas y pilotos concretos, pero no hay ninguna validación
posterior que compruebe que la respuesta coincide con los números reales. El
campo `cited_signals` que se devuelve junto a la respuesta no analiza el
texto generado — son literalmente las 3 primeras `engineer_notes` por
severidad, siempre las mismas, tenga o no relación con lo que el modelo
contestó. *(`chat.py:101-102`, comentario "Simple cited-signals")*

### 12. ¿Cómo se evita entonces que la IA alucine un tiempo de vuelta que no existe?

No se previene con un verificador automático — se previene limitando lo que
el modelo PUEDE ver. Como el contexto son solo campos ya validados de
`FullRaceAnalysis` y nunca arrays crudos de OpenF1, como mucho puede combinar
mal esos números en la frase, pero no puede inventar una vuelta que no
estuviera ya en el JSON que se le pasó. Es contención por diseño, no
verificación a posteriori. *(`chat_service.py:1-4`)*

### 13. ¿Qué pasa si Ollama y Groq fallan a la vez?

Un mensaje explícito y controlado, no una excepción sin manejar: "Engineer
radio offline", con instrucciones concretas de qué hacer en local y en
producción. El endpoint sigue devolviendo 200 con ese texto como respuesta,
no un 500 — el chat "falla" de forma conversacional, no técnica.
*(`ollama_client.py:197-202`)*

### 14. ¿Qué licencia tiene esto realmente, y qué pasa si F1/FOM pide retirarlo?

Respuesta honesta: hueco real. El README dice "MIT", pero no existe ningún
fichero `LICENSE` en la raíz del repo — lo comprobé directamente, no está. Si
FOM o la FIA pidieran retirarlo, hoy la única protección es el disclaimer de
"not affiliated" en el README; no ha habido ninguna revisión legal formal de
los términos de OpenF1 ni de uso de marca.

### 15. ¿Estáis usando datos oficiales de F1? ¿Hay riesgo de marca registrada?

Los datos vienen de OpenF1 (API pública y gratuita, sin key para sesiones
históricas) y de FastF1 (librería open-source que consume feeds públicos, no
un contrato oficial con FOM). El riesgo real es de marca/branding, no del dato
en sí — de ahí el disclaimer explícito de no afiliación — pero, otra vez, sin
`LICENSE` y sin asesoría legal formal, eso es una mitigación de texto, no
jurídica.

### 16. ¿Qué pasa si alguien manda un `session_key` manipulado o inválido a la API?

FastAPI valida el tipo en el path (`session_key: int`) antes de que corra
ninguna lógica de negocio — un valor no numérico da 422 automático, sin tocar
el código propio. Un entero válido pero inexistente simplemente sigue el flujo
normal de "sesión no encontrada". No hay interpolación de texto en queries ni
en rutas de caché — se usa `str(session_key)` como nombre de carpeta a partir
de un int ya validado, así que no hay vector de inyección ahí.

### 17. ¿Los resultados son reproducibles? ¿Mismo input, mismo output, siempre?

Sí, determinista de punta a punta — regresión lineal, conteo de keywords,
umbrales fijos, todo son funciones puras sobre el mismo JSON cacheado. El
único `random` de todo el pipeline es el jitter (`random.uniform(0.2, 0.6)`)
para espaciar las llamadas salientes a OpenF1; eso afecta al timing de red,
nunca al resultado del análisis. *(`openf1_client.py:50`)*

### 18. ¿Funciona igual para sprint races o solo para carreras normales?

Corre exactamente el mismo pipeline, sin ramas específicas por tipo de
sesión — ningún servicio comprueba si `session_name` es "Sprint" para ajustar
su lógica. Lo único que distingue tipos de sesión es la estimación de
duración para el guard de histórico, que sí tiene entradas separadas para
Sprint y Sprint Qualifying. Los umbrales de degradación y chaos son los mismos
números pensados para una carrera normal, sin ajuste por ser más corta.
*(`time.py:13-19`)*
