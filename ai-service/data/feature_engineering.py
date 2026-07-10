import numpy as np
import pandas as pd

from config import CONSTRUCTION_SEASON_MONTHS, RAINY_SEASON_MONTHS


class FeatureEngineer:
    """Time-series and customer feature engineering."""

    @staticmethod
    def add_time_features(df: pd.DataFrame, date_col: str = "date") -> pd.DataFrame:
        out = df.copy()
        out[date_col] = pd.to_datetime(out[date_col])
        out["day_of_week"] = out[date_col].dt.dayofweek
        out["month"] = out[date_col].dt.month
        out["quarter"] = out[date_col].dt.quarter
        out["is_weekend"] = (out["day_of_week"] >= 5).astype(int)
        out["is_month_end"] = out[date_col].dt.is_month_end.astype(int)
        out["is_construction_season"] = out["month"].isin(CONSTRUCTION_SEASON_MONTHS).astype(int)
        out["is_rainy_season"] = out["month"].isin(RAINY_SEASON_MONTHS).astype(int)
        return out

    @staticmethod
    def add_lag_features(df: pd.DataFrame, value_col: str = "quantity", group_col: str | None = None) -> pd.DataFrame:
        out = df.copy().sort_values("date")
        if group_col and group_col in out.columns:
            for lag in (1, 7, 30):
                out[f"lag_{lag}"] = out.groupby(group_col)[value_col].shift(lag)
            out["rolling_mean_7"] = out.groupby(group_col)[value_col].transform(
                lambda s: s.rolling(7, min_periods=1).mean()
            )
            out["rolling_mean_30"] = out.groupby(group_col)[value_col].transform(
                lambda s: s.rolling(30, min_periods=1).mean()
            )
            out["rolling_std_7"] = out.groupby(group_col)[value_col].transform(
                lambda s: s.rolling(7, min_periods=1).std().fillna(0)
            )
        else:
            for lag in (1, 7, 30):
                out[f"lag_{lag}"] = out[value_col].shift(lag)
            out["rolling_mean_7"] = out[value_col].rolling(7, min_periods=1).mean()
            out["rolling_mean_30"] = out[value_col].rolling(30, min_periods=1).mean()
            out["rolling_std_7"] = out[value_col].rolling(7, min_periods=1).std().fillna(0)
        return out.bfill().ffill()

    @staticmethod
    def forecast_feature_columns() -> list[str]:
        return [
            "day_of_week", "month", "quarter", "lag_7", "lag_30",
            "rolling_mean_7", "rolling_mean_30", "is_weekend",
            "is_construction_season", "is_rainy_season",
        ]

    @staticmethod
    def _score_column(series: pd.Series, default: int = 3) -> pd.Series:
        if len(series) < 5:
            return pd.Series([default] * len(series), index=series.index)
        try:
            return pd.qcut(series.rank(method="first"), 5, labels=False, duplicates="drop") + 1
        except ValueError:
            return pd.Series([default] * len(series), index=series.index)

    @staticmethod
    def customer_features(df: pd.DataFrame) -> pd.DataFrame:
        out = df.copy()
        out["recency_score"] = FeatureEngineer._score_column(out["recency_days"])
        out["frequency_score"] = FeatureEngineer._score_column(out["frequency"])
        out["monetary_score"] = FeatureEngineer._score_column(out["monetary_total"])
        out["days_since_last"] = out["recency_days"]
        return out

    @staticmethod
    def seasonal_multiplier(month: int) -> float:
        if month in CONSTRUCTION_SEASON_MONTHS:
            return 1.15
        if month in RAINY_SEASON_MONTHS:
            return 0.92
        return 1.0
