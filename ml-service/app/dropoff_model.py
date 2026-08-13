import pandas as pd
from xgboost import XGBClassifier

_model = None
_feature_columns = None

def train_dropoff_model(rows: list[dict]):
    """
    Entraîne un modèle XGBoost à prédire drop_off à partir de title_id, region, device.
    Le modèle entraîné est gardé en mémoire (variables globales du module) pour être
    réutilisé par predict_dropoff_probability sans se ré-entraîner à chaque requête.
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
    Prédit la probabilité de drop-off pour une combinaison donnée.
    """
    if _model is None:
        raise RuntimeError("Le modèle n'a pas encore été entraîné. Appelle /train d'abord.")

    input_row = pd.DataFrame([{"title_id": title_id, "region": region, "device": device}])
    input_encoded = pd.get_dummies(input_row)

    # Aligne les colonnes avec celles vues à l'entraînement
    # (si une catégorie n'était pas dans l'entraînement, on la met à 0)
    input_encoded = input_encoded.reindex(columns=_feature_columns, fill_value=0)

    probability = _model.predict_proba(input_encoded)[0][1]  # proba de la classe "drop_off = 1"

    return {
        "title_id": title_id,
        "region": region,
        "device": device,
        "drop_off_probability": round(float(probability), 3),
    }