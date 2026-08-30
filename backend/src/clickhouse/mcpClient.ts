import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = process.env.MCP_CLICKHOUSE_URL;
const MCP_AUTH_TOKEN = process.env.MCP_CLICKHOUSE_AUTH_TOKEN;

if (!MCP_URL) {
  throw new Error("MCP_CLICKHOUSE_URL is not set");
}

let clientPromise: Promise<Client> | null = null;


export function toSafeInt(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`Invalid integer parameter: ${value}`);
  }
  return n;
}

export function toSafeFloat(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid float parameter: ${value}`);
  }
  return n;
}

export async function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const transport = new StreamableHTTPClientTransport(new URL(MCP_URL as string), {
        requestInit: {
          headers: MCP_AUTH_TOKEN
            ? { Authorization: `Bearer ${MCP_AUTH_TOKEN}` }
            : {},
        },
      });

      const client = new Client(
        { name: "aurora-backend", version: "1.0.0" },
        { capabilities: {} }
      );

      await client.connect(transport);
      return client;
    })().catch((err) => {
      // reset so a future call can retry the connection instead of
      // permanently caching a rejected promise
      clientPromise = null;
      throw err;
    });
  }

  return clientPromise;
}

export async function runSelectQuery(sql: string): Promise<any[]> {
  const client = await getClient();

  const result = await client.callTool({
    name: "run_query",
    arguments: { query: sql },
  });

  if (result.isError) {
    const message =
      Array.isArray(result.content) && result.content[0]?.type === "text"
        ? result.content[0].text
        : "Unknown MCP tool error";
    throw new Error(`run_query failed: ${message}`);
  }

  let raw: string;

  const structured = (result as any).structuredContent;
  if (structured && typeof structured.result === "string") {
    raw = structured.result;
  } else {
    const content = result.content;
    if (!Array.isArray(content) || content.length === 0) {
      return [];
    }
    const textBlock = content.find((c: any) => c.type === "text");
    if (!textBlock) {
      throw new Error("run_query returned no text content block");
    }
    const outer = JSON.parse(textBlock.text);
    raw = typeof outer === "string" ? outer : outer.result;
  }

  const parsed = JSON.parse(raw);

  // run_query returns a tabular shape: { columns: string[], rows: any[][] }.
  // Convert to an array of row objects to match the JSONEachRow shape the
  // rest of the codebase (queries.ts callers, decisionEngine, etc.) expects.
  if (parsed && Array.isArray(parsed.columns) && Array.isArray(parsed.rows)) {
    const { columns, rows } = parsed as { columns: string[]; rows: any[][] };
    return rows.map((row) =>
      Object.fromEntries(columns.map((col, i) => [col, row[i]]))
    );
  }

  // Fallback in case a future version returns something already row-shaped.
  return Array.isArray(parsed) ? parsed : [parsed];
}