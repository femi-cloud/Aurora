import { createClient } from "@clickhouse/client";
import "dotenv/config";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";
const CLICKHOUSE_DB = process.env.CLICKHOUSE_DB ?? "default";
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER ?? "default";
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD ?? "";

const BATCH_INTERVAL_MS = 2000; // un batch toutes les 2s
const MIN_EVENTS_PER_BATCH = 5;
const MAX_EVENTS_PER_BATCH = 20;
const ANOMALY_EVERY_N_BATCHES = 30; // ~1 anomalie par minute à 2s/batch

// Titres fictifs (id, nom, "santé" de base : plus haut = moins de drop-off)
const TITLES = [
  { id: "aurora-01", name: "Nightfall Protocol", baseline: 0.85 },
  { id: "aurora-02", name: "The Last Reel", baseline: 0.7 },
  { id: "aurora-03", name: "Glass Horizon", baseline: 0.6 },
  { id: "aurora-04", name: "Static Bloom", baseline: 0.75 },
  { id: "aurora-05", name: "Echo Chamber", baseline: 0.5 },
  { id: "aurora-06", name: "Paper Moons", baseline: 0.65 },
];

const REGIONS = ["NA", "EU", "WA", "SA", "APAC"];
const DEVICES = ["mobile", "desktop", "tv", "tablet"];

const TITLE_RUNTIME_SECONDS = 5400; // ~90 min, pour borner seconds_watched

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

interface AudienceEvent {
  event_time: string;
  title_id: string;
  title_name: string; 
  region: string;
  seconds_watched: number;
  drop_off: 0 | 1;
  device: string;
  is_anomaly: 0 | 1;
}

type AnomalyType = "dropoff" | "spike" | "regional";

function pickAnomalyType(): AnomalyType {
  const roll = Math.random();
  if (roll < 0.5) return "dropoff";
  if (roll < 0.8) return "spike";
  return "regional";
}

/**
 * Génère un événement pour un titre donné.
 * Si `forceAnomaly` est vrai, le taux de drop-off est anormalement élevé
 * pour simuler un incident détectable (ex: bug de sous-titres, buffering).
 */
function generateEvent(
  title: (typeof TITLES)[number],
  anomalyType: AnomalyType | null,
  forcedRegion?: string
): AudienceEvent {
  const isAnomaly = anomalyType !== null;

  let dropOffProbability = 1 - title.baseline;
  if (anomalyType === "dropoff") dropOffProbability = 0.9;
  if (anomalyType === "spike") dropOffProbability = Math.max(0, (1 - title.baseline) - 0.4); // beaucoup moins de drop-off que d'habitude = signe d'engouement
  // "regional" garde le dropOffProbability normal du titre, l'anomalie ici est le VOLUME (géré dans generateBatch), pas le dropoff

  const dropOff = Math.random() < dropOffProbability ? 1 : 0;

  const secondsWatched = dropOff
    ? randomInt(10, Math.floor(TITLE_RUNTIME_SECONDS * 0.2))
    : randomInt(Math.floor(TITLE_RUNTIME_SECONDS * 0.6), TITLE_RUNTIME_SECONDS);

  return {
    event_time: new Date().toISOString().replace("T", " ").slice(0, 19),
    title_id: title.id,
    title_name: title.name,
    region: forcedRegion ?? randomChoice(REGIONS),
    seconds_watched: secondsWatched,
    drop_off: dropOff,
    device: randomChoice(DEVICES),
    is_anomaly: isAnomaly ? 1 : 0,
  };
}

function generateBatch(batchIndex: number): AudienceEvent[] {
  const isAnomalyBatch = batchIndex % ANOMALY_EVERY_N_BATCHES === 0;
  const anomalyType = isAnomalyBatch ? pickAnomalyType() : null;
  const anomalyTitle = isAnomalyBatch && anomalyType !== "regional" ? randomChoice(TITLES) : null;
  const anomalyRegion = isAnomalyBatch && anomalyType === "regional" ? randomChoice(REGIONS) : null;

  // "regional" génère plus d'events que la normale pour simuler un pic/creux de volume
  const baseCount = randomInt(MIN_EVENTS_PER_BATCH, MAX_EVENTS_PER_BATCH);
  const count = anomalyType === "regional" ? baseCount * 3 : baseCount;

  const events: AudienceEvent[] = [];
  for (let i = 0; i < count; i++) {
    const title = randomChoice(TITLES);

    if (anomalyType === "regional" && anomalyRegion) {
      events.push(generateEvent(title, "regional", anomalyRegion));
    } else {
      const forceThisEvent = anomalyTitle !== null && title.id === anomalyTitle.id;
      events.push(generateEvent(title, forceThisEvent ? anomalyType : null));
    }
  }

  if (isAnomalyBatch) {
    const label = anomalyType === "regional"
      ? `pic de volume région ${anomalyRegion}`
      : `${anomalyType} sur "${anomalyTitle?.name}" (${anomalyTitle?.id})`;
    console.log(`[simulator] anomalie injectée: ${label}`);
  }

  return events;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function main() {
  const client = createClient({
    url: CLICKHOUSE_URL,
    database: CLICKHOUSE_DB,
    username: CLICKHOUSE_USER,
    password: CLICKHOUSE_PASSWORD,
  });

  let batchIndex = 0;
  let running = true;

  console.log(
    `[simulator] démarrage — insertion toutes les ${BATCH_INTERVAL_MS}ms dans "${CLICKHOUSE_DB}.audience_events"`
  );

  let forcedAnomaly: { type: AnomalyType; titleId?: string; region?: string } | null = null;

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (input) => {
  const raw = input.toString().trim();
  // format attendu: "dropoff aurora-03" ou "spike aurora-01" ou "regional EU"
  const [type, target] = raw.split(" ");
  if (type === "dropoff" || type === "spike") {
    forcedAnomaly = { type, titleId: target };
        console.log(`[simulator] anomalie manuelle armée: ${type} sur ${target}`);
  } else if (type === "regional") {
        forcedAnomaly = { type, region: target };
        console.log(`[simulator] anomalie manuelle armée: regional sur ${target}`);
  }
  });

    async function tick() {
        if (!running) return;

        batchIndex += 1;

        let events: AudienceEvent[];
        if (forcedAnomaly) {
            const { type, titleId, region } = forcedAnomaly;
            const title = titleId ? TITLES.find(t => t.id === titleId) ?? randomChoice(TITLES) : randomChoice(TITLES);
            events = type === "regional"
            ? Array.from({ length: MAX_EVENTS_PER_BATCH * 3 }, () =>
                generateEvent(randomChoice(TITLES), "regional", region)
                )
            : Array.from({ length: randomInt(MIN_EVENTS_PER_BATCH, MAX_EVENTS_PER_BATCH) }, () =>
                generateEvent(title, type)
                );
            forcedAnomaly = null; // on consomme le trigger une seule fois
        } else {
            events = generateBatch(batchIndex);
        }

        try {
            await client.insert({ table: "audience_events", values: events, format: "JSONEachRow" });
            console.log(`[simulator] batch #${batchIndex} — ${events.length} événements insérés`);
        } catch (err) {
            console.error("[simulator] échec d'insertion:", err);
        }

        setTimeout(tick, BATCH_INTERVAL_MS);
    }

  tick();

  const shutdown = async () => {
    console.log("\n[simulator] arrêt en cours...");
    running = false;
    await client.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[simulator] erreur fatale:", err);
  process.exit(1);
});