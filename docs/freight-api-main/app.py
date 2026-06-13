import json
import logging
import os
from pathlib import Path
from typing import Literal

import joblib
import pandas as pd
import requests
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from commercial_pricing import apply_commercial_markup

load_dotenv()

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("freight-api")

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="Freight Pricing API", version="ftl-fuel-engine-v1")


def parse_cors_origins() -> list[str]:
    origins = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "").split(",")
        if origin.strip()
    ]
    return origins or ["http://localhost:3000"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


try:
    model = joblib.load(BASE_DIR / "price_model.pkl")
except Exception as exc:
    logger.warning("Price model could not be loaded: %s", exc)
    model = None


COUNTRY_MAP = {
    "slovenia": "SI",
    "germany": "DE",
    "austria": "AT",
    "italy": "IT",
    "croatia": "HR",
    "hungary": "HU",
}

DEFAULT_FUEL_PRICES = {
    "SI": 1.70,
    "DE": 1.98,
    "AT": 1.82,
    "IT": 1.89,
    "HR": 1.65,
}

BASE_FTL_RATE = 1.35
BASE_DIESEL = 1.55
FALLBACK_DISTANCE_KM = 500


class PriceRequest(BaseModel):
    city_from: str | None = None
    city_to: str | None = None
    country_from: str | None = None
    country_to: str | None = None

    from_lat: float | None = Field(default=None, ge=-90, le=90)
    from_lon: float | None = Field(default=None, ge=-180, le=180)
    to_lat: float | None = Field(default=None, ge=-90, le=90)
    to_lon: float | None = Field(default=None, ge=-180, le=180)

    weight_kg: float = Field(default=0, ge=0)
    pallets: int = Field(default=0, ge=0)
    loading_meters: float = Field(default=0, ge=0)

    transport_type: Literal["FTL", "LTL"] = "FTL"

    @field_validator("transport_type", mode="before")
    @classmethod
    def normalize_transport_type(cls, value):
        if value is None:
            return "FTL"
        return str(value).upper()


def round_to_5eur(value: float) -> int:
    return int(round(value / 5) * 5)


def load_fuel_prices() -> dict[str, float]:
    try:
        with open(BASE_DIR / "fuel_prices.json", "r", encoding="utf-8") as file:
            return json.load(file)
    except Exception as exc:
        logger.warning("Fuel prices could not be loaded, using defaults: %s", exc)
        return DEFAULT_FUEL_PRICES


def get_country_code(req: PriceRequest, key: str) -> str | None:
    value = getattr(req, key, None)
    if not value:
        return None

    normalized = value.strip().lower()
    if len(normalized) == 2:
        return normalized.upper()

    return COUNTRY_MAP.get(normalized)


def corridor_fuel_price(req: PriceRequest) -> float:
    fuel = load_fuel_prices()

    country_from = get_country_code(req, "country_from")
    country_to = get_country_code(req, "country_to")

    price_from = fuel.get(country_from, 1.75)
    price_to = fuel.get(country_to, 1.75)

    return (price_from + price_to) / 2


def dynamic_ftl_rate(req: PriceRequest) -> float:
    avg_fuel = corridor_fuel_price(req)
    fuel_factor = avg_fuel / BASE_DIESEL
    return BASE_FTL_RATE * fuel_factor


def ftl_price(distance: float, req: PriceRequest) -> float:
    try:
        rate = dynamic_ftl_rate(req)
    except Exception as exc:
        logger.warning("Dynamic FTL rate failed, using fallback rate: %s", exc)
        rate = 1.7

    rate = max(rate, 1.7)
    base = distance * rate

    load_factor = 1.0
    load_factor += req.pallets * 0.05
    load_factor += (req.weight_kg / 1000) * 0.03
    load_factor += req.loading_meters * 0.06

    price = base * load_factor
    price = max(price, distance * 1.6)
    price = min(price, distance * 2.4)

    return price


def load_price_history() -> pd.DataFrame:
    for encoding in ("utf-8", "latin1"):
        try:
            loaded = pd.read_csv(
                BASE_DIR / "freight_prices.csv",
                encoding=encoding,
                sep=";",
                on_bad_lines="skip",
            )
            loaded.columns = [column.strip().lower() for column in loaded.columns]
            return loaded
        except Exception as exc:
            logger.warning("CSV load failed with %s encoding: %s", encoding, exc)

    return pd.DataFrame()


df = load_price_history()


def find_similar_price(req: PriceRequest, distance: float) -> float | None:
    required_columns = {"distance_km", "weight_kg", "pallets", "loading_meters", "price"}
    if df.empty or not required_columns.issubset(df.columns):
        return None

    try:
        tmp = df.copy()

        for column in required_columns:
            tmp[column] = pd.to_numeric(tmp[column], errors="coerce")

        tmp = tmp.dropna(subset=list(required_columns))
        tmp = tmp[
            (tmp["distance_km"] >= distance * 0.5)
            & (tmp["distance_km"] <= distance * 1.5)
        ]

        if tmp.empty:
            return None

        tmp["score"] = (
            (tmp["distance_km"] - distance).abs()
            + (tmp["weight_kg"] - req.weight_kg).abs() / 100
            + (tmp["pallets"] - req.pallets).abs() * 10
            + (tmp["loading_meters"] - req.loading_meters).abs() * 10
        )

        return float(tmp.sort_values("score").iloc[0]["price"])
    except Exception as exc:
        logger.warning("Similar price lookup failed: %s", exc)
        return None


def ai_price(req: PriceRequest, distance: float) -> float | None:
    if model is None:
        return None

    try:
        features = pd.DataFrame(
            [
                {
                    "distance_km": distance,
                    "weight_kg": req.weight_kg,
                    "pallets": req.pallets,
                    "loading_meters": req.loading_meters,
                }
            ]
        )
        return float(model.predict(features)[0])
    except Exception as exc:
        logger.warning("AI price prediction failed: %s", exc)
        return None


def fallback(distance: float, req: PriceRequest) -> float:
    if req.transport_type == "FTL":
        return ftl_price(distance, req)

    base = distance * 0.18
    return base + req.weight_kg * 0.02 + req.pallets * 10 + req.loading_meters * 8


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    from math import asin, cos, radians, sin, sqrt

    radius_km = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    )
    return 2 * radius_km * asin(sqrt(a))


