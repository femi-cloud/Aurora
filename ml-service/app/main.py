from fastapi import FastAPI
from app.queries import get_recent_minutely_stats, get_raw_events
from app.anomaly import detect_anomalies
from app.dropoff_model import train_dropoff_model, predict_dropoff_probability
from app.clickhouse_client import get_client

app = FastAPI(title="Aurora ML Service")

@app.on_event("startup")
def startup_event():
    rows = get_raw_events(5000)
    if len(rows) >= 50:
        result = train_dropoff_model(rows)
        print(f"[startup] model trained automatically: {result}")
    else:
        print("[startup] not enough data to train, wait for the simulator to run for a bit")


@app.get("/health")
def health_check():
    try:
        client = get_client()
        result = client.query("SELECT count() FROM audience_events")
        count = result.result_rows[0][0]
        return {"status": "ok", "clickhouse_connected": True, "event_count": count}
    except Exception as e:
        return {"status": "error", "clickhouse_connected": False, "detail": str(e)}


@app.get("/anomalies")
def anomalies(window_minutes: int = 30):
    rows = get_recent_minutely_stats(window_minutes)
    return detect_anomalies(rows)


@app.post("/train")
def train():
    rows = get_raw_events(5000)
    return train_dropoff_model(rows)


@app.get("/predict/dropoff")
def predict(title_id: str, region: str, device: str):
    return predict_dropoff_probability(title_id, region, device)