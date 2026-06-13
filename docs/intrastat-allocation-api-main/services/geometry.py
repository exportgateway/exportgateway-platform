from math import asin, cos, radians, sin, sqrt


# Simplified Slovenia border polygon. Mapbox remains the source of the road
# route; this polygon is only used to split the route into Slovenia/foreign km.
SLOVENIA_POLYGON = [
    (46.878, 13.714),
    (46.875, 14.550),
    (46.867, 15.650),
    (46.831, 16.321),
    (46.655, 16.576),
    (46.476, 16.454),
    (46.348, 16.297),
    (46.229, 16.174),
    (46.083, 15.981),
    (45.914, 15.775),
    (45.825, 15.672),
    (45.733, 15.580),
    (45.642, 15.348),
    (45.592, 15.132),
    (45.477, 14.972),
    (45.452, 14.642),
    (45.422, 14.274),
    (45.467, 13.941),
    (45.590, 13.616),
    (45.745, 13.577),
    (45.978, 13.607),
    (46.226, 13.490),
    (46.432, 13.604),
    (46.536, 13.714),
    (46.878, 13.714),
]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_km = 6371.0088
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    r_lat1 = radians(lat1)
    r_lat2 = radians(lat2)

    a = sin(d_lat / 2) ** 2 + cos(r_lat1) * cos(r_lat2) * sin(d_lon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return earth_radius_km * c


def is_point_in_slovenia(lat: float, lon: float) -> bool:
    inside = False
    previous_lat, previous_lon = SLOVENIA_POLYGON[-1]

    for current_lat, current_lon in SLOVENIA_POLYGON:
        crosses = (current_lon > lon) != (previous_lon > lon)
        if crosses:
            slope_lat = (previous_lat - current_lat) * (lon - current_lon)
            slope_lon = previous_lon - current_lon
            intersection_lat = slope_lat / slope_lon + current_lat
            if lat < intersection_lat:
                inside = not inside

        previous_lat, previous_lon = current_lat, current_lon

    return inside
