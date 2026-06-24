<div align="center">

# Pit Wall IQ

### Entiende una carrera de Formula 1 como si estuvieras en el muro.

**Pit Wall IQ** es un dashboard de inteligencia estrategica post-carrera que transforma datos crudos de OpenF1 en lectura competitiva: ritmo real, degradacion, pit stops, fases de carrera, caos, meteorologia, DRS trains, telemetria de piloto y un ingeniero de carrera con IA local.

No es una tabla de tiempos. Es una herramienta para responder la pregunta que queda despues de ver un Gran Premio:

**por que paso lo que paso?**

<p>
  <a href="#demo-publica-y-despliegue"><strong>Demo publica: pendiente</strong></a>
  &nbsp;|&nbsp;
  <a href="#capturas-recomendadas-para-el-readme"><strong>Capturas recomendadas</strong></a>
  &nbsp;|&nbsp;
  <a href="#setup-local"><strong>Setup local</strong></a>
  &nbsp;|&nbsp;
  <a href="#licencia-y-uso"><strong>Licencia</strong></a>
</p>

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-custom%20race%20UI-38BDF8?logo=tailwindcss&logoColor=white)
![OpenF1](https://img.shields.io/badge/Data-OpenF1-E10600)
![Telemetry](https://img.shields.io/badge/Telemetry-throttle%20%7C%20brake%20%7C%20speed%20%7C%20gear-7C3AED)
![AI](https://img.shields.io/badge/AI-Ollama%20local-black)

**Strategy intelligence** / **Race telemetry replay** / **Weather and race-control analysis** / **AI race engineer**

</div>

---

## Vista Rapida

| Area | Que demuestra |
|------|---------------|
| **Strategy IQ** | Convierte vueltas, stints, pits, weather y race control en lectura estrategica. |
| **Race Timeline** | Resume la carrera por fases: salida, pit windows, SC/VSC, crossovers y final push. |
| **Driver Telemetry Replay** | Reproduce speed, throttle, brake, gear, DRS, G/G y sonido de motor por piloto. |
| **Race Wall Engineer** | Chat contextual que responde usando datos de la sesion, no conocimiento generico. |
| **Production-ready API** | FastAPI con cache, fallback ante fallos de OpenF1 y endpoints documentados. |

## Indice

- [Por Que Existe](#por-que-existe)
- [Funcionalidades Principales](#funcionalidades-principales)
- [Metricas Procesadas](#metricas-procesadas)
- [Capturas Recomendadas Para El README](#capturas-recomendadas-para-el-readme)
- [Arquitectura](#arquitectura)
- [API](#api)
- [Demo Publica Y Despliegue](#demo-publica-y-despliegue)
- [Licencia Y Uso](#licencia-y-uso)

---

## Por Que Existe

La retransmision te cuenta quien gano. Pit Wall IQ intenta explicar **como** se construyo la carrera:

- quien tuvo ritmo real cuando limpias trafico, boxes y neutralizaciones;
- quien gano o perdio con la ventana de pit stop;
- donde aparecio degradacion o tyre cliff;
- si el resultado estuvo marcado por lluvia, Safety Car, VSC o DRS trains;
- que decisiones fueron estrategicamente relevantes;
- como condujo cada piloto, con trazas de freno, acelerador, velocidad, marcha y DRS.

El objetivo es que un fan, creador de contenido, analista o ingeniero curioso pueda abrir una carrera y tener una lectura estrategica en minutos.

---

## Funcionalidades Principales

### Selector De Temporada, Gran Premio Y Sesion

La app permite elegir temporada, carrera y sesion desde OpenF1. El backend cachea meetings, sessions y analisis completos para que las carreras historicas carguen rapido y sigan disponibles aunque OpenF1 tenga fallos puntuales.

Incluye soporte para temporadas recientes como 2025, con cache por ano para evitar errores intermitentes del proveedor de datos.

### Strategy View

Vista principal pensada para entender rapidamente la historia estrategica de la carrera. Agrupa los modulos mas importantes en una lectura de alto nivel:

- Race Brain: resumen ejecutivo de la carrera.
- True Pace Podium: top de ritmo real.
- Tyre Cliff Map: riesgo de degradacion por stint.
- Pit Sequence Summary: ganadores y perdedores de paradas.
- Key Decisions: decisiones con impacto estrategico.
- Weather Overlay: condiciones y crossovers.
- Chaos Profile: lectura de incidentes y volatilidad.
- DRS Train Detector: trenes relevantes y pilotos atrapados.

### Data View

Vista de tablas completas para validar el analisis. Permite inspeccionar:

- muestras de vueltas limpias;
- logs de exclusion;
- stints y degradacion;
- pit stops con duracion y delta de posicion;
- senales de ingeniero;
- decisiones detectadas.

### Tabs De Analisis

La interfaz separa el analisis por dominios para evitar una pantalla sobrecargada:

- **Strategy**: lectura estrategica central.
- **Weather**: condiciones, lluvia, temperatura y crossovers.
- **Race Control**: Safety Car, VSC, banderas, investigaciones y penalizaciones.
- **Management**: gestion de carrera, stint logic, pit timing y tyre usage.
- **Telemetry**: replay de conduccion y canales dinamicos por piloto.

### Race Wall Engineer

Chat tipo radio de equipo con respuestas basadas en la carrera seleccionada. El sistema construye un contexto compacto con:

- top de ritmo;
- tyre cliffs;
- pit winners y losers;
- race DNA;
- fases de carrera;
- DRS peak train;
- caos y weather windows;
- piloto enfocado, si existe.

El objetivo es que el ingeniero no responda sobre F1 en general, sino sobre **esa sesion concreta**.

---

## Metricas Procesadas

### Ritmo Y Vueltas

- `median_lap`: mediana de vuelta total.
- `clean_pace`: ritmo limpio tras filtrar vueltas no representativas.
- `traffic_score`: diferencia entre ritmo total y ritmo limpio.
- `sample_size`: cantidad de vueltas validas usadas.
- `confidence`: Low / Medium / High segun volumen de muestras.
- `exclusion_log`: vueltas excluidas y razon.

Filtros aplicados:

- pit in / pit out;
- Safety Car y VSC;
- vueltas con outliers estadisticos;
- muestras insuficientes.

### Degradacion Y Neumaticos

- compuesto por stint.
- vuelta de inicio y fin.
- edad del neumatico al inicio.
- pendiente de degradacion en segundos por vuelta.
- clasificacion de cliff risk: Low / Medium / High.
- mejor compuesto medio de la sesion.

El sistema usa regresion lineal sobre vueltas limpias por stint para estimar degradacion.

### Pit Stops

- vuelta de parada.
- `lane_duration`.
- `stop_duration`, si OpenF1 lo proporciona.
- posicion antes del pit.
- posicion despues del pit.
- delta neto de posicion.
- verdict: SC Winner, Undercut, Gained, Neutral, Costly, Lost.

El delta se reconstruye con posicion interpolada por timestamp, no solo por numero de vuelta.

### Race Control Y Caos

Chaos Index de 0 a 100 basado en:

- Safety Car y VSC;
- yellow flags;
- investigaciones;
- penalizaciones;
- lluvia;
- volatilidad de posiciones.

Tambien detecta:

- peak chaos lap;
- fases de Safety Car Reset;
- VSC Period;
- ventanas donde race control altera el valor estrategico de parar.

### Weather Y Crossovers

- condicion por vuelta: DRY / DAMP / WET.
- temperatura de pista.
- temperatura ambiente.
- lluvia.
- eventos de lluvia: onset, end, peak rain.
- ventanas de crossover.
- pilotos early, late y best-timed.
- nota de atribucion cuando una Safety Car coincide con la ventana.

Esto evita conclusiones falsas del tipo "gano por neumatico" cuando en realidad hubo neutralizacion simultanea.

### DRS Trains

- snapshots crudos de intervalos.
- cadenas de coches con gaps relevantes.
- agrupacion de ventanas consecutivas por solapamiento de pilotos.
- filtrado de laps SC/VSC.
- peak train.
- lider del tren.
- pilotos atrapados.
- duracion estimada.
- impacto Low / Medium / High.

### Clean Air Value

Estima cuanto tiempo pierde un piloto en trafico comparando ventanas dentro y fuera de un DRS train:

- gain estimado en segundos/vuelta;
- pilotos con muestras validas;
- contexto de salida del tren;
- confianza Low / Medium.

### Race DNA

Huella estrategica deterministica de la carrera:

- primary factor;
- secondary factor;
- strategy type;
- overtaking difficulty;
- pit timing sensitivity;
- tyre degradation impact;
- chaos level.

### Telemetria Y Replay

La pestana Telemetry permite seleccionar pilotos y reproducir la conduccion con canales sincronizados:

- speed;
- throttle;
- brake;
- gear;
- DRS;
- lap number;
- race time;
- sector times;
- deltas entre pilotos;
- G/G diagram;
- G-force meter;
- sonido sintetico de motor basado en velocidad, marcha, freno y acelerador.

Fuentes:

- FastF1 para replay de circuito cuando esta disponible localmente.
- OpenF1 `car_data` como fallback para trazas completas de carrera.

La telemetria se cachea por combinacion de pilotos para que comparar pilotos sea rapido despues de la primera carga.

---

## Capturas Recomendadas Para El README

No hacen falta muchas. Mejor pocas, potentes y bien elegidas:

| Captura | Que debe verse | Por que importa |
|---------|----------------|-----------------|
| **01. Home / selector** | Temporada, Gran Premio y sesion listos para analizar. | Demuestra que la app se entiende al abrirla. |
| **02. Strategy View** | Brasil 2024 con Race Brain, True Pace, Chaos y decisiones. | Vende la capacidad de resumir una carrera compleja. |
| **03. Weather + Race Control** | Crossovers, lluvia, SC/VSC y fases de carrera. | Ensena que el analisis entiende contexto, no solo tiempos. |
| **04. Telemetry Replay** | 2 o 3 pilotos, canales de speed/throttle/brake y replay. | Es la parte mas visual y diferencial del proyecto. |
| **05. Race Wall Engineer** | Overlay de radio con pregunta y respuesta contextual. | Demuestra IA aplicada a datos reales de la sesion. |

Recomendacion: guardar las imagenes en `docs/screenshots/` con nombres como:

```text
docs/screenshots/01-home-selector.png
docs/screenshots/02-strategy-brazil-2024.png
docs/screenshots/03-weather-race-control.png
docs/screenshots/04-telemetry-replay.png
docs/screenshots/05-race-engineer.png
```

Cuando esten hechas, se pueden insertar asi:

```md
## Screenshots

| Strategy View | Telemetry Replay |
|---------------|------------------|
| ![Strategy](docs/screenshots/02-strategy-brazil-2024.png) | ![Telemetry](docs/screenshots/04-telemetry-replay.png) |

| Weather + Race Control | Race Wall Engineer |
|------------------------|--------------------|
| ![Weather](docs/screenshots/03-weather-race-control.png) | ![Engineer](docs/screenshots/05-race-engineer.png) |
```

---

## Arquitectura

```text
OpenF1 REST API
    |
    v
FastAPI backend
    - httpx AsyncClient
    - file cache por endpoint y sesion
    - retry / fallback / stale cache
    - RaceTimeline canonico por vuelta
    |
    +--> pace_service        -> TruePaceRow[]
    +--> tyre_service        -> TyreDegradationRow[]
    +--> pit_service         -> PitImpactRow[]
    +--> chaos_service       -> ChaosIndex
    +--> weather_service     -> WeatherAnalysis
    +--> drs_service         -> DRSAnalysisAggregated
    +--> crossover_service   -> CrossoverWindow[]
    +--> race_phase_service  -> RacePhase[]
    +--> race_dna_service    -> RaceDNA
    +--> clean_air_service   -> CleanAirValue
    +--> telemetry_service   -> DriverTelemetry[]
    +--> notes_service       -> EngineerNote[]
    +--> decisions_service   -> RaceDecision[]
    |
    v
FullRaceAnalysis cacheado como _analysis.json
    |
    v
Next.js frontend
    - App Router
    - TypeScript strict
    - Zustand store
    - Tabs por dominio
    - Replay de telemetria
    - Radio overlay con IA
```

La decision central del backend es `RaceTimeline`: una representacion canonica por vuelta que evita que cada servicio resuelva timestamps de forma distinta.

---

## API

```text
GET  /health
GET  /races?year=2025
GET  /races/{meeting_key}/sessions
GET  /analysis/{session_key}
GET  /analysis/{session_key}?force_refresh=true
GET  /telemetry/{session_key}?drivers=VER,NOR,HAM
GET  /chat/health
POST /chat
POST /admin/clear-cache/{session_key}
```

Docs interactivas:

```text
http://localhost:8000/docs
```

---

## Sesiones Demo

| Race | Year | session_key | Ideal para mostrar |
|------|------|-------------|--------------------|
| Sao Paulo GP | 2024 | `9636` | caos extremo, lluvia, SC/VSC, weather crossovers, DRS trains |
| Spanish GP | 2024 | `9539` | carrera estrategica limpia, undercut, DRS, track position |
| Hungarian GP | 2024 | `9566` | degradacion y tyre cliff |
| United States GP | 2024 | `9617` | pit data con `stop_duration` |

---

## Stack

**Backend**

- Python 3.11
- FastAPI
- Pydantic v2
- httpx
- Polars
- NumPy
- FastF1 opcional
- Ollama opcional

**Frontend**

- Next.js 14
- React
- TypeScript strict
- Tailwind CSS
- Framer Motion
- Zustand
- Recharts
- SVG custom para replay, G/G y canales de telemetria

**Datos**

- OpenF1 REST API
- cache local por sesion y endpoint
- fallback con cache para evitar caidas por errores temporales del proveedor

---

## Setup Local

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

Usar Node 20 para evitar incompatibilidades con Next 14:

```bash
export PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH"

cd frontend
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3001
```

Abrir:

```text
http://127.0.0.1:3001
```

---

## Build De Produccion Local

```bash
export PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH"

cd frontend
npm ci
npm run build
npm run start -- -H 127.0.0.1 -p 3001
```

Backend:

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Checks:

```bash
curl http://127.0.0.1:8000/health
curl -I http://127.0.0.1:3001/race/9636
```

---

## Demo Publica Y Despliegue

El siguiente paso para promocionar el proyecto es publicarlo con una arquitectura sencilla:

### Opcion Recomendada

- **Frontend**: Vercel.
- **Backend**: Render, Railway, Fly.io o similar.
- **Cache**: persistencia en disco del backend si el proveedor lo permite; si no, migrar cache a object storage o Redis.
- **LLM**: mantener Ollama opcional en local, o desactivar el chat en produccion si no hay servidor de modelo.

### Variables Necesarias

Frontend:

```text
NEXT_PUBLIC_API_URL=https://tu-backend-publico.com
```

Backend:

```text
OPENF1_BASE_URL=https://api.openf1.org/v1
CACHE_DIR=./cache
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.1:8b
CORS_ORIGINS=["https://tu-frontend.vercel.app"]
```

### Checklist Antes De Publicar

- Anadir screenshots en `docs/screenshots/`.
- Revisar CORS del backend para aceptar el dominio publico.
- Decidir si el chat IA estara activo o en modo offline.
- Probar `/analysis/9636` en backend desplegado.
- Probar `/telemetry/9636?drivers=VER,NOR,HAM`.
- Probar carga completa de `/race/9636` desde frontend publico.
- Anadir la URL publica al README cuando este desplegada.

---

## Licencia Y Uso

**Estado recomendado por ahora:** source-available, non-commercial, no resale.

La intencion del proyecto es que cualquiera pueda verlo, estudiarlo y usarlo como demo personal o educativa, pero no pueda copiarlo, revenderlo, publicarlo como producto propio o explotarlo comercialmente sin permiso.

Eso no encaja con una licencia open source clasica como MIT, Apache-2.0 o GPL, porque esas licencias permiten redistribucion y uso comercial bajo ciertas condiciones. Para este caso conviene una licencia **source-available** o una licencia personalizada.

Opciones razonables:

| Opcion | Encaja? | Comentario |
|--------|---------|------------|
| **Sin licencia / All Rights Reserved** | Alta proteccion, baja reutilizacion | Nadie tiene permiso explicito para usar, modificar o distribuir el codigo. GitHub permite verlo y forkearlo por sus terminos, pero no concede derecho amplio de uso. |
| **PolyForm Noncommercial** | Buena base | Permite usos no comerciales y prohibe explotacion comercial. Es mas adecuada para software que Creative Commons. |
| **Licencia propietaria personalizada** | Mas precisa | Permite definir exactamente: uso personal/educativo permitido, uso comercial prohibido, redistribucion prohibida, copia de producto prohibida. Conviene revisarla con abogado si el proyecto va a tener visibilidad. |
| **Business Source License** | Posible, pero menos ideal | Permite codigo visible con restricciones de produccion y cambio futuro a open source. Es mas pesada para un proyecto personal. |
| **Creative Commons BY-NC-ND** | Mejor para contenido que para codigo | Puede servir para screenshots, textos o assets, pero Creative Commons no recomienda sus licencias para software. |

Recomendacion practica para Pit Wall IQ:

1. Mantener el repositorio publico para portafolio y promocion.
2. Anadir un `LICENSE` personalizado o PolyForm Noncommercial.
3. Anadir en README una nota visible: "Commercial use, resale, hosted clones and redistribution are not permitted without written permission."
4. Separar, si hace falta, licencia de codigo y licencia de contenido visual/documentacion.

---

## Estado Del Proyecto

Pit Wall IQ ya tiene una base funcional potente:

- analisis estrategico completo;
- datos historicos cacheados;
- UI por dominios;
- telemetria visual;
- race engineer con IA;
- endpoints preparados para despliegue.

La siguiente fase es convertirlo en una demo publica estable y compartirlo con capturas bien escogidas.

---

## Disclaimer

Proyecto personal y no oficial. No esta afiliado, aprobado ni conectado con Formula 1, FIA, F1, Formula One Management ni ningun equipo. Los datos provienen de OpenF1, un proyecto comunitario no oficial. Los nombres de pilotos, equipos, circuitos y Grandes Premios se usan como informacion factual.
