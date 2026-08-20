from datetime import datetime
from collections import defaultdict
from models.product_recommendation import ProductRecommendationModel


class RecommendationService:
    def __init__(self, model: ProductRecommendationModel, demand_model=None):
        self.model = model
        self.demand_model = demand_model

    def recommend(self, payload: dict) -> dict:
        rec_type = payload.get("type", "cross_sell")
        limit = payload.get("limit", 10)
        
        if rec_type == "seasonal" and self.demand_model:
            return self._dynamic_seasonal(payload, limit)

        transactions = payload.get("transactions") or self._default_transactions()
        baskets = [t["products"] for t in transactions if "products" in t]

        # Use request baskets for cross-sell when provided (on-the-fly association rules).
        if payload.get("transactions") and baskets:
            inline = ProductRecommendationModel()
            inline.train(baskets)
            model = inline
        else:
            if not self.model.is_trained and baskets:
                self.model.train(baskets)
            model = self.model

        recs = model.recommend(
            transactions=transactions,
            product_id=payload.get("product_id", 1),
            rec_type=rec_type,
            limit=limit,
        )

        return {
            "recommendations": recs,
            "data": recs,
        }

    @staticmethod
    def _month_to_season(month: int) -> str:
        if month in (12, 1, 2):
            return "Winter"
        if month in (3, 4, 5):
            return "Spring"
        if month in (6, 7, 8):
            return "Summer"
        return "Autumn"

    @staticmethod
    def _peak_season(history: list[dict]) -> str:
        """Determine the season where this product historically sells the most."""
        seasonal_qty: dict[str, float] = defaultdict(float)
        for row in history:
            date_str = row.get("date") or row.get("transactionDate") or ""
            qty = float(row.get("quantity", 0) or 0)
            try:
                dt = datetime.fromisoformat(str(date_str)[:10])
                season = RecommendationService._month_to_season(dt.month)
                seasonal_qty[season] += qty
            except (ValueError, TypeError):
                continue
        if not seasonal_qty:
            # Default to current season
            return RecommendationService._month_to_season(datetime.now().month)
        return max(seasonal_qty, key=lambda s: seasonal_qty[s])

    @staticmethod
    def _seasonal_qty_breakdown(history: list[dict]) -> dict[str, float]:
        """
        Returns how much of each product's total sales falls per season.
        e.g. {'Spring': 230, 'Summer': 80, 'Autumn': 45, 'Winter': 12}
        """
        seasonal_qty: dict[str, float] = defaultdict(float)
        for row in history:
            date_str = row.get("date") or row.get("transactionDate") or ""
            qty = float(row.get("quantity", 0) or 0)
            try:
                dt = datetime.fromisoformat(str(date_str)[:10])
                season = RecommendationService._month_to_season(dt.month)
                seasonal_qty[season] += qty
            except (ValueError, TypeError):
                continue
        return dict(seasonal_qty)

    @staticmethod
    def _recent_trend_multiplier(history: list[dict], days: int = 90) -> float:
        """
        Compare recent 90-day sales vs the same window a year ago.
        Returns a multiplier: >1 means growth, <1 means decline.
        This lets a product shift upward in seasons if it is trending up.
        """
        cutoff = datetime.now()
        recent_total = 0.0
        prior_total = 0.0
        for row in history:
            date_str = row.get("date") or row.get("transactionDate") or ""
            qty = float(row.get("quantity", 0) or 0)
            try:
                dt = datetime.fromisoformat(str(date_str)[:10])
                delta = (cutoff - dt).days
                if 0 <= delta <= days:
                    recent_total += qty
                elif 365 <= delta <= 365 + days:
                    prior_total += qty
            except (ValueError, TypeError):
                continue
        if prior_total == 0:
            return 1.1 if recent_total > 0 else 1.0
        return min(2.0, max(0.5, recent_total / prior_total))

    def _dynamic_seasonal(self, payload: dict, limit: int) -> dict:
        from concurrent.futures import ThreadPoolExecutor, as_completed

        product_histories = payload.get("product_histories") or {}
        product_names = payload.get("product_names") or {}
        product_categories = payload.get("product_categories") or {}
        per_season_limit = max(5, limit // 4)  # top N products per season

        if not product_histories:
            recs = self.model._seasonal_recommendations(limit)
            return {"recommendations": recs, "data": recs}

        # ── Cap to top 30 products by total historical sales volume ──────
        # This keeps response times fast even with large catalogs
        MAX_PRODUCTS = 30
        ranked_by_volume = sorted(
            ((pid, hist) for pid, hist in product_histories.items() if hist),
            key=lambda x: sum(float(r.get("quantity", 0) or 0) for r in x[1]),
            reverse=True
        )[:MAX_PRODUCTS]

        if not ranked_by_volume:
            recs = self.model._seasonal_recommendations(limit)
            return {"recommendations": recs, "data": recs}

        # ── Run ML predictions in parallel ───────────────────────────────
        def forecast_product(pid_hist):
            pid, p_history = pid_hist
            try:
                breakdown = self._seasonal_qty_breakdown(p_history)
                total_qty = sum(breakdown.values()) or 1.0
                trend = self._recent_trend_multiplier(p_history)
                pred = self.demand_model.predict_product(p_history, horizon="weekly", product_id=pid)
                overall_predicted = max(0.0, pred.get("predicted_demand", 0) * 12)

                # ── Multi-factor confidence (no artificial floor) ─────────────
                model_mape = pred.get("model_mape", 50.0)
                # 1. Model accuracy score: decreases as MAPE rises. 0% MAPE → 1.0, 100% MAPE → 0.0
                model_score = max(0.0, 1.0 - (model_mape / 100.0))

                # 2. Data volume score: more unique sales dates = higher trust
                n_data_points = len(p_history)  # unique date records for this product
                data_score = min(1.0, n_data_points / 60.0)  # 60 records → full score

                # 3. Seasonal concentration score: if a product clearly peaks in
                #    one season (high share), that seasonal recommendation is reliable.
                #    A flat distribution (0.25 per season) → low score.
                max_season_share = max(breakdown.values(), default=0.0) / total_qty
                # Scale: 0.25 (uniform) → 0.0, 1.0 (all in one season) → 1.0
                concentration_score = max(0.0, (max_season_share - 0.25) / 0.75)

                # Weighted combination (model 40%, data quality 30%, seasonality 30%)
                confidence = (
                    0.40 * model_score
                    + 0.30 * data_score
                    + 0.30 * concentration_score
                )
                # Clamp to [0.10, 0.95] — never claim perfection or zero knowledge
                confidence = max(0.10, min(0.95, confidence))
                # ─────────────────────────────────────────────────────────────
                product_name = product_names.get(str(pid), f"Product {pid}")
                product_category = product_categories.get(str(pid), "General")
                results = []
                for season in ("Spring", "Summer", "Autumn", "Winter"):
                    share = breakdown.get(season, 0) / total_qty
                    score = share * overall_predicted * trend
                    results.append({
                        "product_id": pid,
                        "product_name": product_name,
                        "category": product_category,
                        "_score": score,
                        "predicted_demand": round(share * overall_predicted, 1),
                        "seasonal_share": round(share, 3),
                        "n_data_points": n_data_points,
                        "confidence": round(confidence, 3),
                        "season": season,
                        "type": "seasonal_forecast",
                    })
                return results
            except Exception:
                return []

        all_entries: list[dict] = []
        # Use up to 8 workers — enough to parallelize without overloading
        with ThreadPoolExecutor(max_workers=min(8, len(ranked_by_volume))) as executor:
            futures = {executor.submit(forecast_product, item): item[0] for item in ranked_by_volume}
            for future in as_completed(futures):
                all_entries.extend(future.result())

        # ── Per-season: pick top products by score ───────────────────────
        season_buckets: dict[str, list] = {"Spring": [], "Summer": [], "Autumn": [], "Winter": []}
        for entry in all_entries:
            season_buckets[entry["season"]].append(entry)

        all_recs = []
        for season, candidates in season_buckets.items():
            candidates.sort(key=lambda x: x["_score"], reverse=True)
            for item in candidates[:per_season_limit]:
                item.pop("_score", None)
                all_recs.append(item)

        return {"recommendations": all_recs, "data": all_recs}

    @staticmethod
    def _default_transactions() -> list[dict]:
        return [
            {"transaction_id": 1, "products": [1, 5, 12]},
            {"transaction_id": 2, "products": [1, 8]},
            {"transaction_id": 3, "products": [2, 7]},
            {"transaction_id": 4, "products": [1, 2, 7]},
            {"transaction_id": 5, "products": [3, 6]},
            {"transaction_id": 6, "products": [4, 6]},
            {"transaction_id": 7, "products": [1, 4, 5]},
            {"transaction_id": 8, "products": [8, 12]},
        ]
