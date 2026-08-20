import numpy as np


def calculate_mape(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Raw MAPE (can exceed 100 on tiny actuals)."""
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    mask = actual != 0
    if not mask.any():
        return 0.0
    return float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100)


def calculate_mape_capped(actual: np.ndarray, predicted: np.ndarray, cap: float = 100.0) -> float:
    """MAPE capped at `cap`% per sample to prevent explosion from near-zero actuals."""
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    mask = actual > 0
    if not mask.any():
        return cap
    per_sample = np.abs((actual[mask] - predicted[mask]) / actual[mask]) * 100
    per_sample = np.minimum(per_sample, cap)  # cap each sample
    return float(np.mean(per_sample))


def calculate_smape(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Symmetric MAPE — handles zero actuals without division-by-zero. Range: [0, 200]."""
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    denom = np.abs(actual) + np.abs(predicted)
    # Where both are zero: error = 0
    mask = denom > 0
    if not mask.any():
        return 0.0
    per_sample = 2.0 * np.abs(actual[mask] - predicted[mask]) / denom[mask] * 100
    return float(np.mean(per_sample))


def calculate_weekly_precision(y_val: np.ndarray, g_pred: np.ndarray, n: int = 7) -> float:
    """
    Estimate 7-day forecast precision using sMAPE on the last `n` validation points.
    sMAPE handles zero actuals correctly (both zero = perfect, one zero = large error).
    Returns a value in [0, 100].
    """
    if len(y_val) == 0 or len(g_pred) == 0:
        return 0.0
    tail_actual = y_val[-n:]
    tail_pred = g_pred[-n:]
    smape = calculate_smape(tail_actual, tail_pred)
    # sMAPE range is [0, 200], scale to [0, 100] precision
    precision = max(0.0, 100.0 - (smape / 2.0))
    return round(precision, 1)


def calculate_seasonal_score(df) -> float:
    """
    Measure how well the model's expected seasonal multipliers align with actual
    monthly sales patterns in the training data.
    Returns Pearson R² × 100 as a percentage in [0, 100].
    """
    try:
        from data.feature_engineering import FeatureEngineer
        if "date" not in df.columns or "quantity" not in df.columns:
            return 0.0
        df = df.copy()
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        df = df.dropna(subset=["date", "quantity"])
        if df.empty:
            return 0.0
        df["month"] = df["date"].dt.month
        monthly_actual = df.groupby("month")["quantity"].mean()
        if len(monthly_actual) < 2:
            return 0.0
        multipliers = np.array([FeatureEngineer.seasonal_multiplier(m) for m in monthly_actual.index])
        actuals_norm = monthly_actual.values / (monthly_actual.values.mean() + 1e-9)
        corr = np.corrcoef(actuals_norm, multipliers)[0, 1]
        r_squared = corr ** 2 if not np.isnan(corr) else 0.0
        return round(float(r_squared) * 100, 1)
    except Exception:
        return 0.0


import pandas as pd  # noqa: E402 (needed for calculate_seasonal_score)


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
