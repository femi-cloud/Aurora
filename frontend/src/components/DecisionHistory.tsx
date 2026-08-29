import { useEffect, useState } from "react";
import { useTitles } from "../hooks/useTitles";
import type { AgentDecision } from "../../../packages/shared/src/types";
import { DecisionCard, STATUS_STYLES, TYPE_LABELS } from "./DecisionCard";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE = 20;
const API_URL = import.meta.env.VITE_API_URL;

interface HistoryResponse {
  decisions: AgentDecision[];
  total: number;
}

export function DecisionHistory({ titleId }: { titleId?: string } = {}) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [decisions, setDecisions] = useState<AgentDecision[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { titles } = useTitles();
  const [titleFilter, setTitleFilter] = useState("all");
  const [titleSearch, setTitleSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const filteredTitles = titles.filter((t) =>
    t.title_name.toLowerCase().includes(titleSearch.toLowerCase())
  );

  // Reset to page 1 whenever the filter changes — a stale offset on a
  // narrower filter would silently show an empty page.
  useEffect(() => {
    setOffset(0);
  }, [statusFilter, titleFilter, typeFilter]);

  useEffect(() => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (titleId) params.set("titleId", titleId);
    else if (titleFilter !== "all") params.set("titleId", titleFilter);
    if (typeFilter !== "all") params.set("type", typeFilter);

    setLoading(true);
    setError(null);
    fetch(`${API_URL}/api/decisions/history?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<HistoryResponse>;
      })
      .then((data) => {
        setDecisions(data.decisions);
        setTotal(data.total);
      })
      .catch(() => setError("Unable to load decision history."))
      .finally(() => setLoading(false));
  }, [statusFilter, titleFilter, typeFilter, offset, titleId]);

  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold font-display tracking-tight text-ink">
          {titleId ? "Decisions for this title" : "Decision history"}
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          {!titleId && (
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
                {filteredTitles.map((t) => (
                  <SelectItem
                    key={t.title_id}
                    value={t.title_id}
                    className="font-mono text-sm rounded-md focus:bg-marquee/10 focus:text-marquee data-[state=checked]:text-marquee data-[state=checked]:font-semibold"
                  >
                    {t.title_name}
                  </SelectItem>
                ))}
                {filteredTitles.length === 0 && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground font-mono">No titles match.</p>
                )}
              </SelectContent>
            </Select>
          )}

          <Select value={typeFilter} onValueChange={(value) => value && setTypeFilter(value)}>
            <SelectTrigger className="w-40 bg-surface border-border font-mono text-sm rounded-lg hover:border-marquee/50 transition-colors">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-surface border-border rounded-lg shadow-xl">
              <SelectItem value="all" className="font-mono text-sm rounded-md focus:bg-marquee/10 focus:text-marquee">
                All types
              </SelectItem>
              {(Object.keys(TYPE_LABELS) as AgentDecision["type"][]).map((type) => (
                <SelectItem
                  key={type}
                  value={type}
                  className="font-mono text-sm rounded-md focus:bg-marquee/10 focus:text-marquee data-[state=checked]:text-marquee data-[state=checked]:font-semibold"
                >
                  {TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(value) => value && setStatusFilter(value)}>
            <SelectTrigger className="w-35 bg-surface border-border font-mono text-sm rounded-lg hover:border-marquee/50 transition-colors">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-surface border-border rounded-lg shadow-xl">
              <SelectItem value="all" className="font-mono text-sm rounded-md focus:bg-marquee/10 focus:text-marquee">
                All statuses
              </SelectItem>
              {(Object.keys(STATUS_STYLES) as AgentDecision["status"][]).map((status) => (
                <SelectItem
                  key={status}
                  value={status}
                  className="font-mono text-sm rounded-md focus:bg-marquee/10 focus:text-marquee data-[state=checked]:text-marquee data-[state=checked]:font-semibold"
                >
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {error && <p className="text-sm text-tally">{error}</p>}

      {!error && decisions.length === 0 && !loading ? (
        <p className="text-sm text-muted-foreground">No decisions found.</p>
      ) : (
        <div className="grid gap-3">
          {decisions.map((decision) => (
            <DecisionCard key={decision.id} decision={decision} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <span className="text-xs font-mono text-muted-foreground">
          {total > 0 ? `${offset + 1}-${Math.min(offset + PAGE_SIZE, total)} of ${total}` : ""}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!hasPrev || loading}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            className="font-mono"
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!hasNext || loading}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            className="font-mono"
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}