import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
# Env-overridable so CI smoke tests can write artifacts to a temp dir
# instead of clobbering deployed champion models.
MODELS_DIR = Path(os.getenv("MODELS_DIR", str(BASE_DIR / "models" / "saved")))
RAW_DATA_DIR = BASE_DIR / "data" / "raw"

CORS_ORIGINS = [
    "http://localhost:8080",
    "http://localhost:5173",
]

HOST = "0.0.0.0"
PORT = 8000

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "retailpulse_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "1234")
# Managed Postgres (Neon etc.) requires TLS; set DB_SSL_MODE=require there.
DB_SSL_MODE = os.getenv("DB_SSL_MODE", "")
DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
if DB_SSL_MODE:
    DATABASE_URL += f"?sslmode={DB_SSL_MODE}"

# Rwanda seasonal windows (month numbers, 1-based)
CONSTRUCTION_SEASON_MONTHS = {6, 7, 8, 9}
RAINY_SEASON_MONTHS = {3, 4, 5, 10, 11}

# Model hyperparameters
GBOOST_FORECAST_PARAMS = {
    "n_estimators": 100,
    "max_depth": 4,
    "learning_rate": 0.1,
    "random_state": 42,
}
LSTM_SEQUENCE_LENGTH = 30
LSTM_EPOCHS = int(os.getenv("LSTM_EPOCHS", "50"))
LSTM_BATCH_SIZE = 32
# GBoost carries the forecast on small single-store datasets; the LSTM is a
# secondary signal. Equal weighting let unscaled LSTM noise degrade accuracy.
ENSEMBLE_WEIGHTS = {"gboost": 0.8, "lstm": 0.2}

# Demand-training regime control. Retail volume shifts as a business grows;
# training on stale low-volume history teaches the model the wrong level.
# Values chosen by grid search over this store's history (see training logs).
# All three are env-tunable so they can be tuned per deployment without code changes.
TRAINING_WINDOW_DAYS = int(os.getenv("TRAINING_WINDOW_DAYS", "45"))
RECENCY_HALF_LIFE_DAYS = float(os.getenv("RECENCY_HALF_LIFE_DAYS", "45"))
SPIKE_CAP_FACTOR = float(os.getenv("SPIKE_CAP_FACTOR", "2.5"))

# Champion/challenger gate: a freshly trained model only replaces the deployed
# one if its backtest accuracy is within this many points of (or better than)
# the incumbent. Prevents accuracy regressions from bad data days propagating.
CHAMPION_TOLERANCE_PTS = 2.0

APRIORI_MIN_SUPPORT = 0.02
APRIORI_MIN_CONFIDENCE = 0.3

CHURN_RISK_THRESHOLDS = {
    "low": 0.40,
    "medium": 0.70,
    "high": 0.90,
}

STOCKOUT_Z_SCORE = 1.65  # ~95% service level
