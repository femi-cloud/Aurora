import { useAgentSocket, type AgentDecision } from "../hooks/useAgentSocket";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TYPE_LABELS: Record<AgentDecision["type"], string> = {
  prioritize_dubbing: "Prioritize dubbing",
  recut_scene: "Recut scene",
  boost_market: "Boost market",
  monitor: "Monitor",
};

const STATUS_VARIANTS: Record<
  AgentDecision["status"],
  "default" | "secondary" | "destructive"
> = {
  pending: "secondary",
  accepted: "default",
  rejected: "destructive",
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{decision.titleId}</CardTitle>
        <Badge variant={STATUS_VARIANTS[decision.status]}>
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
          <Button size="sm" onClick={onAccept}>
            Accept
          </Button>
          <Button size="sm" variant="outline" onClick={onReject}>
            Reject
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

export function RecommendationsPanel() {
  const { decisions, connected, sendAction } = useAgentSocket();

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Agent recommendations</h2>
        <Badge variant={connected ? "default" : "secondary"}>
          {connected ? "Live" : "Disconnected"}
        </Badge>
      </header>

      {decisions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No recommendations yet.
        </p>
      ) : (
        <div className="grid gap-3">
          {decisions.map((decision) => (
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