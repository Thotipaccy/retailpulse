from models.demand_forecast import DemandForecastModel
from services.forecast_insights import ForecastInsightBuilder


class ForecastService:
    def __init__(self, model: DemandForecastModel):
        self.model = model

    def forecast(self, payload: dict) -> dict:
        horizon = payload.get("horizon", "daily")
        product_ids = payload.get("product_ids") or ["p1"]
        historical = payload.get("historical_data") or []
        historical_days = payload.get("historical_days")
        if historical_days is None:
            historical_days = self.model._data_points(historical) if historical else 0

        if not historical:
            return {
                "forecasts": [],
                "data": [],
                "chart": [],
                "model_mape": self.model.mape,
                "low_confidence": True,
                "insights": "No historical sales data available. Upload transaction data before generating forecasts.",
                "warning": "No historical data available. Upload sales data first.",
                "empty": True,
            }

        forecasts = []
        product_histories = payload.get("product_histories") or {}
        for pid in product_ids:
            p_history = product_histories.get(str(pid))
            if not p_history and isinstance(product_histories.get(pid), list):
                p_history = product_histories.get(pid)
            if not p_history:
                p_history = historical
            forecasts.append(self.model.predict_product(p_history, horizon=horizon, product_id=pid,
                                                        store_history=historical))

        product_names = payload.get("product_names") or {}
        product_categories = payload.get("product_categories") or {}
        timeseries = self.model.predict_uc03_timeseries(historical, horizon=horizon)
        mape = timeseries.get("model_mape", self.model.mape)
        insights = ForecastInsightBuilder.build(forecasts, mape, historical, product_names, product_categories, horizon)
        warning = self._build_warning(int(historical_days))

        result = {
            "forecasts": forecasts,
            "data": timeseries.get("chart", []),
            "chart": timeseries.get("chart", []),
            "model_mape": mape,
            "low_confidence": timeseries.get("low_confidence", mape > 15),
            "insights": insights,
            "model_status": "trained",
            "last_trained": __import__("datetime").datetime.now().strftime("%Y-%m-%d"),
        }
        if warning:
            result["warning"] = warning
        return result

    @staticmethod
    def _build_warning(historical_days: int) -> str | None:
        if historical_days <= 0:
            return None
        if historical_days < 30:
            return (
                f"Very limited data: only {historical_days} days available. "
                "Forecast accuracy will be low."
            )
        if historical_days < 90:
            return (
                f"Limited data: {historical_days} days available. "
                "90+ days recommended for optimal accuracy."
            )
        return None

