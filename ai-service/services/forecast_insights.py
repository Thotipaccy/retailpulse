import pandas as pd

class ForecastInsightBuilder:
    @staticmethod
    def build(forecasts: list[dict], mape: float, historical: list[dict] | None = None, product_names: dict = None, product_categories: dict = None, horizon: str = "daily") -> str:
        if not forecasts:
            return "No active products available to analyze. Please ensure stock items and transaction history are loaded."

        if not product_names:
            product_names = {}
        if not product_categories:
            product_categories = {}

        sorted_fc = sorted(
            forecasts,
            key=lambda f: float(f.get("predicted_demand") or f.get("predictedDemand") or 0),
            reverse=True,
        )
        
        top = sorted_fc[0]
        top_id = top.get("product_id") or top.get("productId")
        top_name = product_names.get(str(top_id)) or top.get("product_name") or top.get("productName") or str(top_id) or "top product"
        top_demand = float(top.get("predicted_demand") or top.get("predictedDemand") or 0)
        top_category = product_categories.get(str(top_id)) or top.get("category") or "General"

        urgent = [
            f for f in forecasts
            if str(f.get("status", "")).lower() in ("urgent", "reorder")
            or float(f.get("stockout_probability") or 0) >= 0.5
        ]

        insights = []
        
        # 1. Main Demand Driver
        insights.append(
            f"📋 Demand Leader: '{top_name}' ({top_category}) is projected to have the highest sales volume, "
            f"with an estimated demand of {top_demand:.0f} units over this period. "
            f"Ensure prominent shelf placement and verify stock availability."
        )

        # 2. Stockout Warning & Actionable Advice
        if urgent:
            names = [
                product_names.get(str(f.get("product_id") or f.get("productId"))) or str(f.get("product_name") or f.get("productName") or f.get("product_id") or f.get("productId"))
                for f in urgent
            ]
            if len(names) <= 3:
                insights.append(
                    f"⚠️ Stockout Risk: {len(urgent)} items are projected to fall below critical safety stock thresholds. "
                    f"Action Required: Please place replenishment orders immediately for: {', '.join(names)}."
                )
            else:
                insights.append(
                    f"⚠️ Stockout Risk: {len(urgent)} items are projected to experience deficits due to high demand. "
                    f"Action Required: Restock top items including: {', '.join(names[:3])}."
                )
        else:
            insights.append(
                "✅ Stock Health: Current stock levels are sufficient to satisfy the projected demand. No immediate reorders are required."
            )

        # 3. Overall Sales Trend
        if historical:
            df_hist = pd.DataFrame(historical)
            recent_total = 0.0
            prior_total = 0.0
            period_label = "week"
            
            if not df_hist.empty and "date" in df_hist.columns and "quantity" in df_hist.columns:
                try:
                    df_hist["date"] = pd.to_datetime(df_hist["date"], errors="coerce")
                    df_hist = df_hist.dropna(subset=["date"])
                    df_hist["quantity"] = pd.to_numeric(df_hist["quantity"], errors="coerce").fillna(0)
                    
                    if not df_hist.empty:
                        daily = df_hist.groupby(df_hist["date"].dt.date)["quantity"].sum()
                        today = pd.Timestamp.now().normalize()
                        
                        if horizon == "weekly":
                            end_this = today
                            start_this = today - pd.Timedelta(days=6)
                            end_prior = today - pd.Timedelta(days=7)
                            start_prior = today - pd.Timedelta(days=13)
                            
                            recent_total = sum(float(daily.get(d.date(), 0)) for d in pd.date_range(start_this, end_this))
                            prior_total = sum(float(daily.get(d.date(), 0)) for d in pd.date_range(start_prior, end_prior))
                            period_label = "week"
                        elif horizon == "monthly":
                            this_month_start = today.replace(day=1)
                            end_this = today
                            
                            prior_month_start = (today - pd.DateOffset(months=1)).replace(day=1)
                            prior_month_end = this_month_start - pd.Timedelta(days=1)
                            
                            recent_total = sum(float(daily.get(d.date(), 0)) for d in pd.date_range(this_month_start, end_this))
                            prior_total = sum(float(daily.get(d.date(), 0)) for d in pd.date_range(prior_month_start, prior_month_end))
                            period_label = "month"
                        else: # daily
                            end_this = today
                            start_this = today - pd.Timedelta(days=6)
                            end_prior = today - pd.Timedelta(days=7)
                            start_prior = today - pd.Timedelta(days=13)
                            
                            recent_total = sum(float(daily.get(d.date(), 0)) for d in pd.date_range(start_this, end_this))
                            prior_total = sum(float(daily.get(d.date(), 0)) for d in pd.date_range(start_prior, end_prior))
                            period_label = "week"
                except Exception:
                    pass
            
            if prior_total > 0:
                change = ((recent_total - prior_total) / prior_total) * 100
                direction = "upward" if change >= 0 else "downward"
                insights.append(
                    f"📈 Sales Momentum: The overall store sales trend is showing a {direction} trajectory "
                    f"({abs(change):.0f}% change compared to the previous {period_label}). Staff should prepare for "
                    f"{'increased customer traffic' if change >= 0 else 'stable operations'}."
                )
            else:
                insights.append(
                    "📈 Sales Momentum: Store transaction history shows stable sales activity heading into this period."
                )

        return "\n\n".join(insights)
