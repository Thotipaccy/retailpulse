from models.stockout_risk import StockoutRiskModel


class StockoutService:
    def __init__(self, model: StockoutRiskModel):
        self.model = model

    def assess(self, payload: dict) -> dict:
        products = payload.get("products")
        if not products:
            products = self.model.default_products()

        risks = self.model.predict(products)
        return {
            "risks": risks,
            "data": risks,
        }
