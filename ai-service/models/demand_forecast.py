import logging
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler

from config import (
    ENSEMBLE_WEIGHTS,
    GBOOST_FORECAST_PARAMS,
    LSTM_BATCH_SIZE,
    LSTM_EPOCHS,
    LSTM_SEQUENCE_LENGTH,
    MODELS_DIR,
    RECENCY_HALF_LIFE_DAYS,
    SPIKE_CAP_FACTOR,
    TRAINING_WINDOW_DAYS,
)
from data.feature_engineering import FeatureEngineer
from utils.metrics import (
    calculate_smape,
    calculate_wape,
    seasonality_strength,
)

logger = logging.getLogger(__name__)

try:
    import tensorflow as tf
    from tensorflow.keras import Sequential
    from tensorflow.keras.layers import LSTM, Dense, Dropout

    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    logger.warning("TensorFlow not available — LSTM forecasts will use GBoost only")


class DemandForecastModel:
    """
    Enterprise-style demand forecaster.

    Strategy: forecast AGGREGATE daily store demand (stable signal), then
    disaggregate to products by recent demand share. Per-SKU direct forecasting
    on sparse single-store data produces unusable error rates — aggregation is
    how production retail systems handle it.

    Features are strictly leak-free (rolling windows shifted by one day).
    Accuracy is reported with WAPE (retail industry standard).
    Ensemble: GradientBoosting (primary) + optional scaled-input LSTM.
    """

    def __init__(self):
        self.gboost: GradientBoostingRegressor | None = None
        self.lstm = None
        self.scaler: StandardScaler | None = None
        self.lstm_sequence_length: int = LSTM_SEQUENCE_LENGTH
        self.feature_columns: list[str] = FeatureEngineer.forecast_feature_columns()
        self._lag_fill: dict[str, float] = {}
        self._log_target: bool = True
        # Validation metrics (WAPE-based). Defaults signal "not yet trained".
        self.wape: float = 100.0
        self.daily_wape: float = 100.0
        self.smape: float = 100.0
        self.mape: float = 100.0  # legacy attr name; now holds WAPE value
        self.accuracy: float = 0.0
        self.weekly_precision: float = 0.0
        self.seasonal_score: float = 0.0
        self.seasonal_reliable: bool = False
        self.data_days: int = 0
        self.is_trained = False

    # ── Training ──────────────────────────────────────────────────────────

    def _prepare(self, series: pd.Series) -> pd.DataFrame:
        feat = FeatureEngineer.add_demand_lags(series)
        return feat

    def _apply_lag_fills(self, feat: pd.DataFrame, fills: dict[str, float] | None = None) -> pd.DataFrame:
        """Fill early-history NaNs in lag columns. Medians must come from the
        TRAINING slice only to avoid leaking validation information."""
        out = feat.copy()
        if fills is None:
            fills = {
                c: float(out[c].iloc[len(out) // 5 :].median())
                for c in self.feature_columns
                if c in out.columns and out[c].notna().any()
            }
            fills = {c: (v if np.isfinite(v) else 0.0) for c, v in fills.items()}
            self._lag_fill = fills
        for c in self.feature_columns:
            if c in out.columns:
                out[c] = pd.to_numeric(out[c], errors="coerce").fillna(fills.get(c, 0.0))
        return out

    def train(self, sales_df: pd.DataFrame) -> dict:
        full_series = FeatureEngineer.build_daily_series(sales_df)
        if len(full_series) < 21 or float(full_series.sum()) <= 0:
            return {"wape": self.wape, "accuracy": self.accuracy, "trained": False}

        # Learn the CURRENT business regime: volume shifts as a store grows and
        # tree models cannot extrapolate to levels they never saw.
        series = full_series.tail(TRAINING_WINDOW_DAYS)
        if len(series) < 30:
            series = full_series  # short-history store — use everything

        # Winsorize demand spikes (bulk-test imports, one-off mega orders):
        # cap each day at SPIKE_CAP_FACTOR × trailing 14-day median. Trailing
        # window keeps this leak-free.
        rolling_med = series.shift(1).rolling(14, min_periods=5).median()
        cap = (rolling_med * SPIKE_CAP_FACTOR).bfill()
        capped_days = int(((series > cap) & cap.notna()).sum())
        series = series.where(~(series > cap), cap)
        if capped_days:
            logger.info("Winsorized %d spike days above %.0fx trailing median", capped_days, SPIKE_CAP_FACTOR)

        feat = self._prepare(series)
        feat = feat.iloc[1:]  # first row has no lag_1

        split = int(len(feat) * 0.8)
        if split < 8 or len(feat) - split < 3:
            return {"wape": self.wape, "accuracy": self.accuracy, "trained": False}

        train_feat = self._apply_lag_fills(feat.iloc[:split])
        val_feat = self._apply_lag_fills(feat.iloc[split:], fills=self._lag_fill)

        X_train = train_feat[self.feature_columns].values
        y_raw = train_feat["quantity"].values
        X_val = val_feat[self.feature_columns].values
        y_val = val_feat["quantity"].values

        # Log-space target: relative accuracy survives demand-scale shifts,
        # and bulk-order spikes stop dominating the loss.
        y_train = np.log1p(y_raw)

        # Recency weighting: recent days matter more than month-old patterns
        ages = (train_feat.index[-1] - train_feat.index).days.values.astype(float)
        sample_weights = 0.5 ** (ages / RECENCY_HALF_LIFE_DAYS)

        self.gboost = GradientBoostingRegressor(**GBOOST_FORECAST_PARAMS)
        self.gboost.fit(X_train, y_train, sample_weight=sample_weights)
        g_pred = self._predict_raw(X_val)

        # Headline accuracy is measured on WEEKLY aggregated buckets — the
        # grain replenishment decisions run on. Single-day hardware-store
        # demand swings 0→700+ units between consecutive days, so daily-grain
        # percentages are noise even for perfect models.
        self.wape = round(self._bucketed_wape(y_val, g_pred, val_feat.index), 2)
        self.mape = self.wape  # legacy attribute consumed by status endpoints
        self.smape = round(calculate_smape(y_val, g_pred), 2)
        self.daily_wape = round(calculate_wape(y_val, g_pred), 2)
        self.accuracy = round(max(0.0, 100.0 - self.wape), 1)

        # Stable 7-day precision: rolling-origin recursive forecasts over the
        # last few weeks of validation data (averaged across week blocks).
        self.weekly_precision = self._rolling_origin_precision(series, split)

        # Data-driven seasonality strength on the FULL history (more months
        # of coverage than the training window)
        score, reliable = seasonality_strength(full_series)
        self.seasonal_score = score
        self.seasonal_reliable = reliable
        self.data_days = len(series)

        self._train_lstm(train_feat)

        self.is_trained = True
        self.save()
        return {
            "mape": self.wape,
            "wape": self.wape,
            "daily_wape": self.daily_wape,
            "smape": self.smape,
            "accuracy": self.accuracy,
            "weekly_precision": round(self.weekly_precision, 1),
            "seasonal_score": self.seasonal_score,
            "seasonal_reliable": self.seasonal_reliable,
            "data_days": self.data_days,
            "lstm_trained": self.lstm is not None,
            "trained": True,
        }

    def _rolling_origin_precision(self, series: pd.Series, split_idx: int) -> float:
        """Recursive 7-day-ahead forecasts evaluated over consecutive week blocks."""
        feat_full = self._apply_lag_fills(self._prepare(series))
        val_dates = feat_full.index[split_idx:]
        n_blocks = max(1, min(4, len(val_dates) // 7))
        precisions: list[float] = []
        for b in range(n_blocks):
            end = len(val_dates) - b * 7
            start = end - 7
            if start < 0 or end <= start:
                break
            block_dates = val_dates[start:end]
            history = series.loc[: block_dates[0] - pd.Timedelta(days=1)]
            if len(history) < 14:
                continue
            preds = np.maximum(np.array(self._recursive_forecast(history, 7)), 0.0)
            actuals = series.loc[block_dates].values.astype(float)
            smape_block = calculate_smape(actuals, preds)
            precisions.append(max(0.0, 100.0 - smape_block / 2.0))
        return round(float(np.mean(precisions)), 1) if precisions else 0.0

    def _train_lstm(self, train_feat: pd.DataFrame) -> None:
        """Experimental secondary model. Trained on log-targets for consistency;
        not yet blended into live forecasts (GBoost carries production accuracy)."""
        if not TF_AVAILABLE or len(train_feat) < 40:
            self.lstm = None
            self.scaler = None
            return
        try:
            X = train_feat[self.feature_columns].values
            y = np.log1p(train_feat["quantity"].values)
            self.scaler = StandardScaler().fit(X)
            X_scaled = self.scaler.transform(X)
            self.lstm_sequence_length = min(LSTM_SEQUENCE_LENGTH, max(7, len(X_scaled) // 2))
            xs, ys = self._lstm_sequences(X_scaled, y, self.lstm_sequence_length)
            if len(xs) == 0:
                self.lstm = None
                self.scaler = None
                return
            self.lstm = self._build_lstm(X.shape[1], self.lstm_sequence_length)
            epochs = min(LSTM_EPOCHS, max(15, len(xs)))
            self.lstm.fit(
                xs,
                ys,
                epochs=epochs,
                batch_size=min(LSTM_BATCH_SIZE, max(1, len(xs))),
                verbose=0,
            )
        except Exception as exc:
            logger.warning("LSTM training skipped: %s", exc)
            self.lstm = None
            self.scaler = None

    def _build_lstm(self, n_features: int, sequence_length: int | None = None):
        seq_len = sequence_length or self.lstm_sequence_length
        model = Sequential([
            LSTM(32, input_shape=(seq_len, n_features)),
            Dropout(0.2),
            Dense(16, activation="relu"),
            Dense(1),
        ])
        model.compile(optimizer="adam", loss="mse")
        return model

    def _lstm_sequences(self, X: np.ndarray, y: np.ndarray, sequence_length: int | None = None):
        seq_len = sequence_length or self.lstm_sequence_length
        xs, ys = [], []
        for i in range(len(X) - seq_len):
            xs.append(X[i : i + seq_len])
            ys.append(y[i + seq_len])
        return np.array(xs), np.array(ys)

    # ── Core predictions ─────────────────────────────────────────────────

    def _predict_raw(self, X: np.ndarray) -> np.ndarray:
        """Model output in raw demand units (inverse log1p transform)."""
        p = self.gboost.predict(X)
        if self._log_target:
            return np.maximum(np.expm1(p), 0.0)
        return np.maximum(p, 0.0)

    @staticmethod
    def _bucketed_wape(actual: np.ndarray, predicted: np.ndarray, dates: pd.DatetimeIndex, bucket_days: int = 7) -> float:
        """WAPE computed on non-overlapping `bucket_days` totals, aligned from
        the most recent day backwards."""
        df = pd.DataFrame({"actual": np.asarray(actual, dtype=float),
                           "predicted": np.asarray(predicted, dtype=float)}, index=dates)
        order = np.arange(len(df))
        bucket = (len(df) - 1 - order) // bucket_days
        totals = df.groupby(bucket).sum()
        return calculate_wape(totals["actual"].values, totals["predicted"].values)

    def _model_next_day(self, series: pd.Series) -> float | None:
        """One-step-ahead GBoost prediction for a daily aggregate series."""
        if self.gboost is None or not self.is_trained or len(series) < 10:
            return None
        try:
            row = self._apply_lag_fills(self._prepare(series)).iloc[[-1]]
            X = row[self.feature_columns].values.astype(float)
            if np.isnan(X).any():
                return None
            return float(self._predict_raw(X)[0])
        except Exception as exc:
            logger.warning("Model next-day prediction failed: %s", exc)
            return None

    def _recursive_forecast(self, series: pd.Series, steps: int) -> list[float]:
        """Multi-step forecast: each step's prediction feeds back as the next
        lag input. Calendar features come from real future dates."""
        working = series.copy()
        working.index = pd.to_datetime(working.index)
        preds: list[float] = []
        next_date = working.index[-1]
        for _ in range(steps):
            next_date = next_date + pd.Timedelta(days=1)
            row = self._apply_lag_fills(self._prepare(working)).iloc[[-1]]
            X = row[self.feature_columns].values.astype(float)
            if self.gboost is not None:
                yhat = float(self._predict_raw(X)[0])
            else:
                yhat = float(working.tail(7).mean())
            yhat = max(yhat, 0.0)
            preds.append(yhat)
            working.loc[next_date] = yhat
        return preds

    def predict_product(
        self,
        historical: list[dict],
        horizon: str = "weekly",
        product_id: int | str = 1,
        store_history: list[dict] | None = None,
    ) -> dict:
        if not historical:
            return self._fallback_single(product_id)

        df = pd.DataFrame(historical)
        if df.empty or "quantity" not in df.columns:
            return self._fallback_single(product_id)

        n_points = self._data_points(historical)
        margin_rate = self._confidence_margin_multiplier(n_points)
        effective_mape = self._effective_mape(n_points)

        product_series = FeatureEngineer.build_daily_series(df)
        steps = {"daily": 1, "weekly": 7, "monthly": 30}.get(horizon, 1)

        predicted_total: float | None = None

        # Preferred path: aggregate model × product's recent demand share
        if store_history and self.is_trained and self.gboost is not None:
            store_series = FeatureEngineer.build_daily_series(pd.DataFrame(store_history))
            product_recent = float(product_series.tail(28).mean())
            store_recent = float(store_series.tail(28).mean())
            if store_recent > 0 and len(store_series) >= 14 and product_recent > 0:
                share = min(max(product_recent / store_recent, 0.0), 1.0)
                preds = self._recursive_forecast(store_series, steps)
                predicted_total = float(np.sum(preds)) * share

        # Statistical fallback / refinement: weekday-aware weighted average of
        # the same weekday in recent weeks (captures weekly shopping rhythm
        # that a plain moving average smooths away).
        if predicted_total is None:
            predicted_total = self._statistical_forecast(product_series, steps)

        predicted_total *= FeatureEngineer.seasonal_multiplier(pd.Timestamp.now().month)
        predicted_total = max(predicted_total, 0.0)

        margin = predicted_total * margin_rate
        return {
            "product_id": product_id,
            "predicted_demand": round(predicted_total, 1),
            "confidence_lower": round(max(predicted_total - margin, 0), 1),
            "confidence_upper": round(predicted_total + margin, 1),
            "model_mape": round(effective_mape, 1),
        }

    def _statistical_forecast(self, series: pd.Series, steps: int) -> float:
        """Same-weekday weighted seasonal-average forecast. Works with very
        short histories and needs no ML model."""
        if series.empty or float(series.sum()) <= 0:
            return 0.0
        idx = pd.date_range(series.index[-1] + pd.Timedelta(days=1), periods=steps, freq="D")
        total = 0.0
        for date in idx:
            same_weekday = series[series.index.dayofweek == date.dayofweek].tail(4)
            if len(same_weekday) >= 2:
                weights = np.array([0.4, 0.3, 0.2, 0.1][-len(same_weekday):])
                day_pred = float((same_weekday.values * weights).sum())
            elif len(same_weekday) == 1:
                day_pred = float(same_weekday.iloc[0])
            else:
                day_pred = float(series.tail(min(14, len(series))).mean())
            total += max(day_pred, 0.0)
        return total

    # ── Chart time-series (UC03) ─────────────────────────────────────────

    def predict_uc03_timeseries(self, historical: list[dict], horizon: str = "daily") -> dict:
        """Past actuals + genuine multi-step model forecasts for the chosen horizon."""
        n_points = self._data_points(historical)
        margin_rate = self._confidence_margin_multiplier(n_points)
        effective_mape = self._effective_mape(n_points)

        df = pd.DataFrame(historical) if historical else pd.DataFrame()
        daily = pd.Series(dtype=float)
        if not df.empty and "date" in df.columns and "quantity" in df.columns:
            try:
                daily = FeatureEngineer.build_daily_series(df)
            except (ValueError, TypeError):
                daily = pd.Series(dtype=float)

        today = pd.Timestamp.now().normalize()

        if horizon == "weekly":
            past_weeks, future_weeks = 4, 4
        elif horizon == "monthly":
            past_weeks, future_weeks = 3, 3
        else:
            past_weeks, future_weeks = 7, 7

        chart: list[dict] = []

        if horizon == "weekly":
            for i in range(past_weeks - 1, -1, -1):
                end_day = today - pd.Timedelta(weeks=i)
                start_day = end_day - pd.Timedelta(days=6)
                actual = 0.0
                if len(daily):
                    for d in pd.date_range(start_day, end_day):
                        actual += float(daily.get(d, 0.0))
                else:
                    actual = float(daily.mean()) * 7 if len(daily) else 0.0
                chart.append({
                    "date": f"Wk -{i}" if i > 0 else "This Wk",
                    "actual": round(actual, 1),
                })
            preds = self._forecast_or_statistical(daily, 7 * future_weeks)
            for i in range(future_weeks):
                predicted = float(np.sum(preds[i * 7 : (i + 1) * 7]))
                margin = predicted * margin_rate
                chart.append({
                    "date": f"Wk +{i + 1}",
                    "predicted": round(predicted, 1),
                    "lower": round(max(predicted - margin, 0), 1),
                    "upper": round(predicted + margin, 1),
                })

        elif horizon == "monthly":
            for i in range(past_weeks - 1, -1, -1):
                month_start = (today - pd.DateOffset(months=i)).replace(day=1)
                month_end = (today - pd.DateOffset(months=i - 1)).replace(day=1) - pd.Timedelta(days=1)
                actual = 0.0
                if len(daily):
                    for d in pd.date_range(month_start, month_end):
                        actual += float(daily.get(d, 0.0))
                else:
                    actual = float(daily.mean()) * 30 if len(daily) else 0.0
                chart.append({
                    "date": month_start.strftime("%B"),
                    "actual": round(actual, 1),
                })
            preds = self._forecast_or_statistical(daily, 31 * future_weeks)
            cursor_days = 0
            for i in range(future_weeks):
                pred_month = today + pd.DateOffset(months=i + 1)
                days_in_month = pred_month.days_in_month
                predicted = float(np.sum(preds[cursor_days : cursor_days + days_in_month]))
                cursor_days += days_in_month
                margin = predicted * margin_rate
                chart.append({
                    "date": pred_month.strftime("%B"),
                    "predicted": round(predicted, 1),
                    "lower": round(max(predicted - margin, 0), 1),
                    "upper": round(predicted + margin, 1),
                })

        else:  # daily
            for i in range(past_weeks - 1, -1, -1):
                day = (today - pd.Timedelta(days=i)).date()
                actual = float(daily.get(day, 0.0)) if len(daily) else 0.0
                chart.append({
                    "date": day.strftime("%Y-%m-%d"),
                    "actual": round(actual, 1),
                })
            preds = self._forecast_or_statistical(daily, future_weeks)
            for i, predicted in enumerate(preds, start=1):
                predicted = float(predicted)
                margin = predicted * margin_rate
                day = today + pd.Timedelta(days=i)
                chart.append({
                    "date": day.strftime("%Y-%m-%d"),
                    "predicted": round(predicted, 1),
                    "lower": round(max(predicted - margin, 0), 1),
                    "upper": round(predicted + margin, 1),
                })

        return {
            "chart": chart,
            "model_mape": round(effective_mape, 1),
            "low_confidence": n_points < 30 or self.wape > 25,
        }

    def _forecast_or_statistical(self, series: pd.Series, steps: int) -> list[float]:
        """Use the trained model recursively when possible, otherwise the
        statistical weekday method. Never emits random noise."""
        if self.gboost is not None and self.is_trained and len(series) >= 21:
            try:
                return self._recursive_forecast(series, steps)
            except Exception as exc:
                logger.warning("Recursive forecast failed, using statistical: %s", exc)
        base = self._statistical_forecast(series, 1)
        avg = base if base > 0 else float(series.tail(7).mean() if len(series) else 0.0)
        return [avg] * steps

    # ── Confidence helpers ───────────────────────────────────────────────

    def _data_points(self, historical: list[dict]) -> int:
        if not historical:
            return 0
        df = pd.DataFrame(historical)
        if df.empty:
            return 0
        if "date" in df.columns:
            return int(pd.to_datetime(df["date"], errors="coerce").dropna().dt.normalize().nunique())
        return len(df)

    def _confidence_margin_multiplier(self, n_points: int) -> float:
        if n_points < 30:
            return 0.25
        if n_points < 90:
            return 0.18
        if n_points < 180:
            return 0.12
        if n_points < 365:
            return 0.08
        return 0.05

    def _effective_mape(self, n_points: int) -> float:
        """Conservative error estimate shown to users, floored by data volume."""
        if n_points < 30:
            return max(self.wape, 45.0)
        if n_points < 90:
            return max(self.wape, 35.0)
        if n_points < 180:
            return max(self.wape, 28.0)
        return max(self.wape, 22.0)

    def _moving_average(self, df: pd.DataFrame) -> float:
        if df.empty or "quantity" not in df.columns:
            return 0.0
        window = min(7, len(df))
        return float(df["quantity"].tail(window).mean())

    def _fallback_single(self, product_id: int | str) -> dict:
        return {
            "product_id": product_id,
            "predicted_demand": 0.0,
            "confidence_lower": 0.0,
            "confidence_upper": 0.0,
            "model_mape": round(self._effective_mape(0), 1),
        }

    # ── Persistence ──────────────────────────────────────────────────────

    def save(self) -> None:
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        if self.gboost is not None:
            joblib.dump(self.gboost, MODELS_DIR / "demand_gboost.joblib")
        if self.lstm is not None:
            self.lstm.save(MODELS_DIR / "demand_lstm.keras")
        joblib.dump({
            "wape": self.wape,
            "mape": self.mape,
            "daily_wape": self.daily_wape,
            "smape": self.smape,
            "accuracy": self.accuracy,
            "weekly_precision": self.weekly_precision,
            "seasonal_score": self.seasonal_score,
            "seasonal_reliable": self.seasonal_reliable,
            "data_days": self.data_days,
            "feature_columns": self.feature_columns,
            "lstm_sequence_length": self.lstm_sequence_length,
            "lag_fill": self._lag_fill,
            "scaler": self.scaler,
            "log_target": self._log_target,
            "ensemble_weights": ENSEMBLE_WEIGHTS,
        }, MODELS_DIR / "demand_meta.joblib")

    def load(self) -> bool:
        gboost_path = MODELS_DIR / "demand_gboost.joblib"
        meta_path = MODELS_DIR / "demand_meta.joblib"
        if not gboost_path.exists():
            return False
        try:
            self.gboost = joblib.load(gboost_path)
        except Exception as exc:
            logger.warning("Could not load GBoost model: %s", exc)
            return False
        if meta_path.exists():
            meta = joblib.load(meta_path)
            self.wape = meta.get("wape", 100.0)
            self.mape = meta.get("mape", meta.get("wape", 100.0))
            self.daily_wape = meta.get("daily_wape", 100.0)
            self.smape = meta.get("smape", 100.0)
            self.accuracy = meta.get("accuracy", 0.0)
            self.weekly_precision = meta.get("weekly_precision", 0.0)
            self.seasonal_score = meta.get("seasonal_score", 0.0)
            self.seasonal_reliable = meta.get("seasonal_reliable", False)
            self.data_days = meta.get("data_days", 0)
            self.feature_columns = meta.get("feature_columns", self.feature_columns)
            self.lstm_sequence_length = meta.get("lstm_sequence_length", LSTM_SEQUENCE_LENGTH)
            self._lag_fill = meta.get("lag_fill", {})
            self.scaler = meta.get("scaler")
            self._log_target = meta.get("log_target", True)
        lstm_path = MODELS_DIR / "demand_lstm.keras"
        if TF_AVAILABLE and lstm_path.exists():
            try:
                self.lstm = tf.keras.models.load_model(lstm_path)
            except Exception as exc:
                logger.warning("Could not load LSTM model: %s", exc)
                self.lstm = None
        self.is_trained = True
        return True
