import { useState } from "react";
import { useAgentSocket, type AgentDecision } from "../hooks/useAgentSocket";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPE_LABELS: Record<AgentDecision["type"], string> = {
  prioritize_dubbing: "Prioritize dubbing",
  recut_scene: "Recut scene",
  boost_market: "Boost market",
  monitor: "Monitor",
};

const STATUS_STYLES: Record<AgentDecision["status"], string> = {
  pending: "bg-marquee/15 text-marquee border-marquee/30",
  accepted: "bg-scope/15 text-scope border-scope/30",
  rejected: "bg-tally/15 text-tally border-tally/30",
};

function DecisionCard({
  decision,
  onAccept,
  onReject,
}: {
  decision: AgentDecision;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <Card className="bg-surface border-border">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base font-mono">{decision.titleId}</CardTitle>
        <Badge className={`border font-mono ${STATUS_STYLES[decision.status]}`}>
          {decision.status}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm font-medium">{TYPE_LABELS[decision.type]}</p>
        <p className="text-sm text-muted-foreground">{decision.summary}</p>
        <p className="text-xs text-muted-foreground">{decision.reasoning}</p>
      </CardContent>
      {decision.status === "pending" && (
        <CardFooter className="gap-2">
          <Button
            size="sm"
            onClick={onAccept}
            className="bg-scope hover:bg-scope/90 text-void font-mono"
          >
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onReject}
            className="border-tally/40 text-tally hover:bg-tally/10 font-mono"
          >
            Reject
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

export function RecommendationsPanel() {
  const { decisions, connected, sendAction } = useAgentSocket();
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredDecisions = decisions.filter(
    (d) => statusFilter === "all" || d.status === statusFilter
  );

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold">Agent recommendations</h2>
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