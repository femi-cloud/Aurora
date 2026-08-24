import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { createServer } from "node:http";
import { testClickhouseConnection } from "./clickhouse/client";
import { attachWebSocketServer } from "./ws/server.js";
import { startOrchestrator, getDecisions } from "./agent/orchestrator.js";
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
app.use(cors());
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

const PORT = process.env.PORT || 3001;
const httpServer = createServer(app);
attachWebSocketServer(httpServer);

startOrchestrator();

httpServer.listen(PORT, () => {
  console.log(`Aurora backend running on port ${PORT}`);
});