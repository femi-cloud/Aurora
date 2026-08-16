from app.clickhouse_client import get_client

def get_recent_minutely_stats(window_minutes: int = 30):
    """
    Fetches stats by (minute, title, region) over the last X minutes.
    Each row = a point the isolation forest can evaluate.
    """
    client = get_client()

    query = """
        SELECT
            minute,
            title_id,
            title_name,
            region,
            countMerge(viewer_count) AS viewers,
            sumMerge(drop_off_count) AS dropoffs,
            avgMerge(avg_seconds_watched) AS avg_watched
        FROM audience_stats_agg
        WHERE minute >= now() - INTERVAL {window_minutes:UInt32} MINUTE
        GROUP BY minute, title_id, title_name, region
        HAVING viewers >= 8
        ORDER BY minute ASC
    """

    result = client.query(query, parameters={"window_minutes": window_minutes})
    columns = result.column_names
    rows = result.result_rows

    return [dict(zip(columns, row)) for row in rows]

def get_raw_events(limit: int = 5000):
    """
    Fetches raw individual events, to train XGBoost.
    Takes the most recent ones, capped to avoid overloading training.
    """
    client = get_client()

    query = """
        SELECT
            title_id,
            region,
            device,
            seconds_watched,
            drop_off
        FROM audience_events
        ORDER BY event_time DESC
        LIMIT {limit:UInt32}
    """

    result = client.query(query, parameters={"limit": limit})
    columns = result.column_names
    rows = result.result_rows

    return [dict(zip(columns, row)) for row in rows]