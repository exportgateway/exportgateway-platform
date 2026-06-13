# freight-api

FastAPI service for estimating road freight prices from distance, shipment size, fuel prices, historical shipment data, and an optional trained model.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

On Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Set `MAPBOX_TOKEN` in `.env` if you want live road-distance calculation. Without coordinates, the API uses a fixed 500 km fallback and includes a `warning`. With coordinates but no Mapbox (or on Mapbox failure), the API uses a straight-line (`haversine`) estimate and includes a `warning`. Check `distance_source` in the response (`mapbox`, `haversine`, or `fallback`).

## Run

```bash
uvicorn app:app --reload
```

Open:

- API: `http://localhost:8000`
- Docs: `http://localhost:8000/docs`

## Example request

```bash
curl -X POST http://localhost:8000/price \
  -H "Content-Type: application/json" \
  -d '{
    "country_from": "SI",
    "country_to": "DE",
    "from_lat": 46.0569,
    "from_lon": 14.5058,
    "to_lat": 52.5200,
    "to_lon": 13.4050,
    "weight_kg": 10000,
    "pallets": 34,
    "loading_meters": 13.6,
    "transport_type": "FTL"
  }'
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `MAPBOX_TOKEN` | No | Enables Mapbox road-distance calculation. |
| `CORS_ORIGINS` | No | Comma-separated list of allowed frontend origins. Defaults to `http://localhost:3000`. |
| `LOG_LEVEL` | No | Python logging level. Defaults to `INFO`. |
| `FREIGHT_MARKUP_UNDER_200` | No | Commercial markup for estimated costs under €200. Defaults to `0.20`. |
| `FREIGHT_MARKUP_200_TO_500` | No | Commercial markup for estimated costs €200–€500. Defaults to `0.10`. |
| `FREIGHT_MARKUP_OVER_500` | No | Commercial markup for estimated costs over €500. Defaults to `0.05`. |

See `FREIGHT_COMMERCIAL_PRICING.md` for customer-facing pricing logic.

## Train model

```bash
python train_model.py
```

The script reads `freight_prices.csv` and writes `price_model.pkl`.

## Deploy on Render

Use the included `render.yaml` blueprint. Set `MAPBOX_TOKEN` in the Render dashboard. The service starts with:

`uvicorn app:app --host 0.0.0.0 --port $PORT`

## Test

```bash
pytest
```

## Notes

- Do not commit `.env`; keep secrets in deployment environment variables or GitHub Actions secrets.
- `fuel_prices.json` is currently updated from placeholder values. Replace `fetch_diesel_prices()` in `update_fuel.py` with a real fuel-price provider when available.
