from models.churn_prediction import ChurnPredictionModel


class ChurnService:
    def __init__(self, model: ChurnPredictionModel):
        self.model = model

    def predict(self, payload: dict) -> dict:
        customers = payload.get("customers")
        if not customers:
            customers = self._default_customers()

        predictions = self.model.predict(customers)
        return {
            "predictions": predictions,
            "data": predictions,
        }

    @staticmethod
    def _default_customers() -> list[dict]:
        return [
            {
                "customer_id": 1,
                "recency_days": 45,
                "frequency": 12,
                "monetary_total": 245000,
                "avg_transaction": 20416,
                "customer_type": "contractor",
                "loyalty_member": True,
            },
            {
                "customer_id": 2,
                "recency_days": 15,
                "frequency": 24,
                "monetary_total": 4850000,
                "avg_transaction": 202083,
                "customer_type": "contractor",
                "loyalty_member": True,
            },
            {
                "customer_id": 3,
                "recency_days": 72,
                "frequency": 2,
                "monetary_total": 420000,
                "avg_transaction": 210000,
                "customer_type": "retail",
                "loyalty_member": False,
            },
        ]
