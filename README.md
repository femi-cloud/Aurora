# Aurora

An agent that watches live audience data and surfaces production/distribution decisions before a human finishes reading the first graph.

Built for **[Agentic Cinema: The Blockbuster Hackathon](https://devpost.com)** (Google Cloud + partner ecosystem) — submitted under the **ClickHouse** partner track.

<!--
  TODO(you): drop a hero screenshot or short GIF of the dashboard right here, e.g.
  ![Aurora dashboard](docs/screenshots/hero.png)
-->

---

## Table of contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Features](#features)
- [Screenshots](#screenshots)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [Demo](#demo)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## Overview

Aurora is a real-time audience analytics control room for a streaming catalog. It watches viewer behavior as it happens, flags anomalies the moment they emerge, and hands an autonomous agent (Gemini, on Google Cloud) the context it needs to recommend a production or distribution decision — before a human would even finish reading the underlying chart.

Under the hood, every viewing event lands in **ClickHouse** through a live ingestion pipeline (not a static fixture or a nightly batch): a `MergeTree` table for raw events, an `AggregatingMergeTree` fed continuously by a materialized view, and an agent loop that reads those aggregates every 45 seconds to decide whether Gemini should weigh in. Each decision is built through an explicit, deterministic multi-step reasoning trail (anomaly detected → regional context → drop-off prediction → decision), and persisted to ClickHouse so the decision history survives a backend restart.

Beyond the 2D control room, Aurora also ships **The Screening Room** — an alternative 3D view where each title is rendered as a glowing sphere in an orbiting "atom"-style layout, and the agent itself is embodied in the scene: it drifts toward whichever title it's currently evaluating and surfaces its finding right there, with one-click accept/reject. Clicking any title's poster — in 2D or in 3D — opens a dedicated detail page with that title's timeline, regional breakdown, and decision history.

## Architecture

```mermaid
flowchart TD
    SIM["Event simulator<br/><small>synthetic viewing events, ~every 10s</small>"]
    CH[("ClickHouse<br/><small>raw events + live aggregation + decision history</small>")]
    MCP["mcp-clickhouse<br/><small>official ClickHouse MCP server</small>"]
    API["REST API<br/><small>Express — polled every 5s</small>"]
    ORCH["Orchestrator<br/><small>builds signals, triggers Gemini every 45s</small>"]
    SQL["SQL agent<br/><small>natural language → SQL → ClickHouse</small>"]
    ML["ml-service<br/><small>FastAPI — IsolationForest + XGBoost</small>"]
    GEMINI["Gemini"]
    WS["WebSocket<br/><small>pushes decisions live</small>"]
    FE["Frontend dashboard<br/><small>React + Vite — 2D control room + 3D Screening Room + title detail pages</small>"]

    SIM --> CH
    CH --> API --> FE
    ORCH -->|"snapshot + anomalies"| MCP --> CH
    CH --> ORCH
    ORCH <--> ML
    ORCH --> GEMINI --> WS --> FE
    ORCH --> CH
    CH --> SQL --> FE
```

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, TypeScript, Tailwind v4, shadcn/ui, Recharts, Three.js (react-three-fiber + drei), React Router |
| Backend | Express, TypeScript (NodeNext), WebSocket (`ws`) |
| Data store | **ClickHouse** (MergeTree + AggregatingMergeTree + materialized view) |
| Data access (partial) | [ClickHouse MCP server](https://github.com/ClickHouse/mcp-clickhouse) — official `mcp-clickhouse`, HTTP/SSE transport |
| ML service | FastAPI (Python), IsolationForest, XGBoost |
| Agent | Google Gemini (Gemini Enterprise) |

## Features

- **Live signal timeline** — viewer count and drop-off rate per title, refreshed every 5s
- **Regional breakdown** — per-region viewership and drop-off, filterable by title
- **Anomaly detection** — dual detector (relative baseline + IsolationForest), with detection and resolution timestamps, filterable by title/region
- **Agent recommendations** — Gemini-generated decisions (prioritize dubbing, recut scene, boost market, monitor), each backed by a visible 4-step reasoning trail (anomaly detected, regional context, drop-off prediction, decision), actionable in one click (accept/reject), pushed live over WebSocket and persisted to ClickHouse so history survives a restart
- **Decision history** — paginated, filterable (by status and/or title) view of every past agent decision, backed by ClickHouse
- **Title detail page** — a dedicated deep-dive per title (`/titles/:id`), reachable from the dashboard or by clicking a poster in the 3D scene: timeline, regional breakdown, and decision history all scoped to that one title
- **The Screening Room (3D mode)** — an immersive alternative view: each title rendered as a glowing sphere in an orbiting layout, sized by viewer count and colored by anomaly state, with real movie posters floating above as cards. An embodied agent orb drifts to whichever title Gemini is currently evaluating and surfaces its finding — with accept/reject actions — directly in the scene. Clicking a poster opens that title's detail page.
- **Natural language queries** — ask a question in plain language, get a generated (read-only, validated) SQL query against ClickHouse plus a plain-language answer
- **Drop-off prediction simulator** — XGBoost-backed prediction for a given title/region/device combination
- **Snapshot detail view** — paginated grid of every title/region pair, with a radial drop-off gauge, filterable by time window

## Screenshots

<!--
  TODO(you): add screenshots/GIFs for each major section. Suggested shots:
  - Full dashboard, light and dark mode
  - Signal + Detection (Timeline, Regional Breakdown, Anomalies)
  - Decision (Agent recommendations panel, mid-accept)
  - Explore (Natural Query + Drop-off predictor)
  - Detail (Snapshot grid with pagination)
  - Decision history page
  - Title detail page
  - The Screening Room (3D mode, agent orb mid-decision with the overlay open)

  ![Signal & Detection](docs/screenshots/signal-detection.png)
  ![Decision](docs/screenshots/decision.png)
  ![Explore & Detail](docs/screenshots/explore-detail.png)
  ![Title detail](docs/screenshots/title-detail.png)
  ![The Screening Room](docs/screenshots/screening-room.png)
-->

## Getting started

### Prerequisites

- Node.js 18+
- Python 3.x (for `ml-service`)
- A running ClickHouse instance (local via Docker, or hosted — we use ClickHouse Cloud)
- A Gemini API key (Google AI Studio or Vertex AI)
- A TMDB API key, used to fetch real poster art and titles for the 20 pinned demo titles (optional — falls back to fictional titles/no posters if unset). Note: only the original 6 titles have a reliable XGBoost drop-off prediction so far — the model isn't retrained on the other 14 yet.
- The official ClickHouse MCP server (`mcp-clickhouse`) running in HTTP/SSE mode, pointed at the same ClickHouse instance — see [ClickHouse/mcp-clickhouse](https://github.com/ClickHouse/mcp-clickhouse)

### Environment variables

Create a `.env` file in `backend/` (see `.env.example`):

```env
PORT=3000
CLICKHOUSE_URL=https://your-instance.clickhouse.cloud:8443
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DB=aurora
ML_SERVICE_URL=http://localhost:8000
ORCHESTRATOR_INTERVAL_MS=45000
ANOMALY_SCORE_THRESHOLD=0.5
GEMINI_API_KEY=
TMDB_API_KEY=
MCP_CLICKHOUSE_URL=http://localhost:8001/mcp
MCP_CLICKHOUSE_AUTH_TOKEN=
```

### Database setup

```bash
# apply the schema (raw events table, aggregate table, materialized view)
clickhouse-client < infra/clickhouse/init/001_schema.sql
clickhouse-client < infra/clickhouse/init/002_add_poster_url.sql
clickhouse-client < infra/clickhouse/init/003_agent_decisions.sql
clickhouse-client < infra/clickhouse/init/004_titles_metadata.sql
```

### Run it

```bash
# 0. ClickHouse MCP server (required for getCurrentSnapshot/getAnomaliesRelative)
cd mcp-clickhouse
pip install mcp-clickhouse
# loads CLICKHOUSE_HOST/PORT/USER/PASSWORD + CLICKHOUSE_MCP_* from .env
mcp-clickhouse

# 1. backend + event simulator (run together via concurrently)
cd backend
npm install
npm run dev

# 2. ml-service
cd ml-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 3. frontend
cd frontend
npm install
npm run dev
```

`npm run dev` in `backend/` starts both the Express server and the synthetic event simulator (`src/simulator/eventGenerator.ts`) side by side — no separate step needed. Run `npm run simulate` on its own if you ever want the simulator without the server.

## Project structure
```
Aurora/
├── backend/ Express + TS (NodeNext)
│ ├── src/
│ │ ├── index.ts API routes (snapshot, timeline, regional, anomalies, titles, predict, query/natural, decisions, decisions/history)
│ │ ├── clickhouse/
│ ├── client.ts ClickHouse connection (still used by decisions.ts/anomalyEvents.ts/settings.ts writes)
│ ├── queries.ts getCurrentSnapshot, getAudienceTimeline, getRegionalBreakdown, getAnomaliesRelative, getTitleMetadata — all five via the ClickHouse MCP server (mcpClient.ts)
│ │ │ ├── mcpClient.ts MCP client — runSelectQuery() via the official ClickHouse MCP server
│ │ │ ├── decisions.ts persistDecisionSnapshot, loadLatestDecisions, getDecisionHistory (agent_decisions table)
│ │ │ └── run-migration.ts one-off script to run .sql files via the Node client
│ │ ├── agent/
│ │ │ ├── orchestrator.ts 45s cycle — builds signals, decides when to call Gemini, exposes getDecisions()
│ │ │ ├── decisionEngine.ts generates AgentDecision objects with a 4-step reasoning trail
│ │ │ ├── gemini.ts Gemini client , per-model throttling
│ │ │ ├── sqlAgent.ts natural language → SQL → ClickHouse → plain-language answer
│ │ │ └── simulator/
│ │ │ └── eventGenerator.ts synthetic event simulator, TMDB-backed titles/posters, live insert into ClickHouse
│ │ └── ws/server.ts WebSocket — broadcastDecision, onClientAction
│ └── .env Gemini/TMDB keys, ClickHouse credentials
├── ml-service/ FastAPI (Python), port 8000
│ └── app/ anomaly.py (IsolationForest), dropoff_model.py (XGBoost), queries.py, clickhouse_client.py, config.py, main.py
├── mcp-clickhouse/ Official ClickHouse MCP server (HTTP/SSE), separate process
│ └── .env CLICKHOUSE_HOST/PORT/USER/PASSWORD + CLICKHOUSE_MCP_SERVER_TRANSPORT/BIND_HOST/BIND_PORT
├── frontend/ Vite + React, Tailwind v4 + shadcn/ui
│ └── src/
│ ├── App.tsx layout, header, 2D/3D/History mode toggle
│ ├── index.css design tokens (light/dark/system)
│ ├── api/client.ts
│ ├── hooks/
│ │ ├── useAgentSocket.ts
│ │ └── useTitles.ts shared title catalog (GET /api/titles), used by every title selector
│ ├── types/audience.ts
│ └── components/
│ ├── ThemeSwitch.tsx
│ ├── RadialGauge.tsx
│ ├── Timeline.tsx
│ ├── RegionalBreakdown.tsx
│ ├── Anomalies.tsx
│ ├── RecommendationsPanel.tsx
│ ├── NaturalQuery.tsx
│ ├── DropoffPredictor.tsx
│ ├── Snapshot.tsx
│ ├── DecisionCard.tsx single decision card, shared by RecommendationsPanel and DecisionHistory
│ ├── DecisionHistory.tsx paginated/filterable decision log, optionally scoped to one title
│ ├── TitleDetail.tsx per-title page (/titles/:id) — timeline, regional breakdown, decision history
│ ├── MarqueeLights.tsx
│ ├── MarqueeTicker.tsx
│ └── Scene3D.tsx The Screening Room — 3D scene (spheres, camera, posters, agent orb, click-to-navigate to title detail)
├── packages/shared/src/types.ts AgentDecision, DecisionStep, and other shared types
├── infra/clickhouse/init/ 001_schema.sql, 002_add_poster_url.sql, 003_agent_decisions.sql, 004_titles_metadata.sql
├── docker-compose.yml
├── LICENSE
└── README.md

```


## Demo



## License

MIT

## Acknowledgments

- [Google Gemini](https://ai.google.dev/) — decision-making agent
- [ClickHouse](https://clickhouse.com/) — real-time event ingestion, aggregation, and decision persistence
- [TMDB](https://www.themoviedb.org/) — real movie titles and poster art for the demo catalog