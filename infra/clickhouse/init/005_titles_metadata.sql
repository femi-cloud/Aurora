CREATE TABLE IF NOT EXISTS aurora.titles
(
    title_id String,
    title_name String,
    poster_url Nullable(String),
    updated_at DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY title_id;