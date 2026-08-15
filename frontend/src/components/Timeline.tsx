import { useEffect, useState } from "react";
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

const TITLES = [
  { id: "aurora-01", name: "Nightfall Protocol" },
  { id: "aurora-02", name: "The Last Reel" },
  { id: "aurora-03", name: "Glass Horizon" },
  { id: "aurora-04", name: "Static Bloom" },
  { id: "aurora-05", name: "Echo Chamber" },
  { id: "aurora-06", name: "Paper Moons" },
];

interface ChartPoint {
  minute: string;
  viewers: number;
  dropOffRate: number;
}

export function Timeline() {
  const [selectedTitle, setSelectedTitle] = useState(TITLES[0].id);
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
        <h2 className="text-xl font-bold">Timeline</h2>
        <select
          value={selectedTitle}
          onChange={(e) => setSelectedTitle(e.target.value)}
          className="bg-slate-800 text-white border border-slate-700 rounded px-3 py-1"
        >
          {TITLES.map((title) => (
            <option key={title.id} value={title.id}>
              {title.name}
            </option>
          ))}
        </select>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="text-red-400">Error: {error}</p>}

      {!loading && !error && (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="minute" stroke="#94a3b8" />
            <YAxis yAxisId="left" stroke="#60a5fa" />
            <YAxis yAxisId="right" orientation="right" stroke="#f87171" unit="%" />
            <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "6px" }}
                labelStyle={{ color: "#e2e8f0", fontWeight: "bold" }}
                itemStyle={{ color: "#e2e8f0" }}
                cursor={{ fill: "rgba(148, 163, 184, 0.1)" }}
            />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="viewers"
              name="Viewers"
              stroke="#60a5fa"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="dropOffRate"
              name="Drop-off (%)"
              stroke="#f87171"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}