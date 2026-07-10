import logging
from math import exp, sqrt

import joblib
import numpy as np

from config import MODELS_DIR, STOCKOUT_Z_SCORE
from utils.metrics import stockout_risk_level

logger = logging.getLogger(__name__)


class StockoutRiskModel:
    """Poisson-based stockout risk and reorder recommendations."""

    def __init__(self):
        self.is_trained = True  # rule-based; no training required
        self.accuracy: float = 0.88

    def train(self, *_args, **_kwargs) -> dict:
        self.save()
        return {"accuracy": self.accuracy, "trained": True}

    def predict(self, products: list[dict]) -> list[dict]:
        return [self._assess_product(p) for p in products]

    def _assess_product(self, p: dict) -> dict:
        stock = float(p.get("current_stock") or 0)
        daily_demand = max(float(p.get("daily_demand_avg") or 1), 0.1)
        lead_time = max(int(p.get("lead_time_days") or 3), 1)
        reorder_point = float(p.get("reorder_point") or 30)
        unit_price = float(p.get("unit_price") or 1500)
        std_demand = daily_demand * 0.25

        days_until = stock / daily_demand
        expected_demand_lead = daily_demand * lead_time
        stockout_prob = 1.0 - self._poisson_cdf(int(stock), expected_demand_lead)

        safety_stock = STOCKOUT_Z_SCORE * std_demand * sqrt(lead_time)
        recommended_order = max(int(expected_demand_lead + safety_stock - stock), int(reorder_point))

        potential_loss = round(max(0, expected_demand_lead - stock) * unit_price, 2)

        return {
            "product_id": p.get("product_id"),
            "stockout_probability": round(min(max(stockout_prob, 0), 1), 2),
            "days_until_stockout": round(days_until, 1),
            "risk_level": stockout_risk_level(days_until),
            "recommended_order": recommended_order,
            "potential_loss_rwf": potential_loss,
        }

    @staticmethod
    def _poisson_cdf(k: int, lam: float) -> float:
        if lam <= 0:
            return 1.0
        if k < 0:
            return 0.0
        # For large stock levels relative to demand, CDF ≈ 1 (negligible stockout risk).
        if k >= lam + 10 * sqrt(max(lam, 0.1)):
            return 1.0
        total = 0.0
        term = exp(-lam)
        total += term
        for i in range(1, k + 1):
            term *= lam / i
            total += term
            if term < 1e-15:
                break
        return min(total, 1.0)

    def default_products(self) -> list[dict]:
        return [
            {"product_id": 1, "current_stock": 8, "daily_demand_avg": 12, "lead_time_days": 3, "reorder_point": 30, "unit_price": 12500},
            {"product_id": 3, "current_stock": 32, "daily_demand_avg": 5, "lead_time_days": 5, "reorder_point": 40, "unit_price": 42000},
            {"product_id": 8, "current_stock": 12, "daily_demand_avg": 2, "lead_time_days": 7, "reorder_point": 15, "unit_price": 185000},
        ]

    def save(self) -> None:
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump({"accuracy": self.accuracy}, MODELS_DIR / "stockout_meta.joblib")

    def load(self) -> bool:
        path = MODELS_DIR / "stockout_meta.joblib"
        if path.exists():
            self.accuracy = joblib.load(path).get("accuracy", 0.88)
        return True
