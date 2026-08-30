import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSnapshot } from "../api/client";
import type { SnapshotRow } from "../types/audience";
import { RadialGauge } from "./RadialGauge";


const WINDOWS = [
  { value: "5", label: "Last 5 min" },
  { value: "15", label: "Last 15 min" },
  { value: "30", label: "Last 30 min" },
  { value: "60", label: "Last hour" },
];

const REGIONS = ["NA", "EU", "WA", "SA", "APAC"];

const PAGE_SIZE = 9;

export function Snapshot() {
  const [data, setData] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowMinutes, setWindowMinutes] = useState("15");
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  
  const navigate = useNavigate();

  useEffect(() => {
    function loadSnapshot() {
        getSnapshot(Number(windowMinutes))
        .then(setData)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }

    loadSnapshot();
    const interval = setInterval(loadSnapshot, 5000);

    return () => clearInterval(interval);
  }, [windowMinutes]);

  useEffect(() => {
    setPage(1); 
  }, [windowMinutes, search, regionFilter]);

  const filteredData = data.filter(
    (row) =>
      row.title_name.toLowerCase().includes(search.toLowerCase()) &&
      (regionFilter === "all" || row.region === regionFilter)
  );
  const pageCount = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount); 
  const pagedData = filteredData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search titles..."
          className="w-48 bg-surface text-ink border border-border rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:border-marquee/50 transition-colors"
        />
        <Select value={windowMinutes} onValueChange={(value) => value && setWindowMinutes(value)}>
          <SelectTrigger className="w-40 bg-surface border-border font-mono text-sm rounded-lg hover:border-marquee/50 transition-colors">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-surface border-border rounded-lg shadow-xl">
            {WINDOWS.map((w) => (
              <SelectItem
                key={w.value}
                value={w.value}
                className="font-mono text-sm rounded-md focus:bg-marquee/10 focus:text-marquee data-[state=checked]:text-marquee data-[state=checked]:font-semibold"
              >
                {w.label}
              </SelectItem>
            ))}
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

      {loading && <p className="text-ink">Loading...</p>}
      {error && <p className="text-tally">Error: {error}</p>}

    {!loading && !error && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {pagedData.map((row) => {
          const dropOffRate =
            row.viewer_count > 0
              ? Math.round((row.drop_off_count / row.viewer_count) * 100)
              : 0;

          return (
            <div
              key={`${row.title_id}-${row.region}`}
              onClick={() => navigate(`/titles/${row.title_id}`)}
              className="bg-surface border border-border rounded-lg p-4 hover:border-marquee/40 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="font-mono font-semibold text-sm truncate">{row.title_name}</p>
                <span className="text-xs font-mono text-muted-foreground bg-void px-2 py-0.5 rounded">
                  {row.region}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold font-mono">{row.viewer_count}</p>
                  <p className="text-xs text-muted-foreground">viewers</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <RadialGauge percentage={dropOffRate} />
                  <p className="text-xs text-muted-foreground">drop-off</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mt-2 font-mono">
                avg watch: {Math.round(row.avg_seconds_watched)}s
              </p>
            </div>
          );
        })}
      </div>
    )}

    {!loading && !error && filteredData.length === 0 && (
      <p className="text-muted-foreground">No titles match your search.</p>
    )}

    {!loading && !error && pageCount > 1 && (
        <div className="flex items-center justify-center gap-4 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="text-sm font-mono px-3 py-1 rounded-lg border border-border bg-surface disabled:opacity-40 disabled:cursor-not-allowed hover:border-marquee/50 transition-colors"
          >
            Prev
          </button>
          <span className="text-xs font-mono text-muted-foreground">
            Page {currentPage} / {pageCount}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={currentPage === pageCount}
            className="text-sm font-mono px-3 py-1 rounded-lg border border-border bg-surface disabled:opacity-40 disabled:cursor-not-allowed hover:border-marquee/50 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}