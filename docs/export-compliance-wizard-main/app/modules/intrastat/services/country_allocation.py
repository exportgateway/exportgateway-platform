import asyncio
import os
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from app.modules.intrastat.services.countries import normalize_country
from app.modules.intrastat.services.geometry import haversine_km

CountryLookup = Callable[[float, float], Awaitable[str]]


@dataclass(frozen=True)
class CountryBreakdown:
    domestic_km: float
    route_segments: list[dict[str, object]]


async def estimate_country_km(
    coordinates: list[tuple[float, float]],
    target_country: str,
    lookup_country: CountryLookup,
) -> float:
    breakdown = await estimate_country_breakdown(coordinates, target_country, lookup_country)
    return breakdown.domestic_km


async def estimate_country_breakdown(
    coordinates: list[tuple[float, float]],
    target_country: str,
    lookup_country: CountryLookup,
) -> CountryBreakdown:
    sample_km = max(float(os.getenv("COUNTRY_SAMPLE_KM", "10")), 1)
    samples = build_route_sample_segments(coordinates, sample_km)
    if not samples:
        return CountryBreakdown(domestic_km=0, route_segments=[])

    target = normalize_country(target_country)
    semaphore = asyncio.Semaphore(int(os.getenv("COUNTRY_LOOKUP_CONCURRENCY", "10")))

    async def classify(sample: dict[str, object]) -> dict[str, object]:
        midpoint = sample["midpoint"]
        lat, lon = midpoint
        async with semaphore:
            country = await lookup_country(lat, lon)
        segment_type = "domestic" if normalize_country(country) == target else "foreign"
        return {
            "segment_type": segment_type,
            "distance_km": sample["distance_km"],
            "coordinates": sample["coordinates"],
        }

    classified = await asyncio.gather(*(classify(sample) for sample in samples))
    domestic_km = sum(float(item["distance_km"]) for item in classified if item["segment_type"] == "domestic")
    route_segments = merge_route_segments(classified)
    return CountryBreakdown(domestic_km=domestic_km, route_segments=route_segments)


def merge_route_segments(classified: list[dict[str, object]]) -> list[dict[str, object]]:
    merged: list[dict[str, object]] = []

    for segment in classified:
        current_type = str(segment["segment_type"])
        current_coordinates = segment["coordinates"]
        if not merged or merged[-1]["segment_type"] != current_type:
            merged.append(
                {
                    "segment_type": current_type,
                    "coordinates": list(current_coordinates),
                }
            )
            continue

        merged[-1]["coordinates"].extend(list(current_coordinates)[1:])

    return merged


def build_route_sample_segments(
    coordinates: list[tuple[float, float]],
    sample_km: float,
) -> list[dict[str, object]]:
    segments = build_distance_segments(coordinates)
    if not segments:
        return []

    polyline_km = segments[-1][1]
    samples = []
    cursor = 0.0
    while cursor < polyline_km:
        next_cursor = min(cursor + sample_km, polyline_km)
        start_lat, start_lon = point_at_distance(segments, cursor)
        end_lat, end_lon = point_at_distance(segments, next_cursor)
        midpoint_lat, midpoint_lon = point_at_distance(segments, (cursor + next_cursor) / 2)
        samples.append(
            {
                "distance_km": next_cursor - cursor,
                "midpoint": (midpoint_lat, midpoint_lon),
                "coordinates": [[start_lat, start_lon], [end_lat, end_lon]],
            }
        )
        cursor = next_cursor

    return samples


def build_route_samples(
    coordinates: list[tuple[float, float]],
    sample_km: float,
) -> list[tuple[float, float, float]]:
    segments = build_distance_segments(coordinates)
    if not segments:
        return []

    polyline_km = segments[-1][1]
    samples = []
    cursor = 0.0
    while cursor < polyline_km:
        next_cursor = min(cursor + sample_km, polyline_km)
        midpoint_km = (cursor + next_cursor) / 2
        lat, lon = point_at_distance(segments, midpoint_km)
        samples.append((lat, lon, next_cursor - cursor))
        cursor = next_cursor

    return samples


def build_distance_segments(
    coordinates: list[tuple[float, float]],
) -> list[tuple[float, float, tuple[float, float], tuple[float, float]]]:
    segments = []
    polyline_km = 0.0

    for start, end in zip(coordinates, coordinates[1:]):
        start_lon, start_lat = start
        end_lon, end_lat = end
        distance_km = haversine_km(start_lat, start_lon, end_lat, end_lon)
        if distance_km <= 0:
            continue

        segments.append((polyline_km, polyline_km + distance_km, start, end))
        polyline_km += distance_km

    return segments


def point_at_distance(
    segments: list[tuple[float, float, tuple[float, float], tuple[float, float]]],
    target_km: float,
) -> tuple[float, float]:
    for start_km, end_km, start, end in segments:
        if start_km <= target_km <= end_km:
            ratio = (target_km - start_km) / (end_km - start_km)
            start_lon, start_lat = start
            end_lon, end_lat = end
            lat = start_lat + (end_lat - start_lat) * ratio
            lon = start_lon + (end_lon - start_lon) * ratio
            return lat, lon

    last_lon, last_lat = segments[-1][3]
    return last_lat, last_lon
