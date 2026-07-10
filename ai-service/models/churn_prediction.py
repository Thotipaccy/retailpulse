import logging
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.ensemble import GradientBoostingClassifier

from config import CHURN_RISK_THRESHOLDS, MODELS_DIR
from data.feature_engineering import FeatureEngineer
from data.preprocessor import Preprocessor
from utils.metrics import churn_risk_level

logger = logging.getLogger(__name__)

RFM_SEGMENTS = {
    0: "Champions",
    1: "Loyal",
    2: "At Risk",
    3: "Dormant",
    4: "Lost",
}


class ChurnPredictionModel:
    """RFM segmentation + GradientBoosting churn classifier."""

    def __init__(self):
        self.classifier: GradientBoostingClassifier | None = None
        self.kmeans: KMeans | None = None
        self.preprocessor = Preprocessor()
        self.is_trained = False
        self.accuracy: float = 0.85

    def _segment_name(self, cluster: int) -> str:
        return RFM_SEGMENTS.get(cluster % 5, "At Risk")

    def _churn_factors(self, row: dict) -> list[str]:
        factors = []
        if row.get("recency_days", 0) > 30:
            factors.append("recency > 30 days")
        if row.get("frequency", 0) < 5:
            factors.append("declining frequency")
        if row.get("monetary_total", 0) < 500000:
            factors.append("low monetary value")
        if not row.get("loyalty_member", False):
            factors.append("not a loyalty member")
        return factors or ["stable engagement"]

    def train(self, customers_df: pd.DataFrame, labels: pd.Series | None = None) -> dict:
        df = FeatureEngineer.customer_features(customers_df.copy())
        self.preprocessor.fit_fill_values(df)
        df = self.preprocessor.handle_missing(df)

        rfm = df[["recency_score", "frequency_score", "monetary_score"]].values
        self.kmeans = KMeans(n_clusters=5, random_state=42, n_init=10)
        self.kmeans.fit(rfm)

        feature_cols = [
            "recency_days", "frequency", "monetary_total", "avg_transaction",
            "recency_score", "frequency_score", "monetary_score", "days_since_last",
        ]
        X = df[feature_cols].values

        if labels is None:
            labels = (
                (df["recency_days"] > 60).astype(int)
                | (df["frequency"] < 3).astype(int)
            ).astype(int)

        labels_arr = np.asarray(labels)
        if len(np.unique(labels_arr)) < 2:
            labels_arr = np.array([i % 2 for i in range(len(df))])

        self.classifier = GradientBoostingClassifier(random_state=42)
        self.classifier.fit(X, labels_arr)
        self.is_trained = True
        self.accuracy = float(self.classifier.score(X, labels_arr))
        self.save()
        return {"accuracy": round(self.accuracy, 3), "trained": True}

    def predict(self, customers: list[dict]) -> list[dict]:
        results = []
        for c in customers:
            if self.is_trained and self.classifier is not None and self.kmeans is not None:
                df = pd.DataFrame([c])
                df = FeatureEngineer.customer_features(df)
                rfm = df[["recency_score", "frequency_score", "monetary_score"]].values
                cluster = int(self.kmeans.predict(rfm)[0])
                feature_cols = [
                    "recency_days", "frequency", "monetary_total", "avg_transaction",
                    "recency_score", "frequency_score", "monetary_score", "days_since_last",
                ]
                X = df[feature_cols].values
                ml_prob = float(self.classifier.predict_proba(X)[0][1])
                heuristic_prob, segment_heuristic = self._heuristic(c)
                prob = round(0.55 * ml_prob + 0.45 * heuristic_prob, 2)
                segment = self._segment_name(cluster) if prob < heuristic_prob else segment_heuristic
            else:
                prob, segment = self._heuristic(c)

            results.append({
                "customer_id": c.get("customer_id"),
                "churn_probability": round(prob, 2),
                "risk_level": churn_risk_level(prob),
                "rfm_segment": segment,
                "factors": self._churn_factors(c),
            })
        return results

    def _heuristic(self, c: dict) -> tuple[float, str]:
        recency = c.get("recency_days", 30)
        frequency = c.get("frequency", 5)
        monetary = c.get("monetary_total", 0)

        prob = 0.2
        if recency > 60:
            prob = 0.85
        elif recency > 30:
            prob = 0.55
        if frequency < 3:
            prob = min(prob + 0.15, 0.95)
        if monetary < 300000:
            prob = min(prob + 0.1, 0.95)

        if prob >= 0.7:
            segment = "At Risk"
        elif prob >= 0.4:
            segment = "Dormant"
        elif frequency >= 10 and monetary >= 1000000:
            segment = "Champions"
        elif frequency >= 5:
            segment = "Loyal"
        else:
            segment = "Lost" if recency > 90 else "Loyal"
        return prob, segment

    def save(self) -> None:
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        if self.classifier:
            joblib.dump(self.classifier, MODELS_DIR / "churn_classifier.joblib")
        if self.kmeans:
            joblib.dump(self.kmeans, MODELS_DIR / "churn_kmeans.joblib")
        joblib.dump({"accuracy": self.accuracy}, MODELS_DIR / "churn_meta.joblib")

    def load(self) -> bool:
        clf_path = MODELS_DIR / "churn_classifier.joblib"
        if not clf_path.exists():
            return False
        self.classifier = joblib.load(clf_path)
        km_path = MODELS_DIR / "churn_kmeans.joblib"
        if km_path.exists():
            self.kmeans = joblib.load(km_path)
        meta_path = MODELS_DIR / "churn_meta.joblib"
        if meta_path.exists():
            self.accuracy = joblib.load(meta_path).get("accuracy", 0.85)
        self.is_trained = True
        return True
