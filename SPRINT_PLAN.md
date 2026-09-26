# Sprint Plan — Pit Wall Engineer

Plan de implementación técnica. Solo código e infraestructura: la parte
comercial, de comunicación y de contenido queda fuera de este documento.

Referencia de validación para todo el plan: **9636 (São Paulo 2024, Chaos
100/Extreme)** y **9539 (España 2024, Chaos 62/Medium)**.

---

## Estado de partida

Lo que ya está resuelto y no se vuelve a tocar en este plan:

- True Pace ordena por `median_clean_lap`, no por `clean_pace`.
- `LICENSE` existe en la raíz y el README enlaza a él.
- System prompt con reglas anti-causalidad, verificado en tres rondas contra 9636.
- Caché de 9636 y 9539 regenerada y servida desde disco.

---

## Bloqueos y dependencias

| Trabajo | Depende de | Coste |
|---|---|---|
| Hardening (Sprint 1) | Nada | 0 € |
| Migración de modelo (Sprint 2) | Nada | Variable por uso |
| Normalización de Chaos (Sprint 2) | Nada | 0 € |
| Backend con más memoria | Presupuesto aprobado | Sí |
| Backfill histórico completo | Plan Sponsor de OpenF1 | Sí |
| Modo live | Scoping propio + presupuesto | Sí |

Nada del Sprint 1 está bloqueado. Se puede ejecutar entero hoy.

---

## SPRINT 1 · Hardening

**Duración estimada: 1 semana · Coste: 0 €**

El objetivo es que el servicio aguante un aumento de tráfico sin degradarse y
sin generar gasto descontrolado. Todo el trabajo es de backend.

### 1.1 · Límite de gasto del proveedor de LLM

Configurar un tope de gasto en la consola del proveedor. Sin esto, un pico de
uso es una factura abierta. Si el tope se alcanza, es preferible que el chat
deje de responder a que siga facturando.

- [ ] Tope mensual configurado
- [ ] Alerta por email al 50% y al 80%

### 1.2 · Rate limit en `/chat`

No existe hoy. Un solo usuario puede consumir sin límite.

- [ ] Límite por sesión o IP (orientativo: 10 mensajes/hora)
- [ ] Respuesta 429 con mensaje claro, no un error genérico
- [ ] Verificar que el frontend muestra ese estado de forma legible

La infraestructura de conteo ya está medio montada: existe un `asyncio.Lock`
por `session_key` en `analysis.py`.

### 1.3 · Guard de caché corrupta en `/analysis`

Asimetría documentada en `QA_PREP.md` #4: `/chat` valida contra el modelo
Pydantic y devuelve un 500 con mensaje claro; `/analysis`, en su lectura
rápida de caché, no tiene ese guard y lanzaría un error de validación sin
capturar.

- [ ] Replicar en `analysis.py` el guard que ya existe en `chat.py`
- [ ] Mensaje de error equivalente
- [ ] Test con un JSON deliberadamente corrupto

### 1.4 · Emitir los códigos de error que el frontend ya espera

`SessionUnavailableState.tsx` maneja `OPENF1_RATE_LIMIT`, `ANALYSIS_FAILED` y
`OPENF1_ERROR`. El backend no emite ninguno de los tres: grep sobre el repo,
cero resultados. La UI está preparada para estados que nunca llegan.

- [ ] `OPENF1_RATE_LIMIT` cuando OpenF1 responde 429
- [ ] `OPENF1_ERROR` cuando un endpoint falla tras agotar reintentos
- [ ] `ANALYSIS_FAILED` cuando un servicio V4 explota y deja el campo vacío
- [ ] Verificar cada estado en la UI, no solo en el backend

### 1.5 · Resolver `cited_signals`

Hoy no analiza la respuesta del modelo: son siempre las 3 `engineer_notes` top
por severidad, digan lo que digan. Es un elemento de UI que afirma una
trazabilidad que no existe.

Dos salidas, elegir una:

- **Arreglarlo**: extraer las métricas realmente referenciadas en la respuesta.
- **Quitarlo**: eliminar los chips de la UI hasta que sea real.

- [ ] Decisión tomada
- [ ] Implementada

---

## SPRINT 2 · Calidad de análisis

**Duración estimada: 2 semanas · Coste: variable**

### 2.1 · Migración del modelo de lenguaje

El modelo actual es abierto y gratuito, y su razonamiento es limitado: cita
bien los datos pero puede construir causalidad falsa encima. Las reglas
anti-causalidad del system prompt mitigan el síntoma, no la causa.

- [ ] Nuevo modelo integrado como primera opción de la cadena
- [ ] Cadena de fallback mantenida (local → nuevo modelo → mensaje offline)
- [ ] Reejecutar las 3 preguntas de validación contra 9636:
  - `why was VER faster than NOR on clean laps?`
  - `what happened around lap 28?`
  - `did the pit stop help RUS?`
- [ ] Confirmar que los números citados coinciden con la tabla
- [ ] Confirmar que no reaparece causalidad inventada

### 2.2 · Prompt caching

