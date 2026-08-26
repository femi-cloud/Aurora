import clickhouse_connect
from app.config import CLICKHOUSE_HOST, CLICKHOUSE_PORT, CLICKHOUSE_DB, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD

_client = None

def get_client():
    """
    Returns a shared ClickHouse client, created once and reused across
    requests. Avoids opening a new connection on every call — with
    /anomalies polled every 45s by the orchestrator, per-call connections
    were never closed and could exhaust the trial's connection limit
    over a few hours of uptime.
    """
    global _client
    if _client is None:
        _client = clickhouse_connect.get_client(
            host=CLICKHOUSE_HOST,
            port=CLICKHOUSE_PORT,
            database=CLICKHOUSE_DB,
            username=CLICKHOUSE_USER,
            password=CLICKHOUSE_PASSWORD,
        )
    return _client