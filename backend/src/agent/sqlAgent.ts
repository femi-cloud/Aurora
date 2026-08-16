import { clickhouse } from "../clickhouse/client.js";
import { askGemini, askGeminiJSON } from "./gemini.js";

// Schema described in natural language to guide SQL generation.
// Only covers the aggregated read table — never raw audience_events,
// to limit scope and keep queries fast.
const SCHEMA_DESCRIPTION = `
ClickHouse table: audience_stats_agg (AggregatingMergeTree)
Columns:
  - minute (DateTime) — timestamp rounded to the minute
  - title_id (String) — e.g. "aurora-01" to "aurora-06"
  - title_name (String) — e.g. "Nightfall Protocol"
  - region (String) — one of: NA, EU, WA, SA, APAC
  - viewer_count (AggregateFunction(count, UInt8)) — use countMerge(viewer_count)
  - drop_off_count (AggregateFunction(sum, UInt8)) — use sumMerge(drop_off_count)
  - avg_seconds_watched (AggregateFunction(avg, UInt32)) — use avgMerge(avg_seconds_watched)

Mandatory rules:
  - AggregateFunction columns MUST be read with their corresponding *Merge function
    (countMerge, sumMerge, avgMerge), never used raw.
  - Never reuse a source column name as an alias in the same SELECT
    (e.g. don't do "sumMerge(drop_off_count) AS drop_off_count").
  - Always GROUP BY the non-aggregated columns used in the SELECT.
  - Limit results with LIMIT 50 unless the question implies a single aggregate.
  - Use time-relative parameters like "now() - INTERVAL N MINUTE".
`;

interface SqlGenerationResult {
  sql: string;
  explanation: string;
}

const FORBIDDEN_KEYWORDS = [
  "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE",
  "CREATE", "RENAME", "GRANT", "REVOKE", "ATTACH", "DETACH",
  "KILL", "OPTIMIZE", "SYSTEM",
];

/**
 * Rejects anything that isn't a read-only SELECT.
 * Also checks that no destructive keyword is hiding in a subquery
 * or comment (the LLM should never generate one, but we don't trust it).
 */
function validateReadOnlySql(sql: string): void {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  const upper = trimmed.toUpperCase();

  if (!upper.startsWith("SELECT") && !upper.startsWith("WITH")) {
    throw new Error("Query rejected: must start with SELECT or WITH");
  }

  for (const keyword of FORBIDDEN_KEYWORDS) {
    // \b avoids blocking a word that happens to contain the keyword (e.g. "created_at")
    const pattern = new RegExp(`\\b${keyword}\\b`, "i");
    if (pattern.test(upper)) {
      throw new Error(`Query rejected: forbidden keyword detected (${keyword})`);
    }
  }

  if (trimmed.includes(";")) {
    throw new Error("Query rejected: multiple statements detected");
  }
}

async function generateSql(question: string): Promise<SqlGenerationResult> {
  const prompt = `
You are a read-only ClickHouse query generator for a streaming audience dashboard.

${SCHEMA_DESCRIPTION}

User question: "${question}"

Generate ONE single valid ClickHouse SQL query that answers this question, strictly following the rules above.
`;

  const schema = {
    type: "object",
    properties: {
      sql: { type: "string", description: "The ClickHouse SQL query, without a trailing semicolon" },
      explanation: { type: "string", description: "Short explanation in English of what the query does" },
    },
    required: ["sql", "explanation"],
  };

  return askGeminiJSON<SqlGenerationResult>(prompt, schema);
}

async function interpretResults(question: string, rows: unknown[]): Promise<string> {
  const prompt = `
The user asked: "${question}"

Here is the result of the ClickHouse query (JSON):
${JSON.stringify(rows).slice(0, 4000)}

Answer in English, in one or two clear sentences, directly addressing the question asked.
If the result is empty, say so simply (no data available for this period/filter).
`;

  return askGemini(prompt);
}

export interface NaturalQueryResult {
  question: string;
  sql: string;
  explanation: string;
  rows: unknown[];
  answer: string;
}

/**
 * Main entry point: natural language question -> SQL generated,
 * validated, executed, result interpreted.
 */
export async function runNaturalQuery(question: string): Promise<NaturalQueryResult> {
  const { sql, explanation } = await generateSql(question);

  validateReadOnlySql(sql);

  const resultSet = await clickhouse.query({
    query: sql,
    format: "JSONEachRow",
  });
  const rows = (await resultSet.json()) as unknown[];

  const answer = await interpretResults(question, rows);

  return { question, sql, explanation, rows, answer };
}