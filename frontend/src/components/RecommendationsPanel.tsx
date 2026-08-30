import { useState } from "react";
import { useAgentSocket} from "../hooks/useAgentSocket";
import type { AgentDecision } from "../../../packages/shared/src/types";
import { useTitles } from "../hooks/useTitles";
import { DecisionCard, STATUS_STYLES, TYPE_LABELS } from "./DecisionCard";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function RecommendationsPanel() {
  const { decisions, connected, sendAction } = useAgentSocket();
  const [statusFilter, setStatusFilter] = useState("all");

  const { titles } = useTitles();
  const [titleFilter, setTitleFilter] = useState("all");
  const [titleSearch, setTitleSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const filteredTitles = titles.filter((t) =>
    t.title_name.toLowerCase().includes(titleSearch.toLowerCase())
  );

  const filteredDecisions = decisions.filter((d) => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (titleFilter !== "all" && d.titleId !== titleFilter) return false;
    if (typeFilter !== "all" && d.type !== typeFilter) return false;
    return true;
  });

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold font-display tracking-tight text-ink">Agent recommendations</h2>
        <div className="flex items-center gap-3">
          <Select value={titleFilter} onValueChange={(value) => value && setTitleFilter(value)}>
            <SelectTrigger className="w-45 bg-surface border-border font-mono text-sm rounded-lg hover:border-marquee/50 transition-colors">
              <SelectValue>
                {titleFilter === "all"
                  ? "All titles"
                  : `Title: ${titles.find((t) => t.title_id === titleFilter)?.title_name ?? titleFilter}`}
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

          <Select value={typeFilter} onValueChange={(value) => value && setTypeFilter(value)}>
            <SelectTrigger className="w-40 bg-surface border-border font-mono text-sm rounded-lg hover:border-marquee/50 transition-colors">
              <SelectValue>{typeFilter === "all" ? "All types" : TYPE_LABELS[typeFilter as AgentDecision["type"]]}</SelectValue>
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
              <SelectValue>{statusFilter === "all" ? "All statuses" : statusFilter}</SelectValue>
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
          <Badge
            className={`font-mono ${
              connected
                ? "bg-scope/15 text-scope border border-scope/30"
                : "bg-muted text-muted-foreground border border-border"
            }`}
          >
            {connected ? "Live" : "Disconnected"}
          </Badge>
        </div>
      </header>

      {filteredDecisions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {decisions.length === 0
            ? "No recommendations yet."
            : `No ${statusFilter} recommendations.`}
        </p>
      ) : (
        <div className="grid gap-3">
          {filteredDecisions.map((decision) => (
            <DecisionCard
              key={decision.id}
              decision={decision}
              onAccept={() => sendAction(decision.id, "accept")}
              onReject={() => sendAction(decision.id, "reject")}
            />
          ))}
        </div>
      )}
    </section>
  );
}