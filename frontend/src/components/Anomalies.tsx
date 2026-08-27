import { useEffect, useState } from "react";
import { getAnomalies } from "../api/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AnomalyRow } from "../types/audience";
import { useTitles } from "../hooks/useTitles";

interface AnomalyLogEntry extends AnomalyRow {
  key: string;
  detectedAt: string;
  resolvedAt: string | null;
  stillActive: boolean;
}

const REGIONS = ["NA", "EU", "WA", "SA", "APAC"];

export function Anomalies() {
  const [log, setLog] = useState<AnomalyLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [titleFilter, setTitleFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");

  const filteredLog = log.filter(
    (a) =>
      (titleFilter === "all" || a.title_id === titleFilter) &&
      (regionFilter === "all" || a.region === regionFilter)
  );
  const { titles, loading: titlesLoading } = useTitles();

  useEffect(() => {
    function loadAnomalies() {
      getAnomalies()
        .then((rows: AnomalyRow[]) => {
          const safeRows = rows ?? [];
          const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          const activeKeys = new Set(safeRows.map((r) => `${r.title_id}-${r.region}`));

          setLog((prev) => {
            const updated = new Map(prev.map((e) => [e.key, e]));

            for (const row of safeRows) {
              const key = `${row.title_id}-${row.region}`;
              const existing = updated.get(key);
              updated.set(key, {
                ...row,
                key,
                detectedAt: existing?.detectedAt ?? now, 
                resolvedAt: null, 
                stillActive: true,
              });
            }

            for (const [key, entry] of updated) {
              if (!activeKeys.has(key)) {
                updated.set(key, {
                  ...entry,
                  resolvedAt: entry.resolvedAt ?? now, 
                  stillActive: false,
                });
              }
            }

            return Array.from(updated.values())
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
            <SelectValue placeholder={titlesLoading ? "Loading titles..." : undefined}>
              {titleFilter === "all"
                ? "All titles"
                : titles.find((t) => t.title_id === titleFilter)?.title_name ?? titleFilter}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-surface border-border rounded-lg shadow-xl">
            <SelectItem value="all" className="font-mono text-sm rounded-md focus:bg-marquee/10 focus:text-marquee">
              All titles
            </SelectItem>
            {titles.map((t) => (
              <SelectItem
                key={t.title_id}
                value={t.title_id}
                className="font-mono text-sm rounded-md focus:bg-marquee/10 focus:text-marquee data-[state=checked]:text-marquee data-[state=checked]:font-semibold"
              >
                {t.title_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={regionFilter} onValueChange={(value) => value && setRegionFilter(value)}>
          <SelectTrigger className="w-30 bg-surface border-border font-mono text-sm rounded-lg hover:border-marquee/50 transition-colors">
            <SelectValue />
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
                  {anomaly.title_name}
                  {anomaly.stillActive ? (
                    <span className="text-xs bg-tally text-void px-2 py-0.5 rounded font-semibold">ACTIVE</span>
                  ) : (
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">resolved</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  Region: {anomaly.region} · detected at {anomaly.detectedAt}
                  {anomaly.resolvedAt && ` · resolved at ${anomaly.resolvedAt}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-tally font-bold font-mono">
                  +{Math.round(anomaly.deviation * 100)} pts
                </p>
                <p className="text-sm text-muted-foreground">
                  {Math.round(anomaly.current_rate * 100)}% vs{" "}
                  {Math.round(anomaly.baseline_rate * 100)}% baseline
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}