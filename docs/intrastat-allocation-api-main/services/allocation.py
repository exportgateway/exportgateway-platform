from app.services.geometry import haversine_km, is_point_in_slovenia


def calculate_allocation(
    coordinates: list[tuple[float, float]],
    total_distance_meters: float,
    total_cost: float,
) -> dict[str, float]:
    domestic_km = estimate_domestic_slovenia_km(coordinates)
    return calculate_costs(total_distance_meters, total_cost, domestic_km)


def calculate_costs(
    total_distance_meters: float,
    total_cost: float,
    domestic_km: float,
) -> dict[str, float]:
    total_km = total_distance_meters / 1000

    domestic_km = min(domestic_km, total_km)
    foreign_km = max(total_km - domestic_km, 0)

    if total_km <= 0:
        domestic_cost = 0
        foreign_cost = total_cost
    else:
        domestic_cost = (domestic_km / total_km) * total_cost
        foreign_cost = total_cost - domestic_cost

    return {
        "total_km": round(total_km, 2),
        "domestic_km": round(domestic_km, 2),
        "foreign_km": round(foreign_km, 2),
        "domestic_cost": round(domestic_cost, 2),
        "foreign_cost": round(foreign_cost, 2),
    }


def estimate_domestic_slovenia_km(coordinates: list[tuple[float, float]]) -> float:
    domestic_km = 0.0

    for start, end in zip(coordinates, coordinates[1:]):
        start_lon, start_lat = start
        end_lon, end_lat = end
        midpoint_lat = (start_lat + end_lat) / 2
        midpoint_lon = (start_lon + end_lon) / 2

        if is_point_in_slovenia(midpoint_lat, midpoint_lon):
            domestic_km += haversine_km(start_lat, start_lon, end_lat, end_lon)

    return domestic_km
