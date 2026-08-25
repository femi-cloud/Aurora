import { createClient } from "@clickhouse/client";
import "dotenv/config";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";
const CLICKHOUSE_DB = process.env.CLICKHOUSE_DB ?? "default";
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER ?? "default";
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD ?? "";

const BATCH_INTERVAL_MS = 10000; // one batch every 10s
const MIN_EVENTS_PER_BATCH = 15;
const MAX_EVENTS_PER_BATCH = 60;
const ANOMALY_EVERY_N_BATCHES = 30; // ~1 anomaly per minute at 2s/batch

const TMDB_API_KEY = process.env.TMDB_API_KEY ?? "";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

// Pinned fictional title_id -> real TMDB movie, kept stable so the
// ml-service one-hot encoding never breaks. baseline stays the
// simulator's own tuning knob, unrelated to the real movie.
const TITLE_SEEDS = [
  { id: "aurora-01", tmdbId: 27205, baseline: 0.85, fallbackName: "Nightfall Protocol" },
  { id: "aurora-02", tmdbId: 496243, baseline: 0.7, fallbackName: "The Last Reel" },
  { id: "aurora-03", tmdbId: 129, baseline: 0.6, fallbackName: "Glass Horizon" },
  { id: "aurora-04", tmdbId: 76341, baseline: 0.75, fallbackName: "Static Bloom" },
  { id: "aurora-05", tmdbId: 419430, baseline: 0.5, fallbackName: "Echo Chamber" },
  { id: "aurora-06", tmdbId: 313369, baseline: 0.65, fallbackName: "Paper Moons" },
  { id: "aurora-07", tmdbId: 157336, baseline: 0.8, fallbackName: "Wormhole Season" },
  { id: "aurora-08", tmdbId: 603, baseline: 0.9, fallbackName: "Red Pill Blue Pill" },
  { id: "aurora-09", tmdbId: 680, baseline: 0.72, fallbackName: "Nonlinear Diner" },
  { id: "aurora-10", tmdbId: 155, baseline: 0.88, fallbackName: "Gotham Nights" },
  { id: "aurora-11", tmdbId: 545611, baseline: 0.68, fallbackName: "Bagel Multiverse" },
  { id: "aurora-12", tmdbId: 244786, baseline: 0.55, fallbackName: "Double Time" },
  { id: "aurora-13", tmdbId: 324857, baseline: 0.78, fallbackName: "Into the Verse" },
  { id: "aurora-14", tmdbId: 120467, baseline: 0.6, fallbackName: "Concierge's Ledger" },
  { id: "aurora-15", tmdbId: 438631, baseline: 0.82, fallbackName: "Spice Horizon" },
  { id: "aurora-16", tmdbId: 37799, baseline: 0.58, fallbackName: "Dorm Room IPO" },
  { id: "aurora-17", tmdbId: 546554, baseline: 0.7, fallbackName: "Estate of Confusion" },
  { id: "aurora-18", tmdbId: 354912, baseline: 0.75, fallbackName: "Land of Marigolds" },
  { id: "aurora-19", tmdbId: 872585, baseline: 0.65, fallbackName: "Trinity Site" },
  { id: "aurora-20", tmdbId: 346698, baseline: 0.85, fallbackName: "Dreamhouse Reboot" },
];

interface Title {
  id: string;
  name: string;
  baseline: number;
  posterUrl: string | null;
}

// Populated at startup by fetchTitleMetadata(). Starts with the
// fictional fallback names so the simulator can still run if the
// TMDB fetch fails or no key is set.
let TITLES: Title[] = TITLE_SEEDS.map((seed) => ({
  id: seed.id,
  name: seed.fallbackName,
  baseline: seed.baseline,
  posterUrl: null,
}));

const REGIONS = ["NA", "EU", "WA", "SA", "APAC"];
const DEVICES = ["mobile", "desktop", "tv", "tablet"];

const TITLE_RUNTIME_SECONDS = 5400; // ~90 min, to bound seconds_watched

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetches real title + poster from TMDB for each pinned title_id.
 * Runs once at startup. Falls back silently to the fictional name
 * for any title where the fetch fails, so the simulator never
 * blocks on a network issue.
 */
