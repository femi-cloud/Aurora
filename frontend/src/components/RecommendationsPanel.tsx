import { useState } from "react";
import { useAgentSocket} from "../hooks/useAgentSocket";
import type { AgentDecision } from "../../../packages/shared/src/types";
import { DecisionCard, STATUS_STYLES } from "./DecisionCard";
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

  const filteredDecisions = decisions.filter(
    (d) => statusFilter === "all" || d.status === statusFilter
  );

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold font-display tracking-tight text-ink">Agent recommendations</h2>
        <div className="flex items-center gap-3">
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