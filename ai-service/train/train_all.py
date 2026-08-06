"""Train all RetailPulse ML models from live PostgreSQL data."""

import sys
from pathlib import Path
import pandas as pd
from sqlalchemy import create_engine

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config import DATABASE_URL
from models import (
    ChurnPredictionModel,
    DemandForecastModel,
    ProductRecommendationModel,
    StockoutRiskModel,
)


def get_engine():
    return create_engine(DATABASE_URL)


def load_sales(engine) -> pd.DataFrame:
    query = """
    SELECT 
        DATE(t.transaction_date) as date,
        ti.product_id,
        SUM(ti.quantity) as quantity,
        AVG(ti.unit_price) as price
    FROM transactions t
    JOIN transaction_items ti ON t.transaction_id = ti.transaction_id
    GROUP BY DATE(t.transaction_date), ti.product_id
    ORDER BY date, ti.product_id
    """
    df = pd.read_sql(query, engine)
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"])
    return df


def load_transactions(engine) -> list[list[str]]:
    query = "SELECT transaction_id, product_id FROM transaction_items"
    df = pd.read_sql(query, engine)
    if df.empty:
        return []
    baskets = df.groupby("transaction_id")["product_id"].apply(list).tolist()
    return baskets


def build_customer_features(engine) -> pd.DataFrame:
    query = """
    SELECT 
        customer_id, 
        transaction_date, 
        total_amount as amount 
    FROM transactions 
    WHERE customer_id IS NOT NULL
    """
    df = pd.read_sql(query, engine)
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


def main():
    print("=== RetailPulse Live Model Training ===\n")
    engine = get_engine()

    try:
        sales = load_sales(engine)
        demand = DemandForecastModel()
        demand_result = demand.train(sales)
        print(f"Demand forecast: {demand_result}")
    except Exception as e:
        print(f"Demand forecast failed: {e}")

    try:
        customers = build_customer_features(engine)
        churn = ChurnPredictionModel()
        churn_result = churn.train(customers)
        print(f"Churn prediction: {churn_result}")
    except Exception as e:
        print(f"Churn prediction failed: {e}")

    try:
        baskets = load_transactions(engine)
        recommend = ProductRecommendationModel()
        recommend_result = recommend.train(baskets)
        print(f"Recommendations: {recommend_result}")
    except Exception as e:
        print(f"Recommendations failed: {e}")

    try:
        stockout = StockoutRiskModel()
        stockout_result = stockout.train()
        print(f"Stockout risk: {stockout_result}")
    except Exception as e:
        print(f"Stockout risk failed: {e}")

    print("\nAll models saved to models/saved/")
    print("Restart the API to load trained models.")


if __name__ == "__main__":
    main()
