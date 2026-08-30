import { createClient } from "@clickhouse/client";
import dotenv from "dotenv";

dotenv.config();

export const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
  database: process.env.CLICKHOUSE_DB || "default",
  keep_alive: {
    enabled: true,
    idle_socket_ttl: 2500,
  },
});

export async function testClickhouseConnection(): Promise<boolean> {
  try {
    const result = await clickhouse.query({
      query: "SELECT 1",
      format: "JSONEachRow",
    });
    await result.json();
    return true;
  } catch (err) {
    console.error("ClickHouse connection failed:", err);
    return false;
  }
}