El contexto de una sesión es idéntico en todos los mensajes de una
conversación y entre usuarios que preguntan por la misma carrera. Es el caso
de uso exacto para cacheo de prefijo.

- [ ] Bloque de contexto de sesión marcado como cacheable
- [ ] Medir coste por conversación antes y después
- [ ] Verificar que el cacheo no altera las respuestas

### 2.3 · Normalización del Chaos Index

Hoy es un conteo absoluto de eventos, sin usar `total_laps`. El mismo número
de safety cars puntúa igual en un circuito de 78 vueltas que en uno de 44.

- [ ] Normalizar por número de vueltas o duración de sesión
- [ ] Recalibrar umbrales Low/Medium/High/Extreme
- [ ] Validar contra 9636 (debe seguir siendo Extreme)
- [ ] Validar contra 9539 (debe seguir siendo Medium)
- [ ] Validar contra al menos un circuito corto y uno largo
- [ ] Documentar los nuevos umbrales

**Cuidado:** este cambio altera un número que ya se ha mostrado públicamente.
Si 9636 deja de ser 100/100, conviene dejar constancia del cambio de método.

### 2.4 · Umbrales por tipo de sesión

El pipeline corre igual para sprints que para carreras normales: ningún
servicio comprueba `session_name`. Los umbrales de degradación y chaos están
pensados para una carrera completa.

- [ ] Decidir si las sesiones sprint necesitan umbrales propios
- [ ] Si sí, implementar y validar contra una sprint real
- [ ] Si no, documentar la decisión para poder defenderla

---

## SPRINT 3 · Datos e infraestructura

**Duración estimada: 1-2 semanas · Coste: sí · Bloqueado por presupuesto**

### 3.1 · Decisión previa: qué se almacena

Antes de pagar por almacenamiento hay que responder esto:

- **Opción A — guardar solo el JSON procesado.** ~380 KB por sesión. Cuatro
  temporadas caben en ~200 MB. No hace falta object storage.
- **Opción B — guardar también el crudo.** ~48 MB por sesión, ~25 GB para el
  histórico completo. Requiere object storage y presupuesto.

La opción B solo se justifica si el crudo se va a releer. Si el pipeline es
descargar → computar → guardar procesado → descartar, la opción A elimina el
problema entero.

- [ ] Decisión tomada y documentada

### 3.2 · Backend con más memoria

El límite actual de 512 MB es la causa del import perezoso de FastF1 y del
alcance recortado del precómputo.

- [ ] Plan superior activado
- [ ] Verificar que desaparece el spin-down
- [ ] Revisar si el import perezoso sigue siendo necesario (probablemente sí,
      como buena práctica, pero ya no como obligación)

### 3.3 · Backfill histórico

- [ ] Script de backfill con respeto al rate limit
- [ ] Ejecutar por temporadas, no todo de golpe
- [ ] Validar integridad de cada sesión descargada
- [ ] Confirmar que el precómputo sigue corriendo en GitHub Actions (7 GB de
      RAM, gratuito para repos públicos)

---

## SPRINT 4+ · Modo live

**No planificable todavía. Requiere scoping propio.**

Esto no es una ampliación de plan: es otra arquitectura. Toda la caché actual
asume sesión inmutable y ausencia de TTL, que es exactamente lo contrario de
lo que necesita el directo.

Piezas identificadas, sin estimar:

- Worker de ingesta permanente, separado del API, manteniendo conexión con la
  fuente durante la sesión.
- Almacén de estado con expiración. Los ficheros JSON actuales no sirven.
- Fanout: un solo ingestor lee de la fuente, los usuarios leen de nosotros.
  El rate limit de la API no permite que cada usuario consulte por su cuenta.
- Invalidación activa de caché, que hoy no existe en ningún servicio.

**Antes de comprometer fecha:** hacer una sesión de scoping técnico dedicada y
producir una estimación real. Es el punto del roadmap sobre el que más fácil
es prometer de más.

---

## Orden de ejecución recomendado

1. **Sprint 1 completo.** Es gratis, no está bloqueado por nada y es lo único
   que protege el servicio ante un aumento de tráfico.
2. **Sprint 2.1 y 2.2** (modelo y cacheo). Resuelven el fallo más visible del
   sistema.
3. **Sprint 2.3** (chaos). Cierra un hueco reconocido públicamente.
4. **Sprint 3**, cuando haya presupuesto.
5. **Sprint 4**, solo después de scoping propio.

---

## Deuda técnica conocida, sin sprint asignado

Registrada aquí para que no se pierda. Ninguna es urgente.

- Ventana fija de 3 vueltas en pit impact, no adaptativa por densidad de
  tráfico.
- `engineer-chat/route.ts`: segundo camino de chat en el frontend que no se
  usa en producción. Parece vestigial. Decidir si se elimina.
- Confianza de telemetría fijada por fuente, no por cantidad real de datos
  disponibles.
- Cuando un servicio V4 falla, la tarjeta desaparece sin distinguir "falló" de
  "no aplica a esta carrera".
