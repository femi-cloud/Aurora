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
import { useTitles } from "../hooks/useTitles";

interface BarPoint {
  region: string;
  viewers: number;
  dropOffRate: number;
}

export function RegionalBreakdown() {
  const { titles, loading: titlesLoading } = useTitles();
  const [selectedTitle, setSelectedTitle] = useState("");
  const [data, setData] = useState<BarPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [titleSearch, setTitleSearch] = useState("");

  const filteredTitles = titles.filter((t) =>
    t.title_name.toLowerCase().includes(titleSearch.toLowerCase())
  );

  useEffect(() => {
    if (!selectedTitle && titles.length > 0) setSelectedTitle(titles[0].title_id);
  }, [titles, selectedTitle]);

  useEffect(() => {
    if (!selectedTitle) return;
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
        <h2 className="text-xl font-bold font-display tracking-tight text-ink">Regional Breakdown</h2>
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
            {filteredTitles.map((title) => (
              <SelectItem
                key={title.title_id}
                value={title.title_id}
                className="font-mono text-sm rounded-md focus:bg-marquee/10 focus:text-marquee data-[state=checked]:text-marquee data-[state=checked]:font-semibold"
              >
                {title.title_name}
              </SelectItem>
            ))}
            {filteredTitles.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground font-mono">No titles match.</p>
            )}
          </SelectContent>
        </Select>
      </div>

      {loading && <p className="font-mono text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="font-mono text-sm text-tally">Error: {error}</p>}

      {!loading && !error && (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="region" stroke="var(--color-muted-foreground)" />
            <YAxis yAxisId="left" stroke="var(--color-scope)" />
            <YAxis yAxisId="right" orientation="right" stroke="var(--color-tally)" unit="%" />
            <Tooltip
                contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "6px" }}
                labelStyle={{ color: "var(--color-ink)", fontWeight: "bold" }}
                itemStyle={{ color: "var(--color-ink)" }}
                cursor={{ fill: "color-mix(in oklab, var(--color-ink) 8%, transparent)" }}
            />
            <Legend />
            <Bar yAxisId="left" dataKey="viewers" name="Viewers" fill="var(--color-scope)" />
            <Bar yAxisId="right" dataKey="dropOffRate" name="Drop-off (%)" fill="var(--color-tally)" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}