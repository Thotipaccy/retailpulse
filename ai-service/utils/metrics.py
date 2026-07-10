import numpy as np


def calculate_mape(actual: np.ndarray, predicted: np.ndarray) -> float:
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    mask = actual != 0
    if not mask.any():
        return 0.0
    return float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100)


def risk_level_from_probability(probability: float, thresholds: dict) -> str:
    if probability >= thresholds.get("high", 0.90):
        return "critical"
    if probability >= thresholds.get("medium", 0.70):
        return "high"
    if probability >= thresholds.get("low", 0.40):
        return "medium"
    return "low"


def churn_risk_level(probability: float) -> str:
    if probability >= 0.90:
        return "critical"
    if probability >= 0.70:
        return "high"
    if probability >= 0.40:
        return "medium"
    return "low"


def stockout_risk_level(days_until: float) -> str:
    if days_until < 1:
        return "critical"
    if days_until < 3:
        return "high"
    if days_until < 7:
        return "medium"
    return "low"
