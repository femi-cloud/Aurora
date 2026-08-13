import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { getRegionalBreakdown } from "../api/client";
import type { RegionalRow } from "../types/audience";

const TITLES = [
  { id: "aurora-01", name: "Nightfall Protocol" },
  { id: "aurora-02", name: "The Last Reel" },
  { id: "aurora-03", name: "Glass Horizon" },
  { id: "aurora-04", name: "Static Bloom" },
  { id: "aurora-05", name: "Echo Chamber" },
  { id: "aurora-06", name: "Paper Moons" },
];

interface BarPoint {
  region: string;
  viewers: number;
  dropOffRate: number;
}

export function RegionalBreakdown() {
  const [selectedTitle, setSelectedTitle] = useState(TITLES[0].id);
  const [data, setData] = useState<BarPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function loadBreakdown() {
      getRegionalBreakdown(selectedTitle)
        .then((rows: RegionalRow[]) => {
          const points: BarPoint[] = rows.map((row) => ({
            region: row.region,
            viewers: row.viewer_count,
            dropOffRate: row.viewer_count > 0
              ? Math.round((row.drop_off_count / row.viewer_count) * 100)
              : 0,
          }));
          setData(points);
          setError(null);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }

    loadBreakdown();
    const interval = setInterval(loadBreakdown, 5000);

    return () => clearInterval(interval);
  }, [selectedTitle]);

  return (
    <div className="mt-8">
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-xl font-bold">Répartition par région</h2>
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

      {loading && <p>Chargement...</p>}
      {error && <p className="text-red-400">Erreur: {error}</p>}

      {!loading && !error && (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="region" stroke="#94a3b8" />
            <YAxis yAxisId="left" stroke="#60a5fa" />
            <YAxis yAxisId="right" orientation="right" stroke="#f87171" unit="%" />
            <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "6px" }}
                labelStyle={{ color: "#e2e8f0", fontWeight: "bold" }}
                itemStyle={{ color: "#e2e8f0" }}
                cursor={{ fill: "rgba(148, 163, 184, 0.1)" }}
            />
            <Legend />
            <Bar yAxisId="left" dataKey="viewers" name="Viewers" fill="#60a5fa" />
            <Bar yAxisId="right" dataKey="dropOffRate" name="Drop-off (%)" fill="#f87171" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}