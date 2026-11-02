<div align="center">

# Pit Wall Engineer

### Mira la F1 como un ingeniero, no como un espectador.

**[pitwallengineer.com](https://pitwallengineer.com)** · **[Docs: gratis, PRO y modo live](https://pitwallengineer.com/docs)** · [Read in English](README.md)

![Python](https://img.shields.io/badge/Python-3.11-3776AB)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688)
![Next.js](https://img.shields.io/badge/Next.js-14-000000)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)
![Data](https://img.shields.io/badge/Data-OpenF1-555555)

</div>

---

## Qué es

Pit Wall Engineer convierte los datos de cronometraje en bruto de la Fórmula 1 en el análisis que ejecutaría un ingeniero de carrera: ritmo real, degradación de neumáticos, impacto de las paradas, fases de carrera, cruces de clima y reproducción de telemetría.

Durante una sesión, el modo Live aplica la misma mirada al feed en cuanto llega: tiempos y sectores, mapa de pista, datos del coche, neumáticos, dirección de carrera y radio de equipos.

Cada cifra lleva su confianza y el tamaño de la muestra que la respalda. Una lectura que todavía no se puede juzgar se etiqueta como tal, nunca se redondea hasta convertirla en certeza.

<p align="center">
  <img src="docs/img/readme-analysis.png" alt="Análisis de carrera: vista de estrategia" width="100%" />
</p>

---

## Principio de producto: confianza y tamaño de muestra

Un ranking construido con cuatro vueltas no es un ranking construido con cuarenta. El producto lo trata como una regla de diseño, no como una nota al pie.

- Los resultados de ritmo muestran en cuántas vueltas limpias se apoyan y llevan un nivel de confianza derivado de ese número.
- Las vueltas excluidas se registran con su motivo, de modo que cualquier ranking se puede auditar.
- Los cruces de clima que coinciden con un safety car se marcan y se rebajan, no se atribuyen solo a la elección de neumático.
- En modo Live, lo que solo existe con la bandera a cuadros, como el Chaos Index final, permanece vacío hasta entonces.
- Las señales de ventana de parada son mediciones con una confianza y una base declarada, nunca una vuelta de parada predicha.

---

## Módulos y la pregunta que responde cada uno

| Módulo | Pregunta estratégica |
|---|---|
| **True Pace** | ¿Quién fue realmente rápido una vez quitadas las vueltas de box, de safety car y los valores atípicos? |
| **Degradación de neumáticos** | ¿Dónde empezó a caer cada stint y con qué pendiente? |
| **Impacto de paradas** | ¿La parada ganó o perdió posiciones, y fue real el undercut? |
| **Fases de carrera** | ¿Qué estaba haciendo la carrera en cada vuelta: ordenándose, ventana de paradas, reinicio tras safety car, ataque final? |
| **Chaos Index** | ¿Cuán desordenada fue la carrera y en qué vuelta tocó su pico? |
| **Trenes de DRS** | ¿Cuándo hubo coches atascados en grupo y durante cuánto tiempo? |
| **Cruces de clima** | ¿Quién llegó pronto, a tiempo o tarde cuando cambió la pista? |
| **Valor del aire limpio** | ¿Cuánto valía rodar libre frente a rodar en tráfico? |
| **Reproducción de telemetría** | ¿En qué se diferenciaron los pilotos en velocidad, acelerador, freno y marcha en una vuelta? |
| **Dirección de carrera y radio** | ¿Qué dijeron los comisarios y el muro de boxes, y cuándo? |
| **Ingeniero IA** | ¿Qué dice esta carrera concreta sobre una duda que tengo? |

El modo Live añade una vista de sesión con ocho pestañas: **Timing**, **Pista y coche**, **Estrategia**, **Predicciones** (solo cuando el servidor live envía una proyección), **Dirección de carrera y radio**, **Gráficos de vueltas**, **Ingeniero IA** y **Feed**. Los libres y la clasificación tienen su propio perfil: mejores vueltas, colores de sector, tandas largas y estado de la sesión.

<p align="center">
  <img src="docs/img/readme-live.png" alt="Modo Live: tiempos, mapa de pista y datos del coche" width="100%" />
</p>

---

## Capturas

Generadas a partir de una carrera histórica publicada con [`scripts/readme_shots.py`](scripts/readme_shots.py).

| | |
|---|---|
| ![Análisis](docs/img/readme-analysis.png) | ![Live](docs/img/readme-live.png) |
| Análisis de carrera | Modo Live |
| ![Telemetría](docs/img/readme-telemetry.png) | ![Chaos](docs/img/readme-chaos.png) |
| Reproducción de telemetría | Chaos Index y fases de carrera |

---

## Arquitectura

```
OpenF1 (REST + MQTT)
  |
  |-- Analysis API (FastAPI, Render)
  |     async OpenF1 client (httpx, semaphore, retry)
  |     per-session JSON cache, immutable for past races
  |     RaceTimeline (one canonical object shared by every service)
  |     services: pace, tyre, pit, chaos, drs, weather, crossover,
  |               race phase, clean air, decisions, notes, DNA
  |     FastF1 telemetry, precomputed and served from cache
  |     AI chat: Ollama locally, Groq in production
  |
  |-- Recorder (Render, persistent disk)
  |     holds the MQTT subscription, writes the capture,
  |     archives finished captures to Cloudflare R2
  |
  |-- Live server (Render)
  |     second MQTT subscription, one snapshot, SSE to browsers
  |
Frontend (Next.js 14 on Netlify)
      historical analysis, Live mode, docs, access settings
```

- **Frontend:** Next.js 14 (App Router), TypeScript estricto, Tailwind, Framer Motion, Zustand, Recharts. Desplegado en Netlify.
- **Backend:** FastAPI, Pydantic v2, Polars, NumPy, httpx. Desplegado en Render.
- **Fuente:** OpenF1 para vueltas, stints, paradas, posición, intervalos, dirección de carrera, clima, pilotos y el feed MQTT en vivo. FastF1 para la telemetría de circuito.
- **Cloudflare R2:** almacenamiento compatible con S3 donde el recorder archiva las capturas live terminadas.
- **Por qué el recorder y el servidor live están separados:** un fallo en el visor nunca debe detener la grabación, y el MQTT de OpenF1 no tiene replay. Ver [docs/live-infrastructure.md](docs/live-infrastructure.md) y [docs/live-deployment.md](docs/live-deployment.md).
- **Publicación:** una GitHub Action publica cada carrera terminada en `backend/cache/` y un trabajo diario precalcula la telemetría. Un commit en `main` es un despliegue, por eso el blueprint de Render usa filtros de build. Ver [docs/DEPLOY.md](docs/DEPLOY.md).

---

## Planes

| | Temporadas | Incluye |
|---|---|---|
| **Free** | 2023 y 2024 | Análisis completo, todos los tipos de sesión, sin cuenta |
| **PRO** | 2025 en adelante y la temporada actual | Lo anterior más el modo Live, 2,99 EUR al mes cuando se abran las suscripciones |

Las suscripciones todavía no están abiertas. PRO está disponible con un código de acceso, que se introduce una vez en Ajustes. La puerta está en el backend: el navegador solo guarda un token firmado. Detalles en [pitwallengineer.com/docs](https://pitwallengineer.com/docs).

---

## Ejecutarlo en local

Requisitos: Python 3.11, Node.js 18 o superior. Ollama con `llama3.1:8b` es opcional y solo lo usa el chat con IA.

```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload    # http://localhost:8000
```

```bash
# Frontend
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                      # http://localhost:3000
```

Pruebas:

```bash
cd backend && pip install -r requirements-dev.txt && pytest
cd frontend && npm test
```

### Modo Live contra una grabación

```bash
cd backend
pip install -r requirements-live.txt
python scripts/live_server.py --replay 9636 --replay-speed 0.02
# o reproduce una captura grabada por el recorder:
python scripts/live_server.py --replay-capture <capture dir> --speed 60

cd ../frontend
NEXT_PUBLIC_LIVE_URL=http://localhost:8099 npm run dev
```

### Telemetría para otra sesión

```bash
cd backend
python scripts/precompute_telemetry.py --sessions <session_key> --drivers VER,NOR,LEC,PIA,RUS
```

---

## Variables de entorno

Solo nombres. Los valores reales van en los paneles de cada host, nunca en el repo. Plantillas: `backend/.env.example` y `frontend/.env.local.example`.

**Backend**

| Variable | Para qué sirve |
|---|---|
| `OPENF1_BASE_URL` | URL base REST de OpenF1 |
| `OPENF1_USERNAME`, `OPENF1_PASSWORD` | Cuenta de OpenF1, canjeada por un bearer token que se renueva |
| `OPENF1_API_TOKEN` | Token estático antiguo, se ignora si hay usuario y contraseña |
| `CACHE_DIR` | Dónde se guarda el JSON por sesión |
| `CORS_ORIGINS` | Orígenes de navegador permitidos |
| `ENVIRONMENT` | `development` o `production` |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Chat IA local |
| `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_REASONING_EFFORT` | Chat IA en producción |
| `FREE_SEASONS` | Temporadas abiertas a todos |
| `PRO_ACCESS_CODES`, `PRO_TOKEN_SECRET`, `PRO_TOKEN_TTL_DAYS` | Puerta PRO |
| `INTERNAL_BUILD_SECRET` | Permite a la Action de publicación calcular temporadas PRO |

**Recorder y servidor live**

| Variable | Para qué sirve |
|---|---|
| `CAPTURE_BUCKET`, `CAPTURE_ENDPOINT_URL`, `CAPTURE_REGION` | Archivo compatible con S3 (Cloudflare R2) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Credenciales de ese bucket |
| `LIVE_ALLOWED_ORIGINS` | Orígenes autorizados a abrir el stream live |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Notificaciones operativas |

**Frontend**

| Variable | Para qué sirve |
|---|---|
| `NEXT_PUBLIC_API_URL` | API de análisis |
| `NEXT_PUBLIC_LIVE_URL` | Servidor live |
| `NEXT_PUBLIC_PW_BUILD` | Etiqueta de build |

---

## Datos y atribución

Los datos de sesión vienen de [OpenF1](https://openf1.org) y la telemetría de circuito de FastF1. El histórico empieza en 2023. Los clips de radio se enlazan desde el archivo oficial y nunca se copian ni se almacenan aquí.

## Licencia

MIT, ver [LICENSE](LICENSE).

**Proyecto no oficial. Sin afiliación con Formula 1, la FIA ni ningún equipo.** F1, FORMULA 1 y marcas relacionadas son marcas de Formula One Licensing B.V.
