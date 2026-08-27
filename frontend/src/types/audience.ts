export interface SnapshotRow {
  title_id: string;
  title_name: string;
  region: string;
  viewer_count: number;
  drop_off_count: number;
  avg_seconds_watched: number;
}

export interface TimelineRow {
  minute: string;
  title_id: string;
  title_name: string;
  region: string;
  viewer_count: number;
  drop_off_count: number;
  avg_seconds_watched: number;
}

export interface RegionalRow {
  region: string;
  viewer_count: number;
  drop_off_count: number;
  avg_seconds_watched: number;
}

export interface AnomalyRow {
  title_id: string;
  title_name: string;
  region: string;
  viewer_count: number;
  current_rate: number;
  baseline_rate: number;
  deviation: number;
  poster_url: string | null;
}

export interface AnomalyLogRow {
  id: string;
  titleId: string;
  region: string;
  decisionId: string | null;
  status: "opened" | "closed";
  openedAt: string;
  closedAt: string | null;
  updatedAt: string;
}

export interface TitleMetadataRow {
  title_id: string;
  title_name: string;
  poster_url: string | null;
}