CREATE TABLE IF NOT EXISTS aurora.agent_decisions
(
    id String,
    created_at DateTime,
    updated_at DateTime,
    title_id String,
    type String,
    summary String,
    reasoning String,
    reasoning_trail String,
    status String
)
ENGINE = MergeTree()
ORDER BY (id, updated_at);