async function fetchTitleMetadata(): Promise<void> {
  if (!TMDB_API_KEY) {
    console.warn("[simulator] TMDB_API_KEY not set — using fictional titles");
    return;
  }

  const results = await Promise.all(
    TITLE_SEEDS.map(async (seed) => {
      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/movie/${seed.tmdbId}?api_key=${TMDB_API_KEY}`
        );
        if (!res.ok) throw new Error(`TMDB responded ${res.status}`);
        const data = (await res.json()) as { title: string; poster_path: string | null };

        return {
          id: seed.id,
          name: data.title,
          baseline: seed.baseline,
          posterUrl: data.poster_path ? `${TMDB_IMAGE_BASE}${data.poster_path}` : null,
        };
      } catch (err) {
        console.error(`[simulator] TMDB fetch failed for ${seed.id} (tmdbId ${seed.tmdbId}):`, err);
        return {
          id: seed.id,
          name: seed.fallbackName,
          baseline: seed.baseline,
          posterUrl: null,
        };
      }
    })
  );

  TITLES = results;
  console.log("[simulator] TMDB metadata loaded:", TITLES.map((t) => t.name).join(", "));
}

/**
 * Writes title metadata (name + poster) to the dedicated aurora.titles
 * table, once at startup — this is what getTitleMetadata() reads from
 * now, instead of scanning the ever-growing audience_events table.
 */
async function persistTitleMetadata(
  client: ReturnType<typeof createClient>
): Promise<void> {
  try {
    await client.insert({
      table: "titles",
      values: TITLES.map((t) => ({
        title_id: t.id,
        title_name: t.name,
        poster_url: t.posterUrl,
      })),
      format: "JSONEachRow",
    });
    console.log("[simulator] title metadata persisted to aurora.titles");
  } catch (err) {
    console.error("[simulator] failed to persist title metadata:", err);
  }
}

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
  poster_url: string | null;
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
 * Generates an event for a given title.
 * If `forceAnomaly` is true, the drop-off rate is abnormally high
 * to simulate a detectable incident (e.g. subtitle bug, buffering).
 */
function generateEvent(
  title: (typeof TITLES)[number],
  anomalyType: AnomalyType | null,
  forcedRegion?: string
): AudienceEvent {
  const isAnomaly = anomalyType !== null;

  let dropOffProbability = 1 - title.baseline;
  if (anomalyType === "dropoff") dropOffProbability = 0.9;
  if (anomalyType === "spike") dropOffProbability = Math.max(0, (1 - title.baseline) - 0.4); // much less drop-off than usual = sign of strong engagement
  // "regional" keeps the title's normal dropOffProbability, the anomaly here is the VOLUME (handled in generateBatch), not the dropoff

  const dropOff = Math.random() < dropOffProbability ? 1 : 0;

  const secondsWatched = dropOff
    ? randomInt(10, Math.floor(TITLE_RUNTIME_SECONDS * 0.2))
    : randomInt(Math.floor(TITLE_RUNTIME_SECONDS * 0.6), TITLE_RUNTIME_SECONDS);

  return {
    event_time: new Date().toISOString().replace("T", " ").slice(0, 19),
    title_id: title.id,
    title_name: title.name,
    poster_url: title.posterUrl,
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

  // "regional" generates more events than usual to simulate a volume spike/dip
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
      ? `volume spike in region ${anomalyRegion}`
      : `${anomalyType} on "${anomalyTitle?.name}" (${anomalyTitle?.id})`;
    console.log(`[simulator] anomaly injected: ${label}`);
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

  await fetchTitleMetadata();
  await persistTitleMetadata(client);

  let batchIndex = 0;
  let running = true;

  console.log(
    `[simulator] starting — inserting every ${BATCH_INTERVAL_MS}ms into "${CLICKHOUSE_DB}.audience_events"`
  );

  let forcedAnomaly: { type: AnomalyType; titleId?: string; region?: string } | null = null;

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (input) => {
  const raw = input.toString().trim();
  // expected format: "dropoff aurora-03" or "spike aurora-01" or "regional EU"
  const [type, target] = raw.split(" ");
  if (type === "dropoff" || type === "spike") {
    forcedAnomaly = { type, titleId: target };
        console.log(`[simulator] manual anomaly armed: ${type} on ${target}`);
  } else if (type === "regional") {
        forcedAnomaly = { type, region: target };
        console.log(`[simulator] manual anomaly armed: regional on ${target}`);
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
            forcedAnomaly = null; // consume the trigger once
        } else {
            events = generateBatch(batchIndex);
        }

        try {
            await client.insert({ table: "audience_events", values: events, format: "JSONEachRow" });
            console.log(`[simulator] batch #${batchIndex} — ${events.length} events inserted`);
        } catch (err) {
            console.error("[simulator] insertion failed:", err);
        }

        setTimeout(tick, BATCH_INTERVAL_MS);
    }

  tick();

  const shutdown = async () => {
    console.log("\n[simulator] shutting down...");
    running = false;
    await client.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[simulator] fatal error:", err);
  process.exit(1);
});