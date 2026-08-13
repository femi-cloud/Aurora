import pandas as pd
from sklearn.ensemble import IsolationForest

def detect_anomalies(rows: list[dict], contamination: float = 0.05):
    """
    Prend la liste de points (minute, title_id, region, viewers, dropoffs, avg_watched)
    et retourne les points jugés anormaux par l'isolation forest.

    contamination = proportion attendue d'anomalies dans les données (0.05 = 5%).
    C'est un réglage approximatif, pas une science exacte.
    """
    if len(rows) < 10:
        # Pas assez de points pour qu'un modèle statistique ait du sens
        return []

    df = pd.DataFrame(rows)
    df["drop_off_rate"] = df["dropoffs"] / df["viewers"]

    features = df[["viewers", "drop_off_rate", "avg_watched"]]

    model = IsolationForest(contamination=contamination, random_state=42)
    df["anomaly_score"] = model.fit_predict(features)
    # fit_predict renvoie -1 pour une anomalie, 1 pour un point normal

    anomalies = df[df["anomaly_score"] == -1]

    return anomalies.drop(columns=["anomaly_score"]).to_dict(orient="records")