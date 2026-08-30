CREATE TABLE IF NOT EXISTS aurora.agent_settings
(
    id String,
    anomaly_score_threshold Float32,
    deviation_threshold Float32,
    baseline_window_minutes UInt32,
    recent_window_minutes UInt32,
    min_viewers UInt32,
    updated_at DateTime
)
ENGINE = MergeTree()
ORDER BY (id, updated_at);