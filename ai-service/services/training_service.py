"""
Background Training Service
============================
Runs model retraining in a daemon thread so the API never blocks.
State machine: IDLE → TRAINING → COMPLETED | FAILED

Used by:
  POST /ml/retrain          — trigger retrain
  GET  /ml/training/status  — poll current state
"""

import json
import logging
import threading
import time
from datetime import datetime
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, text

from config import DATABASE_URL, MODELS_DIR

logger = logging.getLogger(__name__)

# ── State constants ──────────────────────────────────────────────────────────
STATUS_IDLE      = "idle"
STATUS_TRAINING  = "training"
STATUS_COMPLETED = "completed"
STATUS_FAILED    = "failed"

# Audit log persisted between restarts
TRAINING_LOG_PATH = MODELS_DIR.parent / "training_log.json"

# ── Singleton TrainingService ─────────────────────────────────────────────────

class TrainingService:
    """Thread-safe, singleton background training coordinator."""

    _instance: "TrainingService | None" = None
    _lock = threading.Lock()

    def __new__(cls) -> "TrainingService":
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._init()
        return cls._instance

    def _init(self) -> None:
        self._state_lock = threading.RLock()
        self._status: str = STATUS_IDLE
        self._thread: threading.Thread | None = None
        self._started_at: str | None = None
        self._completed_at: str | None = None
        self._error: str | None = None
        self._last_metrics: dict = {}
        self._session_counter: int = 0
        self._record_counter: int = 0  # Tracks new records since last train
        self._load_log()

    # ── Public API ─────────────────────────────────────────────────────────

    def notify_new_record(self, count: int = 1) -> None:
        """Called whenever new transaction records are saved.
        
        Automatically triggers background retraining when 30 new records
        accumulate since the last training session.
        """
        with self._state_lock:
            self._record_counter += count
            threshold = 30
            if self._record_counter >= threshold and self._status not in (STATUS_TRAINING,):
                logger.info(
                    "Auto-train triggered: %d new records accumulated (threshold=%d)",
                    self._record_counter, threshold,
                )
                self._record_counter = 0  # Reset before launching
                self._launch_background("auto_threshold")

    def trigger(self, reason: str = "manual", min_records: int = 0) -> dict:
        """Manually trigger retraining. Returns immediately."""
        with self._state_lock:
            if self._status == STATUS_TRAINING:
                return {
                    "status": "already_training",
                    "message": "Training already in progress",
                    "started_at": self._started_at,
                }
            try:
                record_count = self._count_records()
            except Exception as exc:
                return {"status": "error", "message": f"DB unavailable: {exc}"}

            if min_records > 0 and record_count < min_records:
                return {
                    "status": "skipped",
                    "message": f"Only {record_count} total records; minimum {min_records} required",
                    "record_count": record_count,
                }

            self._launch_background(reason)
            return {
                "status": "training_started",
                "reason": reason,
                "record_count": record_count,
                "started_at": self._started_at,
            }

    def get_status(self) -> dict:
        """Return current training state (thread-safe snapshot)."""
        with self._state_lock:
            return {
                "status": self._status,
                "started_at": self._started_at,
                "completed_at": self._completed_at,
                "error": self._error,
                "session_id": self._session_counter,
                "records_since_last_train": self._record_counter,
                **self._last_metrics,
            }

    # ── Internal ──────────────────────────────────────────────────────────

    def _launch_background(self, reason: str) -> None:
        """Must be called with _state_lock held."""
        self._status = STATUS_TRAINING
        self._started_at = datetime.utcnow().isoformat() + "Z"
        self._completed_at = None
        self._error = None
        self._session_counter += 1
        session_id = self._session_counter

        self._thread = threading.Thread(
            target=self._run_training,
            args=(reason, session_id),
            daemon=True,
            name=f"RetailPulse-Train-{session_id}",
        )
        self._thread.start()
        logger.info("Training thread launched (session=%d, reason=%s)", session_id, reason)

    def _run_training(self, reason: str, session_id: int) -> None:
        """Heavy work — runs in daemon thread, never blocks the API."""
        logger.info("[Train-%d] Starting model retraining (reason=%s)", session_id, reason)
        try:
            metrics = self._train_all_models()
            with self._state_lock:
                self._status = STATUS_COMPLETED
                self._completed_at = datetime.utcnow().isoformat() + "Z"
                self._last_metrics = metrics
                self._record_counter = 0  # Reset on success
            logger.info("[Train-%d] Completed: %s", session_id, metrics)
            self._save_log(session_id, reason, STATUS_COMPLETED, metrics, None)

            # Reload in-memory models without restart
            self._reload_registry()

        except Exception as exc:
            logger.exception("[Train-%d] Failed: %s", session_id, exc)
            with self._state_lock:
                self._status = STATUS_FAILED
                self._completed_at = datetime.utcnow().isoformat() + "Z"
                self._error = str(exc)
            self._save_log(session_id, reason, STATUS_FAILED, {}, str(exc))

    def _train_all_models(self) -> dict:
        """Runs the full training pipeline. Returns metrics dict."""
        import sys
        ROOT = Path(__file__).resolve().parents[2]
        if str(ROOT) not in sys.path:
            sys.path.insert(0, str(ROOT))

        from models import (
            ChurnPredictionModel,
            DemandForecastModel,
            ProductRecommendationModel,
            StockoutRiskModel,
        )

        engine = create_engine(DATABASE_URL)
        metrics: dict = {}

        # 1. Demand forecast
        try:
            sales = self._load_sales(engine)
            demand = DemandForecastModel()
            result = demand.train(sales)
            metrics["demand"] = result
            logger.info("Demand model trained: %s", result)
        except Exception as exc:
            logger.warning("Demand training failed: %s", exc)
            metrics["demand"] = {"error": str(exc)}

        # 2. Churn prediction
        try:
            customers = self._load_customer_features(engine)
            churn = ChurnPredictionModel()
            result = churn.train(customers)
            metrics["churn"] = result
        except Exception as exc:
            logger.warning("Churn training failed: %s", exc)
            metrics["churn"] = {"error": str(exc)}

        # 3. Recommendations
        try:
            baskets = self._load_baskets(engine)
            recommend = ProductRecommendationModel()
            result = recommend.train(baskets)
            metrics["recommendations"] = result
        except Exception as exc:
            logger.warning("Recommendation training failed: %s", exc)
            metrics["recommendations"] = {"error": str(exc)}

        # 4. Stockout risk
        try:
            stockout = StockoutRiskModel()
            result = stockout.train()
            metrics["stockout"] = result
        except Exception as exc:
            logger.warning("Stockout training failed: %s", exc)
            metrics["stockout"] = {"error": str(exc)}

        # Flatten key metrics for convenience
        demand_result = metrics.get("demand", {})
        metrics["mape"] = demand_result.get("mape", None)
        metrics["weekly_precision"] = demand_result.get("weekly_precision", None)
        metrics["seasonal_score"] = demand_result.get("seasonal_score", None)
        metrics["overall"] = round(max(0, 100 - (metrics["mape"] or 100)), 1) if metrics["mape"] is not None else 0

        return metrics

    def _reload_registry(self) -> None:
        """Hot-reload the global model registry after training."""
        try:
            # Import the global registry from main module
            import importlib
            import main as app_main
            from models import (
                ChurnPredictionModel,
                DemandForecastModel,
                ProductRecommendationModel,
                StockoutRiskModel,
            )
            app_main.registry["demand"] = DemandForecastModel()
            app_main.registry["churn"] = ChurnPredictionModel()
            app_main.registry["recommendation"] = ProductRecommendationModel()
            app_main.registry["stockout"] = StockoutRiskModel()
            from main import load_models
            load_models()
            logger.info("In-memory registry reloaded after training")
        except Exception as exc:
            logger.warning("Could not reload registry: %s — restart API to apply new models", exc)

    # ── Data loaders (same as train_all.py) ──────────────────────────────

    @staticmethod
    def _load_sales(engine) -> pd.DataFrame:
        query = text("""
            SELECT
                DATE(t.transaction_date) as date,
                ti.product_id,
                SUM(ti.quantity)         as quantity,
                AVG(ti.unit_price)       as price
            FROM transactions t
            JOIN transaction_items ti ON t.transaction_id = ti.transaction_id
            GROUP BY DATE(t.transaction_date), ti.product_id
            ORDER BY date, ti.product_id
        """)
        with engine.connect() as conn:
            df = pd.read_sql(query, conn)
        if not df.empty:
            df["date"] = pd.to_datetime(df["date"])
        return df

    @staticmethod
    def _load_baskets(engine) -> list:
        query = text("SELECT transaction_id, product_id FROM transaction_items")
        with engine.connect() as conn:
            df = pd.read_sql(query, conn)
        if df.empty:
            return []
        return df.groupby("transaction_id")["product_id"].apply(list).tolist()

    @staticmethod
    def _load_customer_features(engine) -> pd.DataFrame:
        query = text("""
            SELECT customer_id, transaction_date, total_amount as amount
            FROM transactions
            WHERE customer_id IS NOT NULL
        """)
        with engine.connect() as conn:
            df = pd.read_sql(query, conn)
        if df.empty:
            return pd.DataFrame()
        df["transaction_date"] = pd.to_datetime(df["transaction_date"])
        today = pd.Timestamp.now()
        rows = []
        for cid, grp in df.groupby("customer_id"):
            recency = (today - grp["transaction_date"].max()).days
            frequency = len(grp)
            monetary = grp["amount"].sum()
            rows.append({
                "customer_id": cid,
                "recency_days": recency,
                "frequency": frequency,
                "monetary_total": monetary,
                "avg_transaction": monetary / max(frequency, 1),
                "customer_type": "contractor" if monetary > 500000 else "retail",
                "loyalty_member": monetary > 300000,
            })
        return pd.DataFrame(rows)

    @staticmethod
    def _count_records() -> int:
        """Count total transaction item records in DB."""
        engine = create_engine(DATABASE_URL)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT COUNT(*) FROM transaction_items"))
            return result.scalar() or 0

    # ── Audit log ────────────────────────────────────────────────────────

    def _save_log(self, session_id: int, reason: str, status: str, metrics: dict, error: str | None) -> None:
        try:
            TRAINING_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
            history: list = []
            if TRAINING_LOG_PATH.exists():
                with open(TRAINING_LOG_PATH) as f:
                    history = json.load(f)
            history.append({
                "session_id": session_id,
                "reason": reason,
                "status": status,
                "started_at": self._started_at,
                "completed_at": self._completed_at,
                "error": error,
                "metrics": metrics,
            })
            # Keep last 100 sessions only
            history = history[-100:]
            with open(TRAINING_LOG_PATH, "w") as f:
                json.dump(history, f, indent=2, default=str)
        except Exception as exc:
            logger.warning("Could not persist training log: %s", exc)

    def _load_log(self) -> None:
        try:
            if TRAINING_LOG_PATH.exists():
                with open(TRAINING_LOG_PATH) as f:
                    history: list = json.load(f)
                if history:
                    last = history[-1]
                    self._session_counter = last.get("session_id", 0)
                    if last.get("status") in (STATUS_COMPLETED, STATUS_FAILED):
                        self._status = STATUS_IDLE  # Fresh restart = idle
                        self._completed_at = last.get("completed_at")
                        self._last_metrics = last.get("metrics", {})
        except Exception:
            pass  # Ignore corrupt log on first run


# Module-level singleton
training_service = TrainingService()