def _geometric_distance_km(req: PriceRequest) -> float:
    return max(
        _haversine_km(req.from_lat, req.from_lon, req.to_lat, req.to_lon),
        1,
    )


def calculate_price(distance: float, req: PriceRequest) -> tuple[float, int]:
    if req.transport_type == "FTL":
        price = ftl_price(distance, req) or distance * 1.7
        return price, 95

    ai = ai_price(req, distance)
    csv = find_similar_price(req, distance)
    fb = fallback(distance, req)

    ai = ai or fb
    csv = csv or ai

    if distance < 180:
        price = (0.6 * csv) + (0.3 * ai) + (0.1 * fb)
        price *= (
            1
            + req.pallets * 0.04
            + (req.weight_kg / 1000) * 0.03
            + req.loading_meters * 0.05
        )
        price = max(price, 60)
        price = min(price, 180)
        return price, 90

    price = (0.6 * csv) + (0.4 * fb)
    return price, 85


def get_distance(req: PriceRequest) -> tuple[float | None, str | None, str | None]:
    """Return (distance_km, distance_source, warning)."""
    if (
        req.from_lat is None
        or req.from_lon is None
        or req.to_lat is None
        or req.to_lon is None
    ):
        return None, None, None

    token = os.getenv("MAPBOX_TOKEN")
    if not token:
        logger.info("MAPBOX_TOKEN is missing, using geometric fallback distance")
        return (
            _geometric_distance_km(req),
            "haversine",
            "Mapbox token missing; using straight-line distance estimate.",
        )

    try:
        url = (
            "https://api.mapbox.com/directions/v5/mapbox/driving/"
            f"{req.from_lon},{req.from_lat};{req.to_lon},{req.to_lat}"
            f"?alternatives=false&geometries=geojson&access_token={token}"
        )

        response = requests.get(url, timeout=5)
        response.raise_for_status()
        data = response.json()

        routes = data.get("routes", [])
        if not routes:
            return (
                _geometric_distance_km(req),
                "haversine",
                "Mapbox returned no routes; using straight-line distance estimate.",
            )

        return max(routes[0]["distance"] / 1000, 1), "mapbox", None
    except requests.RequestException as exc:
        logger.warning("Mapbox distance request failed: %s", exc)
        return (
            _geometric_distance_km(req),
            "haversine",
            "Mapbox request failed; using straight-line distance estimate.",
        )
    except (KeyError, ValueError, TypeError) as exc:
        logger.warning("Mapbox distance response could not be parsed: %s", exc)
        return (
            _geometric_distance_km(req),
            "haversine",
            "Mapbox response invalid; using straight-line distance estimate.",
        )


@app.post("/price")
def price(req: PriceRequest):
    distance, distance_source, warning = get_distance(req)

    if not distance:
        distance = FALLBACK_DISTANCE_KM
        distance_source = "fallback"
        warning = (
            warning
            or "Coordinates missing; using fixed fallback distance (500 km)."
        )

    distance = max(distance, 1)
    estimated_cost, confidence = calculate_price(distance, req)
    customer_price = round_to_5eur(apply_commercial_markup(estimated_cost))

    response = {
        "success": True,
        "distance_km": round(distance),
        "distance_source": distance_source,
        "price_eur": customer_price,
        "price_range": [
            round_to_5eur(customer_price * 0.9),
            round_to_5eur(customer_price * 1.1),
        ],
        "confidence_score": confidence,
    }
    if warning:
        response["warning"] = warning
    return response


@app.get("/")
def root():
    return {"status": "ok", "version": app.version}
