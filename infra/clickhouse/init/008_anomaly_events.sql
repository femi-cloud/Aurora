CREATE TABLE IF NOT EXISTS aurora.anomaly_events
(
    id String,                     -- keyFor(title_id, region), ex: "tt123:FR"
    title_id String,
    region String,
    decision_id Nullable(String),  -- lien logique vers agent_decisions.id, rempli à la fermeture
    status String,                 -- 'opened' | 'closed'
    opened_at DateTime,
    closed_at Nullable(DateTime),
    updated_at DateTime
)
ENGINE = MergeTree()
ORDER BY (id, updated_at);