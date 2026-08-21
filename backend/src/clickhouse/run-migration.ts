import { createClient } from "@clickhouse/client";
import { readFileSync } from "fs";
import "dotenv/config";

const client = createClient({
  url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
  database: process.env.CLICKHOUSE_DB ?? "default",
  username: process.env.CLICKHOUSE_USER ?? "default",
  password: process.env.CLICKHOUSE_PASSWORD ?? "",
});

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error("Usage: tsx run-migration.ts <path-to-sql-file>");
  process.exit(1);
}

async function main() {
  const sql = readFileSync(migrationFile, "utf-8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    console.log("[migration] running:", statement.slice(0, 80) + "...");
    await client.command({ query: statement });
  }

  console.log("[migration] done");
  await client.close();
}

main().catch((err) => {
  console.error("[migration] failed:", err);
  process.exit(1);
});