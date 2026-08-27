import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { getTimeline, getRegionalBreakdown } from "../api/client";
import type { TimelineRow, RegionalRow } from "../types/audience";
import { useTitles } from "../hooks/useTitles";
import { DecisionHistory } from "./DecisionHistory";

interface TimelinePoint {
  minute: string;
  viewers: number;
  dropOffRate: number;
}

interface RegionalPoint {
  region: string;
  viewers: number;
  dropOffRate: number;
}

export function TitleDetail() {
  const { titleId } = useParams<{ titleId: string }>();
  const { titles } = useTitles();
  const title = titles.find((t) => t.title_id === titleId);

  const [timelineData, setTimelineData] = useState<TimelinePoint[]>([]);
  const [regionalData, setRegionalData] = useState<RegionalPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!titleId) return;
    const id = titleId;

    function load() {
      Promise.all([getTimeline(id), getRegionalBreakdown(id)])
        .then(([timelineRows, regionalRows]: [TimelineRow[], RegionalRow[]]) => {
          const grouped = new Map<string, { viewers: number; dropoffs: number }>();
          for (const row of timelineRows) {
            const existing = grouped.get(row.minute) ?? { viewers: 0, dropoffs: 0 };
            grouped.set(row.minute, {
              viewers: existing.viewers + row.viewer_count,
              dropoffs: existing.dropoffs + row.drop_off_count,
            });
          }
          const timelinePoints: TimelinePoint[] = Array.from(grouped.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([minute, { viewers, dropoffs }]) => ({
              minute: minute.slice(11, 16),
              viewers,
              dropOffRate: viewers > 0 ? Math.round((dropoffs / viewers) * 100) : 0,
            }));

          const regionalPoints: RegionalPoint[] = regionalRows.map((row) => ({
            region: row.region,
            viewers: row.viewer_count,
            dropOffRate: row.viewer_count > 0
              ? Math.round((row.drop_off_count / row.viewer_count) * 100)
              : 0,
          }));

          setTimelineData(timelinePoints);
          setRegionalData(regionalPoints);
          setError(null);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }

    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [titleId]);

  if (!titleId) {
    return <p className="font-mono text-sm text-tally">No title specified.</p>;
  }

  return (
    <div className="min-h-screen bg-void text-ink px-6 py-8 lg:px-10 max-w-[1600px] mx-auto">
      <Link
        to="/"
        className="inline-block mb-6 font-mono text-sm text-muted-foreground hover:text-marquee transition-colors"
      >
        ← Back to dashboard
      </Link>

      <div className="flex items-center gap-4 mb-8">
        {title?.poster_url && (
          <img
            src={title.poster_url}
            alt={title.title_name}
            className="w-16 h-24 object-cover rounded-lg border border-border"
          />
        )}
        <h1 className="text-2xl font-bold font-display tracking-tight text-ink">
          {title?.title_name ?? titleId}
        </h1>
      </div>

      {error && <p className="font-mono text-sm text-tally mb-4">Error: {error}</p>}
      {loading && <p className="font-mono text-sm text-muted-foreground mb-4">Loading...</p>}

      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          <div>
            <h2 className="text-lg font-bold font-display tracking-tight text-ink mb-4">Timeline</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="minute" stroke="var(--color-muted-foreground)" />
                <YAxis yAxisId="left" stroke="var(--color-scope)" />
                <YAxis yAxisId="right" orientation="right" stroke="var(--color-tally)" unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "6px" }}
                  labelStyle={{ color: "var(--color-ink)", fontWeight: "bold" }}
                  itemStyle={{ color: "var(--color-ink)" }}
                />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="viewers" name="Viewers" stroke="var(--color-scope)" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="dropOffRate" name="Drop-off (%)" stroke="var(--color-tally)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div>
            <h2 className="text-lg font-bold font-display tracking-tight text-ink mb-4">Regional Breakdown</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={regionalData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="region" stroke="var(--color-muted-foreground)" />
                <YAxis yAxisId="left" stroke="var(--color-scope)" />
                <YAxis yAxisId="right" orientation="right" stroke="var(--color-tally)" unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "6px" }}
                  labelStyle={{ color: "var(--color-ink)", fontWeight: "bold" }}
                  itemStyle={{ color: "var(--color-ink)" }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="viewers" name="Viewers" fill="var(--color-scope)" />
                <Bar yAxisId="right" dataKey="dropOffRate" name="Drop-off (%)" fill="var(--color-tally)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="border-t border-border pt-8">
        <DecisionHistory titleId={titleId} />
      </div>
    </div>
  );
}