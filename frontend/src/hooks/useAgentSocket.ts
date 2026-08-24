import { useEffect, useRef, useState, useCallback } from "react";
import type { AgentDecision } from "../../../packages/shared/src/types";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3000";
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

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

  useEffect(() => {
  fetch(`${API_URL}/api/decisions`)
    .then((res) => {
      if (!res.ok) throw new Error(`GET /api/decisions ${res.status}`);
      return res.json();
    })
    .then((initial: AgentDecision[]) => {
      setDecisions((prev) => {
        // Merge fetched history with anything the WebSocket already
        // delivered while this request was in flight, dedup by id,
        // most recent first.
        const merged = new Map(initial.map((d) => [d.id, d]));
        for (const d of prev) merged.set(d.id, d);
        return Array.from(merged.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
    })
    .catch((err) => console.error("[useAgentSocket] failed to fetch decision history:", err));
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