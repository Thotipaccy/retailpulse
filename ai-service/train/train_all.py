"""Train all RetailPulse ML models from raw CSV data."""

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config import RAW_DATA_DIR
from models import (
    ChurnPredictionModel,
    DemandForecastModel,
    ProductRecommendationModel,
    StockoutRiskModel,
)


def load_sales() -> pd.DataFrame:
    path = RAW_DATA_DIR / "sales_history.csv"
    df = pd.read_csv(path, parse_dates=["date"])
    return df


def load_transactions() -> list[list[int]]:
    path = RAW_DATA_DIR / "transaction_items.csv"
    df = pd.read_csv(path)
    baskets = df.groupby("transaction_id")["product_id"].apply(list).tolist()
    return baskets


def build_customer_features() -> pd.DataFrame:
    path = RAW_DATA_DIR / "customer_transactions.csv"
    df = pd.read_csv(path, parse_dates=["transaction_date"])
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


def main():
    print("=== RetailPulse Model Training ===\n")

    sales = load_sales()
    demand = DemandForecastModel()
    demand_result = demand.train(sales)
    print(f"Demand forecast: {demand_result}")

    customers = build_customer_features()
    churn = ChurnPredictionModel()
    churn_result = churn.train(customers)
    print(f"Churn prediction: {churn_result}")

    baskets = load_transactions()
    recommend = ProductRecommendationModel()
    recommend_result = recommend.train(baskets)
    print(f"Recommendations: {recommend_result}")

    stockout = StockoutRiskModel()
    stockout_result = stockout.train()
    print(f"Stockout risk: {stockout_result}")

    print("\nAll models saved to models/saved/")
    print("Restart the API to load trained models.")


if __name__ == "__main__":
    main()
