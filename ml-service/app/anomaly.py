import pandas as pd
from sklearn.ensemble import IsolationForest

def detect_anomalies(rows: list[dict], contamination: float = 0.05):
    """
    Takes the list of points (minute, title_id, region, viewers, dropoffs, avg_watched)
    and returns the points flagged as abnormal by the isolation forest.

    contamination = expected proportion of anomalies in the data (0.05 = 5%).
    This is an approximate setting, not an exact science.
    """
    if len(rows) < 10:
        # Not enough points for a statistical model to make sense
        return []

    df = pd.DataFrame(rows)
    df["drop_off_rate"] = df["dropoffs"] / df["viewers"]

    features = df[["viewers", "drop_off_rate", "avg_watched"]]

    model = IsolationForest(contamination=contamination, random_state=42)
    df["anomaly_score"] = model.fit_predict(features)
    # fit_predict returns -1 for an anomaly, 1 for a normal point

    anomalies = df[df["anomaly_score"] == -1]

    return anomalies.drop(columns=["anomaly_score"]).to_dict(orient="records")