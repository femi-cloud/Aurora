import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { createServer } from "node:http";
import { testClickhouseConnection } from "./clickhouse/client";
import { getAnomalyLog } from "./clickhouse/anomalyEvents.js";
import { attachWebSocketServer } from "./ws/server.js";
import { startOrchestrator, getDecisions, getSettings, updateSettings } from "./agent/orchestrator.js";
import type { AgentSettings } from "./clickhouse/settings.js";
import { getDecisionHistory } from "./clickhouse/decisions.js";
import { runNaturalQuery } from "./agent/sqlAgent.js";
import {
  getCurrentSnapshot,
  getAudienceTimeline,
  getRegionalBreakdown,
  getAnomaliesRelative,
  getTitleMetadata,
} from "./clickhouse/queries";

dotenv.config();

const app = express();
const allowedOrigins = [
  /^http:\/\/localhost:\d+$/,
  "https://aurora-frontend-ten.vercel.app",
];

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/health/clickhouse", async (req, res) => {
  const connected = await testClickhouseConnection();
  if (connected) {
    res.json({ status: "ok", clickhouse: "connected" });
  } else {
    res.status(500).json({ status: "error", clickhouse: "unreachable" });
  }
});

app.get("/api/snapshot", async (req, res) => {
  try {
    const windowMinutes = req.query.windowMinutes ? Number(req.query.windowMinutes) : undefined;
    const data = await getCurrentSnapshot(windowMinutes);
    res.json(data);
  } catch (err) {
    console.error("[api/snapshot] error:", err);
    res.status(500).json({ error: "Unable to fetch snapshot" });
  }
});

app.get("/api/timeline", async (req, res) => {
  try {
    const titleId = req.query.titleId as string | undefined;
    const region = req.query.region as string | undefined;
    const windowMinutes = req.query.windowMinutes ? Number(req.query.windowMinutes) : undefined;
    const data = await getAudienceTimeline(titleId, region, windowMinutes);
    res.json(data);
  } catch (err) {
    console.error("[api/timeline] error:", err);
    res.status(500).json({ error: "Unable to fetch timeline" });
  }
});

app.get("/api/regional/:titleId", async (req, res) => {
  try {
    const { titleId } = req.params;
    const windowMinutes = req.query.windowMinutes ? Number(req.query.windowMinutes) : undefined;
    const data = await getRegionalBreakdown(titleId, windowMinutes);
    res.json(data);
  } catch (err) {
    console.error("[api/regional] error:", err);
    res.status(500).json({ error: "Unable to fetch regional breakdown" });
  }
});

app.get("/api/anomalies", async (req, res) => {
  try {
    const deviationThreshold = req.query.deviationThreshold ? Number(req.query.deviationThreshold) : undefined;
    const data = await getAnomaliesRelative(deviationThreshold);
    res.json(data);
  } catch (err) {
    console.error("[api/anomalies] error:", err);
    res.status(500).json({ error: "Unable to fetch anomalies" });
  }
});

app.get("/api/anomalies/log", async (req, res) => {
  try {
    const data = await getAnomalyLog();
    res.json(data);
  } catch (err) {
    console.error("[api/anomalies/log] error:", err);
    res.status(500).json({ error: "Unable to fetch anomaly log" });
  }
});

app.get("/api/titles", async (req, res) => {
  try {
    const data = await getTitleMetadata();
    res.json(data);
  } catch (err) {
    console.error("[api/titles] error:", err);
    res.status(500).json({ error: "Unable to fetch title metadata" });
  }
});

app.get("/api/predict/dropoff", async (req, res) => {
  try {
    const { titleId, region, device } = req.query;
    const params = new URLSearchParams({
      title_id: titleId as string,
      region: region as string,
      device: (device as string) ?? "unknown",
    });
    const mlResponse = await fetch(`${process.env.ML_SERVICE_URL}/predict/dropoff?${params}`);
    const data = await mlResponse.json();
    res.json(data);
  } catch (err) {
    console.error("[api/predict/dropoff] error:", err);
    res.status(500).json({ error: "Unable to fetch prediction" });
  }
});

app.post("/api/query/natural", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "The 'question' field is required" });
    }
    const result = await runNaturalQuery(question);
    res.json(result);
  } catch (err) {
    console.error("[api/query/natural] error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.get("/api/decisions", (req, res) => {
  try {
    res.json(getDecisions());
  } catch (err) {
    console.error("[api/decisions] error:", err);
    res.status(500).json({ error: "Unable to fetch decisions" });
  }
});

const SETTINGS_FIELDS = [
  "anomalyScoreThreshold",
  "deviationThreshold",
  "baselineWindowMinutes",
  "recentWindowMinutes",
  "minViewers",
] as const;

app.get("/api/settings", (req, res) => {
  try {
    res.json(getSettings());
  } catch (err) {
    console.error("[api/settings] error:", err);
    res.status(500).json({ error: "Unable to fetch settings" });
  }
});

app.put("/api/settings", (req, res) => {
  try {
    const body = req.body ?? {};
    const errors: string[] = [];

    for (const field of SETTINGS_FIELDS) {
      const value = body[field];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        errors.push(`${field} must be a non-negative number`);
      }
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: "Invalid settings", details: errors });
    }

    const next: AgentSettings = {
      anomalyScoreThreshold: body.anomalyScoreThreshold,
      deviationThreshold: body.deviationThreshold,
      baselineWindowMinutes: body.baselineWindowMinutes,
      recentWindowMinutes: body.recentWindowMinutes,
      minViewers: body.minViewers,
    };

    updateSettings(next);
    res.json(next);
  } catch (err) {
    console.error("[api/settings PUT] error:", err);
    res.status(500).json({ error: "Unable to update settings" });
  }
});

const VALID_STATUSES = new Set(["pending", "accepted", "rejected"]);
const MAX_HISTORY_LIMIT = 100;

app.get("/api/decisions/history", async (req, res) => {
  try {
    const rawStatus = req.query.status as string | undefined;
    if (rawStatus && !VALID_STATUSES.has(rawStatus)) {
      return res.status(400).json({ error: `Invalid status: ${rawStatus}` });
    }

    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_HISTORY_LIMIT)
      : 20;

    const rawOffset = Number(req.query.offset);
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

    const titleId = req.query.titleId as string | undefined;

    const result = await getDecisionHistory({
      status: rawStatus as "pending" | "accepted" | "rejected" | undefined,
      titleId,
      limit,
      offset,
    });
    res.json(result);
  } catch (err) {
    console.error("[api/decisions/history] error:", err);
    res.status(500).json({ error: "Unable to fetch decision history" });
  }
});

const PORT = process.env.PORT || 3001;
const httpServer = createServer(app);
attachWebSocketServer(httpServer);

startOrchestrator();

httpServer.listen(PORT, () => {
  console.log(`Aurora backend running on port ${PORT}`);
});