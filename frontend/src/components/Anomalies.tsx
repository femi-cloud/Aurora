import { useEffect, useState } from "react";
import { getAnomalies, getAnomalyLog, getTitles } from "../api/client";import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTitles } from "../hooks/useTitles";
import type { AnomalyRow, AnomalyLogRow, TitleMetadataRow } from "../types/audience";

interface AnomalyLogEntry {
  key: string;
  titleId: string;
  region: string;
  titleName: string | null;
  stillActive: boolean;
  detectedAt: string;
  resolvedAt: string | null;
  // Metrics only come from /api/anomalies (the live snapshot), so they're
  // only guaranteed while the anomaly is active. Once closed, we keep the
  // last known values from the previous render rather than blanking them.
  deviation: number | null;
  currentRate: number | null;
  baselineRate: number | null;
}

const REGIONS = ["NA", "EU", "WA", "SA", "APAC"];

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatPct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function Anomalies() {
  const [log, setLog] = useState<AnomalyLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [titleFilter, setTitleFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");

  const [titleSearch, setTitleSearch] = useState("");

  const filteredLog = log.filter(
    (a) =>
      (titleFilter === "all" || a.titleId === titleFilter) &&
      (regionFilter === "all" || a.region === regionFilter)
  );

  const { titles } = useTitles();

  const filteredTitleOptions = titles.filter((t) =>
    t.title_name.toLowerCase().includes(titleSearch.toLowerCase())
  );

  useEffect(() => {
    function loadAnomalies() {
      Promise.all([getAnomalyLog(), getAnomalies(), getTitles()])
        .then(([logRows, metricRows, titleRows]: [AnomalyLogRow[], AnomalyRow[], TitleMetadataRow[]]) => {
          const safeLogRows = logRows ?? [];
          const metricsByKey = new Map(
            (metricRows ?? []).map((r) => [`${r.title_id}-${r.region}`, r])
          );
          const namesByTitleId = new Map(
            (titleRows ?? []).map((t) => [t.title_id, t.title_name])
          );

          setLog((prev) => {
            const prevByKey = new Map(prev.map((e) => [e.key, e]));

            const merged = safeLogRows.map((row): AnomalyLogEntry => {
              const key = `${row.titleId}-${row.region}`;
              const metrics = metricsByKey.get(key);
              const previous = prevByKey.get(key);

              return {
                key,
                titleId: row.titleId,
                region: row.region,
                titleName: namesByTitleId.get(row.titleId) ?? metrics?.title_name ?? previous?.titleName ?? null,
                stillActive: row.status === "opened",
                detectedAt: row.openedAt,
                resolvedAt: row.closedAt,
                deviation: metrics?.deviation ?? previous?.deviation ?? null,
                currentRate: metrics?.current_rate ?? previous?.currentRate ?? null,
                baselineRate: metrics?.baseline_rate ?? previous?.baselineRate ?? null,
              };
            });

            return merged
              .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
              .slice(0, 15);
          });

          setError(null);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }

    loadAnomalies();
    const interval = setInterval(loadAnomalies, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-8">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h2 className="text-xl font-bold font-display tracking-tight text-ink">Detected anomalies</h2>

        <Select value={titleFilter} onValueChange={(value) => value && setTitleFilter(value)}>
          <SelectTrigger className="w-45 bg-surface border-border font-mono text-sm rounded-lg hover:border-marquee/50 transition-colors">
            <SelectValue>
              {titleFilter === "all"
                ? "All titles"
                : titles.find((t) => t.title_id === titleFilter)?.title_name ?? titleFilter}
            </SelectValue>
          </SelectTrigger>
          <SelectContent
            className="bg-surface border-border rounded-lg shadow-xl"
            alignItemWithTrigger={false}
            align="start"
          >
            <div className="px-1.5 py-1.5 sticky top-0 bg-surface z-10 border-b border-border mb-1">
              <input
                type="text"
                value={titleSearch}
                onChange={(e) => setTitleSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Search titles..."
                className="w-full bg-void text-ink border border-border rounded-md px-2 py-1 font-mono text-xs focus:outline-none focus:border-marquee/50 transition-colors"
              />
            </div>
            <SelectItem value="all" className="font-mono text-sm rounded-md focus:bg-marquee/10 focus:text-marquee">
              All titles
            </SelectItem>
            {filteredTitleOptions.map((t) => (
              <SelectItem
                key={t.title_id}
                value={t.title_id}
                className="font-mono text-sm rounded-md focus:bg-marquee/10 focus:text-marquee data-[state=checked]:text-marquee data-[state=checked]:font-semibold"
              >
                {t.title_name}
              </SelectItem>
            ))}
            {filteredTitleOptions.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground font-mono">No titles match.</p>
            )}
          </SelectContent>
        </Select>

        <Select value={regionFilter} onValueChange={(value) => value && setRegionFilter(value)}>
          <SelectTrigger className="w-35 bg-surface border-border font-mono text-sm rounded-lg hover:border-marquee/50 transition-colors">
            <SelectValue>{regionFilter === "all" ? "All regions" : regionFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-surface border-border rounded-lg shadow-xl">
            <SelectItem value="all" className="font-mono text-sm rounded-md focus:bg-marquee/10 focus:text-marquee">
              All regions
            </SelectItem>
            {REGIONS.map((r) => (
              <SelectItem
                key={r}
                value={r}
                className="font-mono text-sm rounded-md focus:bg-marquee/10 focus:text-marquee data-[state=checked]:text-marquee data-[state=checked]:font-semibold"
              >
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && <p className="font-mono text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="text-tally">Error: {error}</p>}

      {!loading && !error && filteredLog.length === 0 && (
        <p className="text-muted-foreground">No anomalies detected at the moment.</p>
      )}

      {!loading && !error && filteredLog.length > 0 && (
        <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
          {filteredLog.map((anomaly) => (
            <div
              key={anomaly.key}
              className={`rounded-lg p-4 flex items-center justify-between border transition-opacity ${
                anomaly.stillActive
                  ? "bg-tally/10 border-tally/40"
                  : "bg-surface border-border opacity-50"
              }`}
            >
              <div>
                <p className="font-bold flex items-center gap-2 font-mono">
                  {anomaly.titleName ?? anomaly.titleId}
                  {anomaly.stillActive ? (
                    <span className="text-xs bg-tally text-void px-2 py-0.5 rounded font-semibold">ACTIVE</span>
                  ) : (
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">resolved</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  Region: {anomaly.region} · detected at {formatTime(anomaly.detectedAt) ?? "—"}
                  {anomaly.resolvedAt && ` · resolved at ${formatTime(anomaly.resolvedAt)}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-tally font-bold font-mono">
                  {anomaly.deviation === null ? "—" : `+${Math.round(anomaly.deviation * 100)} pts`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatPct(anomaly.currentRate)} vs {formatPct(anomaly.baselineRate)} baseline
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}