import type { SnapshotRow, TimelineRow, RegionalRow, AnomalyRow, TitleMetadataRow } from "../types/audience";

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Erreur API sur ${path}: ${response.status}`);
  }
  return response.json();
}

export function getSnapshot(windowMinutes?: number) {
  const query = windowMinutes ? `?windowMinutes=${windowMinutes}` : "";
  return fetchJson<SnapshotRow[]>(`/api/snapshot${query}`);
}

export function getTimeline(titleId?: string, region?: string, windowMinutes?: number) {
  const params = new URLSearchParams();
  if (titleId) params.set("titleId", titleId);
  if (region) params.set("region", region);
  if (windowMinutes) params.set("windowMinutes", String(windowMinutes));
  const query = params.toString() ? `?${params.toString()}` : "";
  return fetchJson<TimelineRow[]>(`/api/timeline${query}`);
}

export function getRegionalBreakdown(titleId: string, windowMinutes?: number) {
  const query = windowMinutes ? `?windowMinutes=${windowMinutes}` : "";
  return fetchJson<RegionalRow[]>(`/api/regional/${titleId}${query}`);
}

export function getAnomalies(deviationThreshold?: number) {
  const query = deviationThreshold ? `?deviationThreshold=${deviationThreshold}` : "";
  return fetchJson<AnomalyRow[]>(`/api/anomalies${query}`);
}

export function getTitles() {
  return fetchJson<TitleMetadataRow[]>("/api/titles");
}

export interface AgentSettings {
  anomalyScoreThreshold: number;
  deviationThreshold: number;
  baselineWindowMinutes: number;
  recentWindowMinutes: number;
  minViewers: number;
}

export function getSettings() {
  return fetchJson<AgentSettings>("/api/settings");
}

export async function updateSettings(settings: AgentSettings): Promise<AgentSettings> {
  const response = await fetch(`${API_BASE_URL}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `API Error on /api/settings: ${response.status}`);
  }
  return response.json();
}