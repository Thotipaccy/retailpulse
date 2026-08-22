import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import CORS_ORIGINS, PORT
from models import (
    ChurnPredictionModel,
    DemandForecastModel,
    ProductRecommendationModel,
    StockoutRiskModel,
)
from services import ChurnService, ForecastService, RecommendationService, StockoutService
from services.training_service import training_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global model registry
registry: dict[str, Any] = {
    "demand": DemandForecastModel(),
    "churn": ChurnPredictionModel(),
    "recommendation": ProductRecommendationModel(),
    "stockout": StockoutRiskModel(),
}


def load_models() -> bool:
    loaded = 0
    for name, model in registry.items():
        if hasattr(model, "load") and model.load():
            loaded += 1
            logger.info("Loaded %s model", name)
        else:
            logger.info("%s model using statistical fallbacks", name)
    return loaded > 0


@asynccontextmanager
async def lifespan(_app: FastAPI):
    models_loaded = load_models()
    registry["models_loaded"] = models_loaded
    yield


app = FastAPI(
    title="RetailPulse AI Service",
    description="ML predictions for demand, churn, recommendations, and stockout risk",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Pydantic schemas ---

class HistoricalPoint(BaseModel):
    date: str
    quantity: int


class ForecastRequest(BaseModel):
    product_ids: list[str | int] | None = None
    category_id: str | int | None = None
    store_id: str | int | None = None
    horizon: str = "daily"
    historical_data: list[HistoricalPoint] | None = None
    product_histories: dict[str, list[HistoricalPoint]] | None = None
    product_names: dict[str, str] | None = None
    product_categories: dict[str, str] | None = None


class CustomerInput(BaseModel):
    customer_id: int | str
    recency_days: int
    frequency: int
    monetary_total: float
    avg_transaction: float
    customer_type: str = "consumer"
    loyalty_member: bool = False


class ChurnRequest(BaseModel):
    customers: list[CustomerInput] | None = None


class TransactionInput(BaseModel):
    transaction_id: int | str
    products: list[int]


class RecommendRequest(BaseModel):
    transactions: list[TransactionInput] | None = None
    historical_data: list[dict] | None = None
    product_histories: dict | None = None
    product_names: dict | None = None
    product_id: int | None = 1
    rec_type: str = Field(default="cross_sell", alias="type")
    limit: int = 10

    model_config = {"populate_by_name": True}


class ProductStockInput(BaseModel):
    product_id: int | str
    current_stock: int
    daily_demand_avg: float
    lead_time_days: int = 3
    reorder_point: int = 30
    unit_price: float | None = None


class StockoutRequest(BaseModel):
    products: list[ProductStockInput] | None = None


# --- Endpoints ---

@app.get("/health")
def health():
    return {
        "status": "ok",
        "models_loaded": bool(registry.get("models_loaded", False)),
    }


@app.post("/ml/reload")
def reload_models():
    """Reload all models from disk after retraining (no process restart needed)."""
    # Re-instantiate models so old in-memory state is fully cleared
    registry["demand"] = DemandForecastModel()
    registry["churn"] = ChurnPredictionModel()
    registry["recommendation"] = ProductRecommendationModel()
    registry["stockout"] = StockoutRiskModel()
    models_loaded = load_models()
    registry["models_loaded"] = models_loaded
    demand: DemandForecastModel = registry["demand"]
    return {
        "status": "reloaded",
        "mape": round(demand.wape, 2),
        "accuracy": round(demand.accuracy, 1) if demand.is_trained else 0.0,
        "weeklyPrecision": demand.weekly_precision,
        "seasonalDetection": demand.seasonal_score,
        "overall": round(demand.accuracy, 1) if demand.is_trained else 0.0,
    }


@app.get("/ml/models/status")
def models_status():
    demand: DemandForecastModel = registry["demand"]
    churn: ChurnPredictionModel = registry["churn"]
    recommend: ProductRecommendationModel = registry["recommendation"]
    stockout: StockoutRiskModel = registry["stockout"]

    return {
        "models": {
            "demand_forecast": {
                "loaded": demand.is_trained,
                "accuracy_mape": round(demand.wape, 2),
                "accuracy": round(demand.accuracy, 1),
                "type": "GradientBoosting (log-target, recency-weighted) + LSTM (experimental)",
            },
            "churn_prediction": {
                "loaded": churn.is_trained,
                "accuracy": churn.accuracy,
                "type": "GradientBoostingClassifier + KMeans",
            },
            "product_recommendation": {
                "loaded": recommend.is_trained,
                "type": "Apriori association rules",
            },
            "stockout_risk": {
                "loaded": stockout.is_trained,
                "accuracy": stockout.accuracy,
                "type": "Poisson probability model",
            },
        },
        "overall": round(demand.accuracy, 1) if demand.is_trained else 0.0,
        "weeklyPrecision": demand.weekly_precision,
        "seasonalDetection": demand.seasonal_score,
        "seasonalReliable": demand.seasonal_reliable,
        "dataDays": demand.data_days,
        "wape": round(demand.wape, 2) if demand.is_trained else None,
        "mape": round(demand.mape, 2) if demand.is_trained else None,
    }


@app.post("/ml/forecast")
def forecast(body: dict = Body(default={})):
    try:
        request = ForecastRequest(**body)
        payload = request.model_dump()
    except Exception:
        payload = body
    try:
        return ForecastService(registry["demand"]).forecast(payload)
    except Exception as ex:
        logger.exception("Forecast failed")
        raise HTTPException(status_code=500, detail=str(ex)) from ex


@app.post("/ml/churn")
def churn(body: dict = Body(default={})):
    try:
        request = ChurnRequest(**body)
        payload = request.model_dump()
    except Exception:
        payload = body
    try:
        return ChurnService(registry["churn"]).predict(payload)
    except Exception as ex:
        logger.exception("Churn failed")
        raise HTTPException(status_code=500, detail=str(ex)) from ex


@app.post("/ml/recommend")
def recommend(body: dict = Body(default={})):
    try:
        request = RecommendRequest(**body)
        payload = request.model_dump(by_alias=True)
    except Exception:
        payload = body
    try:
        return RecommendationService(registry["recommendation"], registry["demand"]).recommend(payload)
    except Exception as ex:
        logger.exception("Recommend failed")
        raise HTTPException(status_code=500, detail=str(ex)) from ex


@app.post("/ml/stockout")
def stockout(body: dict = Body(default={})):
    try:
        request = StockoutRequest(**body)
        payload = request.model_dump()
    except Exception:
        payload = body
    try:
        return StockoutService(registry["stockout"]).assess(payload)
    except Exception as ex:
        logger.exception("Stockout failed")
        raise HTTPException(status_code=500, detail=str(ex)) from ex


@app.post("/ml/retrain")
def retrain(body: dict = Body(default={})):
    """
    Trigger background model retraining.
    Returns immediately — training runs in a daemon thread.
    Poll GET /ml/training/status to check progress.
    """
    reason = body.get("reason", "api_trigger")
    min_records = int(body.get("min_records", 0))
    result = training_service.trigger(reason=reason, min_records=min_records)
    return result


@app.get("/ml/training/status")
def training_status():
    """Return current training state (idle | training | completed | failed) with metrics."""
    return training_service.get_status()


@app.post("/ml/training/notify")
def notify_new_record(body: dict = Body(default={})):
    """Called by backend whenever new transaction records are saved.
    Accumulates a counter and fires auto-retrain at 30 records.
    """
    count = int(body.get("count", 1))
    training_service.notify_new_record(count)
    return {"acknowledged": True, "count": count}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
