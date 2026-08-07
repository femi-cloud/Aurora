CREATE TABLE IF NOT EXISTS audience_events (
    event_time DateTime,
    title_id String,
    region String,
    seconds_watched UInt32,
    drop_off UInt8,
    device String
) ENGINE = MergeTree()
ORDER BY (title_id, event_time);