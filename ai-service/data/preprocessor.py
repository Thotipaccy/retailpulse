import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder


class Preprocessor:
    """Handles cleaning, encoding, scaling, and splitting."""

    def __init__(self):
        self.scaler = StandardScaler()
        self.label_encoders: dict[str, LabelEncoder] = {}
        self.numeric_fill: dict[str, float] = {}
        self.categorical_fill: dict[str, str] = {}

    def fit_fill_values(self, df: pd.DataFrame) -> None:
        for col in df.select_dtypes(include=[np.number]).columns:
            self.numeric_fill[col] = float(df[col].median())
        for col in df.select_dtypes(include=["object", "category"]).columns:
            mode = df[col].mode()
            self.categorical_fill[col] = str(mode.iloc[0]) if not mode.empty else "unknown"

    def handle_missing(self, df: pd.DataFrame) -> pd.DataFrame:
        out = df.copy()
        for col in out.select_dtypes(include=[np.number]).columns:
            fill = self.numeric_fill.get(col, out[col].median())
            out[col] = out[col].fillna(fill)
        for col in out.select_dtypes(include=["object", "category"]).columns:
            fill = self.categorical_fill.get(col, "unknown")
            out[col] = out[col].fillna(fill)
        return out

    def encode_categorical(self, df: pd.DataFrame, columns: list[str], fit: bool = False) -> pd.DataFrame:
        out = df.copy()
        for col in columns:
            if col not in out.columns:
                continue
            if fit:
                le = LabelEncoder()
                out[col] = le.fit_transform(out[col].astype(str))
                self.label_encoders[col] = le
            else:
                le = self.label_encoders.get(col)
                if le is None:
                    continue
                known = set(le.classes_)
                out[col] = out[col].astype(str).apply(lambda v: v if v in known else le.classes_[0])
                out[col] = le.transform(out[col])
        return out

    def normalize(self, X: np.ndarray, fit: bool = False) -> np.ndarray:
        if fit:
            return self.scaler.fit_transform(X)
        return self.scaler.transform(X)

    def train_test_split(
        self, X: np.ndarray, y: np.ndarray, test_size: float = 0.2, random_state: int = 42
    ):
        return train_test_split(X, y, test_size=test_size, random_state=random_state)
