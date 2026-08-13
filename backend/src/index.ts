import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { createServer } from "node:http";
import { testClickhouseConnection } from "./clickhouse/client";
import { attachWebSocketServer } from "./ws/server.js";
import { startOrchestrator } from "./agent/orchestrator.js";
import {
  getCurrentSnapshot,
  getAudienceTimeline,
  getRegionalBreakdown,
  getAnomaliesRelative,
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
    console.error("[api/snapshot] erreur:", err);
    res.status(500).json({ error: "Impossible de récupérer le snapshot" });
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
    console.error("[api/timeline] erreur:", err);
    res.status(500).json({ error: "Impossible de récupérer la timeline" });
  }
});

app.get("/api/regional/:titleId", async (req, res) => {
  try {
    const { titleId } = req.params;
    const windowMinutes = req.query.windowMinutes ? Number(req.query.windowMinutes) : undefined;
    const data = await getRegionalBreakdown(titleId, windowMinutes);
    res.json(data);
  } catch (err) {
    console.error("[api/regional] erreur:", err);
    res.status(500).json({ error: "Impossible de récupérer le breakdown régional" });
  }
});

app.get("/api/anomalies", async (req, res) => {
  try {
    const deviationThreshold = req.query.deviationThreshold ? Number(req.query.deviationThreshold) : undefined;
    const data = await getAnomaliesRelative(deviationThreshold);
    res.json(data);
  } catch (err) {
    console.error("[api/anomalies] erreur:", err);
    res.status(500).json({ error: "Impossible de récupérer les anomalies" });
  }
});

const PORT = process.env.PORT || 3001;
const httpServer = createServer(app);
attachWebSocketServer(httpServer);

startOrchestrator();

httpServer.listen(PORT, () => {
  console.log(`Aurora backend running on port ${PORT}`);
});