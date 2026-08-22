import numpy as np
import pandas as pd

from config import CONSTRUCTION_SEASON_MONTHS, RAINY_SEASON_MONTHS


class FeatureEngineer:
    """Time-series and customer feature engineering."""

    @staticmethod
    def build_daily_series(
        sales_df: pd.DataFrame,
        date_col: str = "date",
        value_col: str = "quantity",
        max_age_days: int = 731,
    ) -> pd.Series:
        """
        Aggregate transactions into a continuous daily total-demand series.
        Missing dates are filled with 0 (store was open with no sales of record).
        Dates older than `max_age_days` relative to the newest record are dropped —
        placeholder dates (e.g. 2000-01-01) from bad imports otherwise stretch the
        timeline with years of artificial zeros.
        """
        dates = pd.to_datetime(sales_df[date_col], errors="coerce").dt.normalize()
        s = sales_df.assign(_d=dates, _q=pd.to_numeric(sales_df[value_col], errors="coerce").fillna(0))
        s = s.groupby("_d")["_q"].sum().sort_index()
        s = s.astype(float)
        if not s.empty:
            cutoff = s.index.max() - pd.Timedelta(days=max_age_days)
            dropped = int((s.index < cutoff).sum())
            if dropped:
                import logging

                logging.getLogger(__name__).info(
                    "Dropped %d day-groups older than %s (placeholder/corrupt dates)", dropped, cutoff.date()
                )
                s = s[s.index >= cutoff]
            full_range = pd.date_range(s.index.min(), s.index.max(), freq="D")
            s = s.reindex(full_range, fill_value=0.0)
            s.index.name = "date"
        return s

    @staticmethod
    def add_demand_lags(series: pd.Series) -> pd.DataFrame:
        """
        Leak-free features for NEXT-day demand forecasting on a daily series.
        All rolling windows use .shift(1) so the current value never leaks
        into its own prediction row.
        """
        df = pd.DataFrame({"quantity": series.astype(float)})
        df.index = pd.to_datetime(df.index)
        for lag in (1, 7, 14, 28):
            df[f"lag_{lag}"] = df["quantity"].shift(lag)
        shifted = df["quantity"].shift(1)
        df["rolling_mean_7"] = shifted.rolling(7, min_periods=3).mean()
        df["rolling_mean_28"] = shifted.rolling(28, min_periods=7).mean()
        df["rolling_std_7"] = shifted.rolling(7, min_periods=3).std().fillna(0.0)
        df["day_of_week"] = df.index.dayofweek
        df["month"] = df.index.month
        df["quarter"] = df.index.quarter
        df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
        # Rwandan hardware stores see month-end payday demand spikes
        df["is_month_end_window"] = ((df.index.day >= 26) | (df.index.day <= 2)).astype(int)
        df["is_construction_season"] = df.index.month.isin(CONSTRUCTION_SEASON_MONTHS).astype(int)
        df["is_rainy_season"] = df.index.month.isin(RAINY_SEASON_MONTHS).astype(int)
        return df

    @staticmethod
    def forecast_feature_columns() -> list[str]:
        return [
            "lag_1", "lag_7", "lag_14", "lag_28",
            "rolling_mean_7", "rolling_mean_28", "rolling_std_7",
            "day_of_week", "month", "quarter", "is_weekend",
            "is_month_end_window", "is_construction_season", "is_rainy_season",
        ]

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
