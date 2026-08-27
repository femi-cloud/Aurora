import type { AgentDecision } from "../../../packages/shared/src/types";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTitles } from "../hooks/useTitles";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const TYPE_LABELS: Record<AgentDecision["type"], string> = {
  prioritize_dubbing: "Prioritize dubbing",
  recut_scene: "Recut scene",
  boost_market: "Boost market",
  monitor: "Monitor",
};

export const STATUS_STYLES: Record<AgentDecision["status"], string> = {
  pending: "bg-marquee/15 text-marquee border-marquee/30",
  accepted: "bg-scope/15 text-scope border-scope/30",
  rejected: "bg-tally/15 text-tally border-tally/30",
};

export function DecisionCard({
  decision,
  onAccept,
  onReject,
}: {
  decision: AgentDecision;
  onAccept?: () => void;
  onReject?: () => void;
}) {
  const { titles } = useTitles();
  const titleName = titles.find((t) => t.title_id === decision.titleId)?.title_name ?? decision.titleId;
  return (
    <Card className="bg-surface border-border">
    <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <CardTitle className="text-base font-mono">{titleName}</CardTitle>
          <p className="text-xs text-muted-foreground font-mono">
            {formatDateTime(decision.createdAt)}
            {decision.updatedAt && decision.updatedAt !== decision.createdAt && (
              <> · updated {formatDateTime(decision.updatedAt)}</>
            )}
          </p>
        </div>
        <Badge className={`border font-mono ${STATUS_STYLES[decision.status]}`}>
          {decision.status}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm font-medium">{TYPE_LABELS[decision.type]}</p>
        <p className="text-sm text-muted-foreground">{decision.summary}</p>
        <p className="text-xs text-muted-foreground">{decision.reasoning}</p>
      </CardContent>
      {decision.status === "pending" && onAccept && onReject && (
        <CardFooter className="gap-2">
          <Button size="sm" onClick={onAccept} className="bg-scope hover:bg-scope/90 text-void font-mono">
            Accept
          </Button>
          <Button size="sm" variant="outline" onClick={onReject} className="border-tally/40 text-tally hover:bg-tally/10 font-mono">
            Reject
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}