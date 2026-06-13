import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def fetch_diesel_prices() -> dict[str, float]:
    # Replace this placeholder with a real fuel-price API when available.
    return {
        "SI": 1.70,
        "DE": 1.98,
        "AT": 1.82,
        "IT": 1.89,
        "HR": 1.65,
    }


def save_prices(data: dict[str, float]) -> None:
    with open(BASE_DIR / "fuel_prices.json", "w", encoding="utf-8") as file:
        json.dump(data, file, indent=4)


if __name__ == "__main__":
    prices = fetch_diesel_prices()
    save_prices(prices)
    print("Fuel prices updated:", prices)
