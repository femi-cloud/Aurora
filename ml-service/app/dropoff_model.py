import pandas as pd
from xgboost import XGBClassifier

_model = None
_feature_columns = None

def train_dropoff_model(rows: list[dict]):
    """
    Trains an XGBoost model to predict drop_off from title_id, region, device.
    The trained model is kept in memory (module-level globals) so it can be
    reused by predict_dropoff_probability without retraining on every request.
    """
    global _model, _feature_columns

    df = pd.DataFrame(rows)

    X = pd.get_dummies(df[["title_id", "region", "device"]])
    y = df["drop_off"]

    _feature_columns = X.columns.tolist()

    _model = XGBClassifier(
        n_estimators=100,
        max_depth=4,
        eval_metric="logloss",
        random_state=42,
    )
    _model.fit(X, y)

    return {"status": "trained", "samples": len(df), "features": len(_feature_columns)}


def predict_dropoff_probability(title_id: str, region: str, device: str):
    """
    Predicts the drop-off probability for a given combination.
    """
    if _model is None:
        raise RuntimeError("The model hasn't been trained yet. Call /train first.")

    input_row = pd.DataFrame([{"title_id": title_id, "region": region, "device": device}])
    input_encoded = pd.get_dummies(input_row)

    # Aligns columns with those seen during training
    # (if a category wasn't in the training data, it's set to 0)
    input_encoded = input_encoded.reindex(columns=_feature_columns, fill_value=0)

    probability = _model.predict_proba(input_encoded)[0][1]  # probability of class "drop_off = 1"

    return {
        "title_id": title_id,
        "region": region,
        "device": device,
        "drop_off_probability": round(float(probability), 3),
    }