import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { getTimeline } from "../api/client";
import type { TimelineRow } from "../types/audience";
import { useTitles } from "../hooks/useTitles";

interface ChartPoint {
  minute: string;
  viewers: number;
  dropOffRate: number;
}

export function Timeline() {
  const { titles, loading: titlesLoading } = useTitles();
  const [selectedTitle, setSelectedTitle] = useState("");
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pick the first title once the catalog loads — nothing to fetch before that.
  useEffect(() => {
    if (!selectedTitle && titles.length > 0) setSelectedTitle(titles[0].title_id);
  }, [titles, selectedTitle]);

  useEffect(() => {
    if (!selectedTitle) return;
    function loadTimeline() {
        getTimeline(selectedTitle)
        .then((rows: TimelineRow[]) => {
            const grouped = new Map<string, { viewers: number; dropoffs: number }>();

            for (const row of rows) {
            const existing = grouped.get(row.minute) ?? { viewers: 0, dropoffs: 0 };
            grouped.set(row.minute, {
                viewers: existing.viewers + row.viewer_count,
                dropoffs: existing.dropoffs + row.drop_off_count,
            });
            }

            const points: ChartPoint[] = Array.from(grouped.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([minute, { viewers, dropoffs }]) => ({
                minute: minute.slice(11, 16),
                viewers,
                dropOffRate: viewers > 0 ? Math.round((dropoffs / viewers) * 100) : 0,
            }));

            setData(points);
            setError(null);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }

    loadTimeline();
    const interval = setInterval(loadTimeline, 5000);

    return () => clearInterval(interval);
  }, [selectedTitle]);

  return (
    <div className="mt-8">
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-xl font-bold font-display tracking-tight text-ink">Timeline</h2>
        {selectedTitle && (
          <Link
            to={`/titles/${selectedTitle}`}
            className="font-mono text-xs text-muted-foreground hover:text-marquee transition-colors"
          >
            View details →
          </Link>
        )}
        <Select
          value={selectedTitle}
          onValueChange={(value) => {
            if (value) setSelectedTitle(value);
          }}
          disabled={titlesLoading}
        >
          <SelectTrigger className="w-55 bg-surface border-border font-mono text-sm rounded-lg hover:border-marquee/50 transition-colors disabled:opacity-50">
            <SelectValue placeholder={titlesLoading ? "Loading titles..." : undefined}>
              {titles.find((t) => t.title_id === selectedTitle)?.title_name ?? selectedTitle}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-surface border-border rounded-lg shadow-xl">
            {titles.map((title) => (
              <SelectItem
                key={title.title_id}
                value={title.title_id}
                className="font-mono text-sm rounded-md focus:bg-marquee/10 focus:text-marquee data-[state=checked]:text-marquee data-[state=checked]:font-semibold"
              >
                {title.title_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && <p className="font-mono text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="font-mono text-sm text-tally">Error: {error}</p>}

      {!loading && !error && (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="minute" stroke="var(--color-muted-foreground)" />
            <YAxis yAxisId="left" stroke="var(--color-scope)" />
            <YAxis yAxisId="right" orientation="right" stroke="var(--color-tally)" unit="%" />
            <Tooltip
                contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "6px" }}
                labelStyle={{ color: "var(--color-ink)", fontWeight: "bold" }}
                itemStyle={{ color: "var(--color-ink)" }}
                cursor={{ fill: "color-mix(in oklab, var(--color-ink) 8%, transparent)" }}
            />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="viewers"
              name="Viewers"
              stroke="var(--color-scope)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="dropOffRate"
              name="Drop-off (%)"
              stroke="var(--color-tally)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}