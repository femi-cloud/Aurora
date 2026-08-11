import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";

// Mirrors AgentDecision from packages/shared/src/types.ts
// (see decisionEngine.ts for why this isn't imported directly).
interface AgentDecision {
  id: string;
  createdAt: string;
  titleId: string;
  type: "prioritize_dubbing" | "recut_scene" | "boost_market" | "monitor";
  summary: string;
  reasoning: string;
  status: "pending" | "accepted" | "rejected";
}

interface ClientAction {
  decisionId: string;
  action: "accept" | "reject";
}

type ActionHandler = (action: ClientAction) => void;

let wss: WebSocketServer | null = null;
const actionHandlers: ActionHandler[] = [];

/**
 * Attaches a WebSocket server to the existing HTTP server (same port as Express).
 * Call once from index.ts, after the HTTP server is created but before listen().
 */
export function attachWebSocketServer(httpServer: Server): WebSocketServer {
  wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (socket) => {
    console.log("Client connected to agent socket");

    socket.on("message", (raw) => {
      try {
        const action = JSON.parse(raw.toString()) as ClientAction;
        actionHandlers.forEach((handler) => handler(action));
      } catch (err) {
        console.error("Invalid message from client:", err);
      }
    });

    socket.on("close", () => {
      console.log("Client disconnected from agent socket");
    });
  });

  return wss;
}

/**
 * Broadcasts a new or updated decision to every connected client.
 * Called by decisionEngine.ts (or whatever loop drives it) each time
 * a new AgentDecision is generated.
 */
export function broadcastDecision(decision: AgentDecision): void {
  if (!wss) return;
  const payload = JSON.stringify({ type: "decision", decision });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

/**
 * Registers a callback fired whenever a client accepts/rejects a decision.
 * This is how a frontend action loops back to the agent for the next cycle.
 */
export function onClientAction(handler: ActionHandler): void {
  actionHandlers.push(handler);
}