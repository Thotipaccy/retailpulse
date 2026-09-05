import logging
from collections import Counter, defaultdict
from itertools import combinations

import joblib
import pandas as pd

from config import APRIORI_MIN_CONFIDENCE, APRIORI_MIN_SUPPORT, MODELS_DIR

logger = logging.getLogger(__name__)

try:
    from mlxtend.frequent_patterns import apriori, association_rules
    from mlxtend.preprocessing import TransactionEncoder

    MLXTEND_AVAILABLE = True
except ImportError:
    MLXTEND_AVAILABLE = False


class ProductRecommendationModel:
    """Association rules (Apriori) with collaborative filtering and co-occurrence."""

    def __init__(self):
        self.rules_df: pd.DataFrame | None = None
        self.popularity: Counter = Counter()
        self.item_similarity: dict = {}
        self.is_trained = False

    def train(self, transactions: list[list], catalog: pd.DataFrame | None = None) -> dict:
        self.popularity = Counter()
        if not transactions:
            self.rules_df = None
            self.item_similarity = {}
            self.is_trained = True
            self.save()
            return {"rules": 0, "trained": True}

        for basket in transactions:
            self.popularity.update(basket)

        if MLXTEND_AVAILABLE and transactions:
            try:
                te = TransactionEncoder()
                te_ary = te.fit(transactions).transform(transactions)
                df = pd.DataFrame(te_ary, columns=te.columns_)
                frequent = apriori(df, min_support=APRIORI_MIN_SUPPORT, use_colnames=True)
                if not frequent.empty:
                    self.rules_df = association_rules(
                        frequent, metric="confidence", min_threshold=APRIORI_MIN_CONFIDENCE
                    )
                else:
                    self.rules_df = None
            except Exception as e:
                logger.warning("MLXTEND Apriori error, falling back to cooccurrence: %s", e)
                self._build_cooccurrence_rules(transactions)
        else:
            self._build_cooccurrence_rules(transactions)

        self._build_item_similarity(transactions)
        self.is_trained = True
        self.save()
        return {"rules": len(self.rules_df) if self.rules_df is not None else 0, "trained": True}

    def _build_cooccurrence_rules(self, transactions: list[list]) -> None:
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

    def _build_item_similarity(self, transactions: list[list]) -> None:
        cooc = defaultdict(lambda: defaultdict(int))
        for basket in transactions:
            unique = list(set(basket))
            for i, a in enumerate(unique):
                for b in unique[i + 1 :]:
                    cooc[a][b] += 1
                    cooc[b][a] += 1
        self.item_similarity = {}
        for a, neighbors in cooc.items():
            max_co = max(neighbors.values()) if neighbors else 1
            self.item_similarity[a] = {b: c / max_co for b, c in neighbors.items()}

    def recommend(
        self,
        transactions: list[dict] | None = None,
        product_id: int | str | None = None,
        rec_type: str = "cross_sell",
        limit: int = 10,
        product_names: dict | None = None,
    ) -> list[dict]:
        if rec_type == "seasonal":
            return []

        # If no rules and no item similarities and no popularity, return empty
        if (self.rules_df is None or self.rules_df.empty) and not self.item_similarity and not self.popularity:
            return []

        target = product_id
        if target is None and self.popularity:
            target = self.popularity.most_common(1)[0][0]

        if target is None:
            return []

        recs: list[dict] = []
        seen = {target}

        if self.rules_df is not None and not self.rules_df.empty:
            for _, rule in self.rules_df.iterrows():
                antecedents = rule["antecedents"]
                if isinstance(antecedents, (frozenset, set)) and target in antecedents:
                    consequents = rule["consequents"]
                    if isinstance(consequents, (frozenset, set)):
                        for pid in consequents:
                            if pid not in seen:
                                seen.add(pid)
                                recs.append(self._rec_item(pid, float(rule["confidence"]), "frequently_bought_together", product_names))
                if len(recs) >= limit:
                    break

        if len(recs) < limit and target in self.item_similarity:
            for pid, sim in sorted(self.item_similarity[target].items(), key=lambda x: -x[1]):
                if pid not in seen:
                    seen.add(pid)
                    recs.append(self._rec_item(pid, sim, "collaborative_filtering", product_names))
                if len(recs) >= limit:
                    break

        if len(recs) < limit and self.popularity:
            for pid, _ in self.popularity.most_common(limit + len(seen)):
                if pid not in seen:
                    seen.add(pid)
                    recs.append(self._rec_item(pid, 0.65, "popular", product_names))
                if len(recs) >= limit:
                    break

        return recs[:limit]

    def _rec_item(self, product_id, confidence: float, rec_type: str, product_names: dict | None = None) -> dict:
        names = product_names or {}
        name = names.get(str(product_id), names.get(product_id, f"Product {product_id}"))
        return {
            "product_id": product_id,
            "product_name": name,
            "confidence": round(min(confidence, 0.99), 2),
            "type": rec_type,
        }

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
        try:
            data = joblib.load(path)
            self.rules_df = data.get("rules_df")
            self.popularity = Counter(data.get("popularity", {}))
            self.item_similarity = data.get("item_similarity", {})
            self.is_trained = True
            return True
        except Exception:
            return False
