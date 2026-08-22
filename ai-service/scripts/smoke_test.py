"""CI smoke test: trains all demand-model paths on synthetic data.

Validates the full training -> persistence -> prediction loop without a
database. Artifacts are written to a temp dir via MODELS_DIR so real
champion models are never touched.

Run:  python scripts/smoke_test.py   (exit code 0 = pass)
"""
import os
import sys
import tempfile
from pathlib import Path

# Isolate artifacts BEFORE importing config (it reads MODELS_DIR at import).
_tmp = tempfile.mkdtemp(prefix="rp-smoke-")
os.environ["MODELS_DIR"] = str(Path(_tmp) / "models")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import pandas as pd

from models.demand_forecast import DemandForecastModel
from utils.metrics import calculate_wape


def make_sales_df(days=90, n_products=6, seed=42):
    rng = np.random.default_rng(seed)
    dates = pd.date_range(end=pd.Timestamp.utcnow().normalize(), periods=days, freq="D")
    rows = []
    for pid in range(n_products):
        base = 5 + pid * 3
        for d in dates:
            weekday = np.where(d.dayofweek >= 5, 1.6, 1.0)
            trend = 1 + d.dayofyear / 1200
            qty = max(0, int(rng.poisson(base * weekday * trend)))
            rows.append({"date": d.date(), "product_id": f"p-{pid}", "quantity": qty})
    return pd.DataFrame(rows)


def main():
    failures = []

    # Metrics sanity
    w = calculate_wape(np.array([10, 20, 30]), np.array([10, 20, 30]))
    if abs(w - 0.0) > 1e-9:
        failures.append(f"calculate_wape perfect prediction != 0 (got {w})")
    w2 = calculate_wape(np.array([10, 20]), np.array([0, 0]))
    if abs(w2 - 100.0) > 1e-9:
        failures.append(f"calculate_wape zero prediction != 100 (got {w2})")

    # Full training loop on synthetic data
    model = DemandForecastModel()
    result = model.train(make_sales_df())
    print("train result:", {k: result.get(k) for k in
                            ("trained", "accuracy", "wape", "daily_wape",
                             "weekly_precision", "data_days")})
    if not result.get("trained"):
        failures.append("train() did not report trained=True")
    if not result.get("replaced_champion"):
        failures.append("first-ever training must replace champion")
    acc = result.get("accuracy", -1)
    if not isinstance(acc, (int, float)) or acc < 0 or acc > 100:
        failures.append(f"accuracy out of range: {acc}")

    # Persistence round-trip from the isolated dir
    reloaded = DemandForecastModel()
    if not reloaded.load():
        failures.append("load() failed after save()")
    elif abs(reloaded.accuracy - acc) > 0.01:
        failures.append(f"meta round-trip mismatch: {reloaded.accuracy} vs {acc}")

    # Prediction paths
    from data.feature_engineering import FeatureEngineer

    sales_df = make_sales_df()
    hist = FeatureEngineer.build_daily_series(sales_df)
    recent = hist.tail(45)
    payload_hist = [{"date": d.strftime("%Y-%m-%d"), "quantity": int(q)}
                    for d, q in recent.items()]

    # Model-driven path: product history + store history
    p = model.predict_product(
        payload_hist[:20], horizon="weekly", product_id="p-0",
        store_history=payload_hist,
    )
    if "predicted_demand" not in p:
        failures.append(f"predict_product missing key: {list(p)}")
    if p.get("predicted_demand", -1) < 0:
        failures.append("negative predicted_demand")
    print("predict_product:", {k: p[k] for k in ("predicted_demand", "confidence_lower", "confidence_upper")})

    # Statistical fallback path (no model input)
    p2 = model.predict_product(payload_hist, horizon="daily", product_id="p-0")
    if "predicted_demand" not in p2:
        failures.append("predict_product fallback missing key")

    ts = model.predict_uc03_timeseries(payload_hist, horizon="daily")
    chart = ts.get("chart", []) if isinstance(ts, dict) else ts
    future = [row for row in chart if "predicted" in row]
    if not future:
        failures.append(f"predict_uc03_timeseries produced no predictions: {str(chart)[:120]}")
    else:
        print(f"uc03 chart rows: {len(chart)} ({len(future)} predicted)")

    if failures:
        print("\nSMOKE TEST FAILED:")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print("\nSMOKE TEST PASSED")


if __name__ == "__main__":
    main()
