import logging
from collections import Counter, defaultdict
from itertools import combinations
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from config import APRIORI_MIN_CONFIDENCE, APRIORI_MIN_SUPPORT, MODELS_DIR

logger = logging.getLogger(__name__)

try:
    from mlxtend.frequent_patterns import apriori, association_rules
    from mlxtend.preprocessing import TransactionEncoder

    MLXTEND_AVAILABLE = True
except ImportError:
    MLXTEND_AVAILABLE = False


PRODUCT_NAMES = {
    1: "Cement (Cimerwa 50kg)",
    2: "Iron Sheets (G32)",
    3: "Paint (Sahara 20L)",
    4: "Electrical Wire (2.5mm²)",
    5: "Screwdriver Set",
    6: "Door Locks (Union)",
    7: "Roofing Nails (5kg pack)",
    8: "PVC Pipes (4-inch)",
    9: "Tiles (Ceramic 40x40cm)",
    10: "Plywood (18mm)",
    12: "Water Tanks (1000L)",
}


class ProductRecommendationModel:
    """Association rules (Apriori) with collaborative filtering fallback."""

    def __init__(self):
        self.rules_df: pd.DataFrame | None = None
        self.popularity: Counter = Counter()
        self.item_similarity: dict[int, dict[int, float]] = {}
        self.is_trained = False

    def train(self, transactions: list[list[int]], catalog: pd.DataFrame | None = None) -> dict:
        self.popularity = Counter()
        for basket in transactions:
            self.popularity.update(basket)

        if MLXTEND_AVAILABLE and transactions:
            te = TransactionEncoder()
            te_ary = te.fit(transactions).transform(transactions)
            df = pd.DataFrame(te_ary, columns=te.columns_)
            frequent = apriori(df, min_support=APRIORI_MIN_SUPPORT, use_colnames=True)
            if not frequent.empty:
                self.rules_df = association_rules(
                    frequent, metric="confidence", min_threshold=APRIORI_MIN_CONFIDENCE
                )
        else:
            self._build_cooccurrence_rules(transactions)

        self._build_item_similarity(transactions)
        self.is_trained = True
        self.save()
        return {"rules": len(self.rules_df) if self.rules_df is not None else 0, "trained": True}

    def _build_cooccurrence_rules(self, transactions: list[list[int]]) -> None:
        pair_counts: Counter = Counter()
        item_counts: Counter = Counter()
        for basket in transactions:
            unique = list(set(basket))
            for item in unique:
                item_counts[item] += 1
            for a, b in combinations(unique, 2):
                pair_counts[(a, b)] += 1
                pair_counts[(b, a)] += 1

        rows = []
        total = max(len(transactions), 1)
        for (antecedent, consequent), count in pair_counts.items():
            support = count / total
            confidence = count / max(item_counts[antecedent], 1)
            if support >= APRIORI_MIN_SUPPORT and confidence >= APRIORI_MIN_CONFIDENCE:
                rows.append({
                    "antecedents": frozenset([antecedent]),
                    "consequents": frozenset([consequent]),
                    "support": support,
                    "confidence": confidence,
                })
        self.rules_df = pd.DataFrame(rows) if rows else None

    def _build_item_similarity(self, transactions: list[list[int]]) -> None:
        cooc = defaultdict(lambda: defaultdict(int))
        for basket in transactions:
            unique = list(set(basket))
            for i, a in enumerate(unique):
                for b in unique[i + 1 :]:
                    cooc[a][b] += 1
                    cooc[b][a] += 1
        for a, neighbors in cooc.items():
            max_co = max(neighbors.values()) if neighbors else 1
            self.item_similarity[a] = {b: c / max_co for b, c in neighbors.items()}

    def recommend(
        self,
        transactions: list[dict] | None = None,
        product_id: int | None = None,
        rec_type: str = "cross_sell",
        limit: int = 10,
    ) -> list[dict]:
        if rec_type == "seasonal":
            return self._seasonal_recommendations(limit)

        target = product_id or 1
        recs: list[dict] = []

        if self.rules_df is not None and not self.rules_df.empty:
            for _, rule in self.rules_df.iterrows():
                antecedents = rule["antecedents"]
                if isinstance(antecedents, frozenset) and target in antecedents:
                    consequents = rule["consequents"]
                    if isinstance(consequents, frozenset):
                        for pid in consequents:
                            if pid != target:
                                recs.append(self._rec_item(pid, float(rule["confidence"]), "frequently_bought_together"))
                if len(recs) >= limit:
                    break

        if len(recs) < limit and target in self.item_similarity:
            for pid, sim in sorted(self.item_similarity[target].items(), key=lambda x: -x[1]):
                if pid != target:
                    recs.append(self._rec_item(pid, sim, "collaborative_filtering"))
                if len(recs) >= limit:
                    break

        if len(recs) < limit:
            for pid, _ in self.popularity.most_common(limit + 1):
                if pid != target:
                    recs.append(self._rec_item(pid, 0.65, "popular"))
                if len(recs) >= limit:
                    break

        return recs[:limit]

    def _rec_item(self, product_id: int, confidence: float, rec_type: str) -> dict:
        return {
            "product_id": product_id,
            "product_name": PRODUCT_NAMES.get(product_id, f"Product {product_id}"),
            "confidence": round(min(confidence, 0.99), 2),
            "type": rec_type,
        }

    def _seasonal_recommendations(self, limit: int) -> list[dict]:
        seasonal = [
            (2, "Iron Sheets (G32)", 0.91, "seasonal_construction"),
            (1, "Cement (Cimerwa 50kg)", 0.88, "seasonal_construction"),
            (7, "Roofing Nails (5kg pack)", 0.85, "seasonal_roofing"),
            (3, "Paint (Sahara 20L)", 0.75, "seasonal_diy"),
        ]
        return [
            {
                "product_id": pid,
                "product_name": name,
                "confidence": conf,
                "type": rtype,
            }
            for pid, name, conf, rtype in seasonal[:limit]
        ]

    def save(self) -> None:
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump({
            "rules_df": self.rules_df,
            "popularity": dict(self.popularity),
            "item_similarity": self.item_similarity,
        }, MODELS_DIR / "recommendation.joblib")

    def load(self) -> bool:
        path = MODELS_DIR / "recommendation.joblib"
        if not path.exists():
            return False
        data = joblib.load(path)
        self.rules_df = data.get("rules_df")
        self.popularity = Counter(data.get("popularity", {}))
        self.item_similarity = data.get("item_similarity", {})
        self.is_trained = True
        return True
