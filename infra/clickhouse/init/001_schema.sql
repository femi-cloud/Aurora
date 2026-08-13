-- 1. Table source (événements bruts)
CREATE TABLE IF NOT EXISTS aurora.audience_events (
    event_time DateTime,
    title_id String,
    title_name String,
    region String,
    seconds_watched UInt32,
    drop_off UInt8,
    device String,
    is_anomaly UInt8
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (title_id, region, event_time);

-- 2. Table d'agrégats (alimentée par la vue ci-dessous)
CREATE TABLE IF NOT EXISTS aurora.audience_stats_agg
(
    minute DateTime,
    title_id String,
    title_name String,
    region String,
    viewer_count AggregateFunction(count, UInt8),
    drop_off_count AggregateFunction(sum, UInt8),
    avg_seconds_watched AggregateFunction(avg, UInt32)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(minute)
ORDER BY (title_id, title_name, region, minute);

-- 3. Vue matérialisée (le lien automatique entre les deux)
CREATE MATERIALIZED VIEW IF NOT EXISTS aurora.audience_stats_mv
TO aurora.audience_stats_agg
AS
SELECT
    toStartOfMinute(event_time) AS minute,
    title_id,
    title_name,
    region,
    countState() AS viewer_count,
    sumState(drop_off) AS drop_off_count,
    avgState(seconds_watched) AS avg_seconds_watched
FROM aurora.audience_events
GROUP BY minute, title_id, title_name, region;