import os
from dataclasses import dataclass

import httpx

from app.services.countries import normalize_country


class MapboxDirectionsError(Exception):
    pass


@dataclass(frozen=True)
class Route:
    distance_meters: float
    coordinates: list[tuple[float, float]]


@dataclass(frozen=True)
class Location:
    lat: float
    lon: float
    label: str


def get_mapbox_token() -> str:
    token = os.getenv("MAPBOX_TOKEN")
    if not token:
        raise MapboxDirectionsError("MAPBOX_TOKEN environment variable is not configured.")

    return token


async def get_route(
    from_lat: float,
    from_lon: float,
    to_lat: float,
    to_lon: float,
) -> Route:
    token = get_mapbox_token()
    coordinates = f"{from_lon},{from_lat};{to_lon},{to_lat}"
    url = f"https://api.mapbox.com/directions/v5/mapbox/driving/{coordinates}"
    params = {
        "access_token": token,
        "geometries": "geojson",
        "overview": "full",
        "alternatives": "false",
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text
        raise MapboxDirectionsError(f"Mapbox Directions API error: {detail}") from exc
    except httpx.HTTPError as exc:
        raise MapboxDirectionsError(f"Could not connect to Mapbox Directions API: {exc}") from exc

    data = response.json()
    routes = data.get("routes", [])
    if not routes:
        raise MapboxDirectionsError("Mapbox did not return a route for these coordinates.")

    route = routes[0]
    route_coordinates = route.get("geometry", {}).get("coordinates", [])
    if len(route_coordinates) < 2:
        raise MapboxDirectionsError("Mapbox returned an invalid route geometry.")

    return Route(
        distance_meters=float(route["distance"]),
        coordinates=[(float(lon), float(lat)) for lon, lat in route_coordinates],
    )


async def geocode_location(postal_code: str, city: str, country: str) -> Location:
    token = get_mapbox_token()
    query = f"{postal_code} {city}, {country}"
    url = "https://api.mapbox.com/search/geocode/v6/forward"
    params = {
        "access_token": token,
        "q": query,
        "limit": "1",
        "types": "postcode,place,locality,address",
        "language": "sl,en",
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text
        raise MapboxDirectionsError(f"Mapbox Geocoding API error: {detail}") from exc
    except httpx.HTTPError as exc:
        raise MapboxDirectionsError(f"Could not connect to Mapbox Geocoding API: {exc}") from exc

    data = response.json()
    features = data.get("features", [])
    if not features:
        raise MapboxDirectionsError(f"Could not find coordinates for: {query}")

    feature = features[0]
    lon, lat = feature["geometry"]["coordinates"]
    label = feature.get("properties", {}).get("full_address") or feature.get("properties", {}).get("name") or query

    return Location(lat=float(lat), lon=float(lon), label=label)


async def reverse_geocode_country(lat: float, lon: float) -> str:
    token = get_mapbox_token()
    url = "https://api.mapbox.com/search/geocode/v6/reverse"
    params = {
        "access_token": token,
        "longitude": lon,
        "latitude": lat,
        "types": "country",
        "language": "en",
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text
        raise MapboxDirectionsError(f"Mapbox Reverse Geocoding API error: {detail}") from exc
    except httpx.HTTPError as exc:
        raise MapboxDirectionsError(f"Could not connect to Mapbox Reverse Geocoding API: {exc}") from exc

    features = response.json().get("features", [])
    if not features:
        return ""

    properties = features[0].get("properties", {})
    country = properties.get("name_preferred") or properties.get("name") or properties.get("full_address") or ""
    return normalize_country(country)
