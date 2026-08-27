import { useEffect, useState } from "react";
import type { AgentDecision } from "../../../packages/shared/src/types";
import { DecisionCard, STATUS_STYLES } from "./DecisionCard";
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

  // Reset to page 1 whenever the filter changes — a stale offset on a
  // narrower filter would silently show an empty page.
  useEffect(() => {
    setOffset(0);
  }, [statusFilter]);

  useEffect(() => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (titleId) params.set("titleId", titleId);

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
  }, [statusFilter, offset, titleId]);

  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold font-display tracking-tight text-ink">
          {titleId ? "Decisions for this title" : "Decision history"}
        </h2>
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