export interface AudienceEvent {
  eventTime: string; // ISO timestamp
  titleId: string;
  region: string;
  secondsWatched: number;
  dropOff: 0 | 1;
  device: string;
}

export interface DecisionStep {
  id: string;
  label: "Anomaly Detected" | "Regional Context" | "Drop-off Prediction" | "Decision";
  detail: string;
}

export interface AgentDecision {
  id: string;
  createdAt: string;
  updatedAt: string;
  titleId: string;
  region: string;
  type: "prioritize_dubbing" | "recut_scene" | "boost_market" | "monitor";
  summary: string;
  reasoning: string;
  reasoningTrail: DecisionStep[];
  status: "pending" | "accepted" | "rejected";
}

export interface AnomalyEvent {
  id: string; // keyFor(titleId, region), e.g. "tt123:FR"
  titleId: string;
  region: string;
  decisionId: string | null;
  status: "opened" | "closed";
  openedAt: string; // ISO timestamp
  closedAt: string | null;
  updatedAt: string; // ISO timestamp
}