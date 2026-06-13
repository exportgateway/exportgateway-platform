# Intrastat Freight Allocation Tool

FastAPI backend API for ExportGateway.eu. The API uses Mapbox Directions to calculate road distance and Mapbox Geocoding to estimate how much of the route is inside the selected domestic country for Intrastat/accounting freight allocation.

## Endpoint

### `GET /`

Health/root endpoint.

### `POST /intrastat`

Request:

```json
{
  "from_lat": 52.52,
  "from_lon": 13.405,
  "to_lat": 46.0569,
  "to_lon": 14.5058,
  "total_cost": 500,
  "domestic_country": "Slovenia"
}
```

### `POST /intrastat/address`

Request:

```json
{
  "from_postal_code": "10115",
  "from_city": "Berlin",
  "from_country": "Germany",
  "to_postal_code": "1000",
  "to_city": "Ljubljana",
  "to_country": "Slovenia",
  "total_cost": 500,
  "domestic_country": "Slovenia"
}
```

This endpoint geocodes the locations with Mapbox and then calculates the freight allocation for the selected domestic country. For example, use `Germany` for a German domestic allocation, `Croatia` for a Croatian domestic allocation, or `Slovenia` for a Slovenian domestic allocation.

Response:

```json
{
  "success": true,
  "total_km": 990,
  "domestic_km": 70,
  "foreign_km": 920,
  "domestic_percent": 7.1,
  "foreign_percent": 92.9,
  "domestic_cost": 35.35,
  "foreign_cost": 464.65,
  "route_summary": {
    "pickup": "Berlin, Germany",
    "delivery": "Ljubljana, Slovenia",
    "total_distance": "990 km",
    "allocation_country": "Slovenia"
  },
  "route_segments": [
    {
      "segment_type": "foreign",
      "coordinates": [[52.52, 13.405], [46.65, 14.25]]
    },
    {
      "segment_type": "domestic",
      "coordinates": [[46.65, 14.25], [46.0569, 14.5058]]
    }
  ]
}
```

## Environment Variables

```bash
MAPBOX_TOKEN=your_mapbox_token_here
CORS_ORIGINS=*
COUNTRY_SAMPLE_KM=5
```

For production, set `CORS_ORIGINS` to your website origin, for example:

```bash
CORS_ORIGINS=https://exportgateway.eu,https://www.exportgateway.eu
```

## Run Locally

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Render Start Command

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

## Render Python Version

This project includes `.python-version` with:

```text
3.12.8
```

`render.yaml` also sets `PYTHON_VERSION=3.12.8`. Render should use Python 3.12 so dependencies such as Pydantic install from stable prebuilt wheels.

If Render still logs `Using Python version 3.14.3 (default)`, open the existing Render service and add this environment variable manually:

```text
PYTHON_VERSION=3.12.8
```

Then redeploy with a cleared build cache. Existing Render services do not always apply new `render.yaml` environment variables unless they are managed as a Render Blueprint.
