import { clickhouse } from "../clickhouse/client.js";
import { askGemini, askGeminiJSON } from "./gemini.js";

// Schéma décrit en langage naturel pour guider la génération SQL.
// Ne couvre QUE la table agrégée en lecture — jamais audience_events brute,
// pour limiter la surface et garder des requêtes rapides.
const SCHEMA_DESCRIPTION = `
Table ClickHouse: audience_stats_agg (AggregatingMergeTree)
Colonnes:
  - minute (DateTime) — timestamp arrondi à la minute
  - title_id (String) — ex: "aurora-01" à "aurora-06"
  - title_name (String) — ex: "Nightfall Protocol"
  - region (String) — une de: NA, EU, WA, SA, APAC
  - viewer_count (AggregateFunction(count, UInt8)) — utiliser countMerge(viewer_count)
  - drop_off_count (AggregateFunction(sum, UInt8)) — utiliser sumMerge(drop_off_count)
  - avg_seconds_watched (AggregateFunction(avg, UInt32)) — utiliser avgMerge(avg_seconds_watched)

Règles impératives:
  - Les colonnes AggregateFunction DOIVENT être lues avec leur fonction *Merge correspondante
    (countMerge, sumMerge, avgMerge), jamais utilisées brutes.
  - Ne jamais réutiliser un nom de colonne source comme alias dans le même SELECT
    (ex: ne pas faire "sumMerge(drop_off_count) AS drop_off_count").
  - Toujours GROUP BY les colonnes non agrégées utilisées dans le SELECT.
  - Limiter les résultats avec LIMIT 50 sauf si la question implique un agrégat unique.
  - Utiliser des paramètres relatifs au temps du type "now() - INTERVAL N MINUTE".
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
 * Rejette tout ce qui n'est pas un SELECT en lecture seule.
 * Vérifie aussi qu'aucun mot-clé destructeur ne se cache dans une sous-requête
 * ou un commentaire (le LLM ne devrait jamais en générer, mais on ne fait pas confiance).
 */
function validateReadOnlySql(sql: string): void {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  const upper = trimmed.toUpperCase();

  if (!upper.startsWith("SELECT") && !upper.startsWith("WITH")) {
    throw new Error("Requête rejetée: doit commencer par SELECT ou WITH");
  }

  for (const keyword of FORBIDDEN_KEYWORDS) {
    // \b évite de bloquer un mot qui contiendrait le keyword par hasard (ex: "created_at")
    const pattern = new RegExp(`\\b${keyword}\\b`, "i");
    if (pattern.test(upper)) {
      throw new Error(`Requête rejetée: mot-clé interdit détecté (${keyword})`);
    }
  }

  if (trimmed.includes(";")) {
    throw new Error("Requête rejetée: plusieurs instructions détectées");
  }
}

async function generateSql(question: string): Promise<SqlGenerationResult> {
  const prompt = `
Tu es un générateur de requêtes ClickHouse en lecture seule pour un dashboard d'audience streaming.

${SCHEMA_DESCRIPTION}

Question de l'utilisateur: "${question}"

Génère UNE seule requête SQL ClickHouse valide qui répond à cette question, en respectant strictement les règles ci-dessus.
`;

  const schema = {
    type: "object",
    properties: {
      sql: { type: "string", description: "La requête SQL ClickHouse, sans point-virgule final" },
      explanation: { type: "string", description: "Explication courte en français de ce que fait la requête" },
    },
    required: ["sql", "explanation"],
  };

  return askGeminiJSON<SqlGenerationResult>(prompt, schema);
}

async function interpretResults(question: string, rows: unknown[]): Promise<string> {
  const prompt = `
L'utilisateur a demandé: "${question}"

Voici le résultat de la requête ClickHouse (JSON):
${JSON.stringify(rows).slice(0, 4000)}

Réponds en français, en une ou deux phrases claires, directement à la question posée.
Si le résultat est vide, dis-le simplement (pas de donnée disponible pour cette période/ce filtre).
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
 * Point d'entrée principal: question en langage naturel -> SQL généré,
 * validé, exécuté, résultat interprété.
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