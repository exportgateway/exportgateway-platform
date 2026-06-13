import pandas as pd
from xgboost import XGBRegressor
import joblib
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# =================================================
# LOAD DATA
# =================================================

df = pd.read_csv(BASE_DIR / "freight_prices.csv", encoding="utf-8", sep=";", engine="python")
df.columns = df.columns.str.strip().str.lower()

# =================================================
# CLEAN NUMERIC VALUES
# =================================================

cols = [
    "distance_km",
    "weight_kg",
    "pallets",
    "loading_meters",
    "price"
]

for c in cols:
    df[c] = pd.to_numeric(df[c], errors="coerce")

df = df.dropna(subset=cols)

# =================================================
# FEATURES
# =================================================

X = df[[
    "distance_km",
    "weight_kg",
    "pallets",
    "loading_meters"
]]

y = df["price"]

# =================================================
# MODEL
# =================================================

model = XGBRegressor(
    n_estimators=200,
    max_depth=6,
    learning_rate=0.08,
    random_state=42,
)

model.fit(X, y)

joblib.dump(model, BASE_DIR / "price_model.pkl")

print("OK - MODEL TRAINED")
