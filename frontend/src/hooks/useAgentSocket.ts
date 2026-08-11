import { useEffect, useRef, useState, useCallback } from "react";

// Mirrors AgentDecision from packages/shared/src/types.ts
// (kept local — see backend/src/agent/decisionEngine.ts for why).
export interface AgentDecision {
  id: string;
  createdAt: string;
  titleId: string;
  type: "prioritize_dubbing" | "recut_scene" | "boost_market" | "monitor";
  summary: string;
  reasoning: string;
  status: "pending" | "accepted" | "rejected";
}

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001";

export function useAgentSocket() {
  const [decisions, setDecisions] = useState<AgentDecision[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "decision") {
        const decision: AgentDecision = message.decision;
        setDecisions((prev) => {
          const existingIndex = prev.findIndex((d) => d.id === decision.id);
          if (existingIndex === -1) return [decision, ...prev];
          const next = [...prev];
          next[existingIndex] = decision;
          return next;
        });
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  const sendAction = useCallback(
    (decisionId: string, action: "accept" | "reject") => {
      socketRef.current?.send(JSON.stringify({ decisionId, action }));
      // Optimistic local update — the backend loop may later confirm
      // via a rebroadcast of the updated decision.
      setDecisions((prev) =>
        prev.map((d) =>
          d.id === decisionId
            ? { ...d, status: action === "accept" ? "accepted" : "rejected" }
            : d
        )
      );
    },
    []
  );

  return { decisions, connected, sendAction };
}