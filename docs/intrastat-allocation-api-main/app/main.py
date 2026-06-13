import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import IntrastatAddressRequest, IntrastatRequest, IntrastatResponse, RootResponse
from app.services.allocation import calculate_costs
from app.services.country_allocation import estimate_country_breakdown
from app.services.mapbox import MapboxDirectionsError, geocode_location, get_route, reverse_geocode_country


app = FastAPI(
    title="Intrastat Freight Allocation Tool",
    description="Calculates domestic and foreign freight cost allocation for Intrastat/accounting purposes across European routes.",
    version="1.0.0",
)

allowed_origins = os.getenv("CORS_ORIGINS", "*")
origins = [origin.strip() for origin in allowed_origins.split(",") if origin.strip()]
allow_credentials = "*" not in origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_model=RootResponse)
def root() -> RootResponse:
    return RootResponse(
        success=True,
        message="Intrastat Freight Allocation Tool API is running.",
    )


@app.post("/intrastat", response_model=IntrastatResponse)
async def intrastat(payload: IntrastatRequest) -> IntrastatResponse:
    try:
        route = await get_route(
            from_lat=payload.from_lat,
            from_lon=payload.from_lon,
            to_lat=payload.to_lat,
            to_lon=payload.to_lon,
        )
    except MapboxDirectionsError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    try:
        breakdown = await estimate_country_breakdown(
            coordinates=route.coordinates,
            target_country=payload.domestic_country,
            lookup_country=reverse_geocode_country,
        )
    except MapboxDirectionsError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    result = calculate_costs(
        total_distance_meters=route.distance_meters,
        total_cost=payload.total_cost,
        domestic_km=breakdown.domestic_km,
    )
    result["route_summary"] = {
        "pickup": f"{payload.from_lat}, {payload.from_lon}",
        "delivery": f"{payload.to_lat}, {payload.to_lon}",
        "total_distance": f"{result['total_km']} km",
        "allocation_country": payload.domestic_country,
    }
    result["route_segments"] = breakdown.route_segments

    return IntrastatResponse(success=True, **result)


@app.post("/intrastat/address", response_model=IntrastatResponse)
async def intrastat_by_address(payload: IntrastatAddressRequest) -> IntrastatResponse:
    try:
        pickup = await geocode_location(
            postal_code=payload.from_postal_code,
            city=payload.from_city,
            country=payload.from_country,
        )
        delivery = await geocode_location(
            postal_code=payload.to_postal_code,
            city=payload.to_city,
            country=payload.to_country,
        )
        route = await get_route(
            from_lat=pickup.lat,
            from_lon=pickup.lon,
            to_lat=delivery.lat,
            to_lon=delivery.lon,
        )
    except MapboxDirectionsError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    try:
        breakdown = await estimate_country_breakdown(
            coordinates=route.coordinates,
            target_country=payload.domestic_country,
            lookup_country=reverse_geocode_country,
        )
    except MapboxDirectionsError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    result = calculate_costs(
        total_distance_meters=route.distance_meters,
        total_cost=payload.total_cost,
        domestic_km=breakdown.domestic_km,
    )
    result["route_summary"] = {
        "pickup": f"{payload.from_city}, {payload.from_country}",
        "delivery": f"{payload.to_city}, {payload.to_country}",
        "total_distance": f"{result['total_km']} km",
        "allocation_country": payload.domestic_country,
    }
    result["route_segments"] = breakdown.route_segments

    return IntrastatResponse(success=True, **result)
