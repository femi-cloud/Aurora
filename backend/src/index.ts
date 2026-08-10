import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { testClickhouseConnection } from "./clickhouse/client";

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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Aurora backend running on port ${PORT}`);
});