from fastapi.testclient import TestClient

import app as freight_app


client = TestClient(freight_app.app)


def test_root_returns_status():
    response = client.get("/")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_price_uses_fallback_distance_without_coordinates():
    response = client.post(
        "/price",
        json={
            "country_from": "SI",
            "country_to": "DE",
            "weight_kg": 10000,
            "pallets": 34,
            "loading_meters": 13.6,
            "transport_type": "FTL",
        },
    )

    body = response.json()

    assert response.status_code == 200
    assert body["success"] is True
    assert body["distance_km"] == 500
    assert body["distance_source"] == "fallback"
    assert "warning" in body
    assert body["price_eur"] > 0


def test_price_uses_haversine_without_mapbox_token(monkeypatch):
    monkeypatch.delenv("MAPBOX_TOKEN", raising=False)

    response = client.post(
        "/price",
        json={
            "from_lat": 46.0569,
            "from_lon": 14.5058,
            "to_lat": 52.52,
            "to_lon": 13.405,
            "weight_kg": 1000,
            "pallets": 2,
            "loading_meters": 1.2,
            "transport_type": "FTL",
        },
    )

    body = response.json()

    assert response.status_code == 200
    assert body["distance_source"] == "haversine"
    assert body["distance_km"] != 500
    assert "warning" in body


def test_price_rejects_negative_weight():
    response = client.post(
        "/price",
        json={
            "weight_kg": -1,
            "pallets": 1,
            "loading_meters": 0.4,
            "transport_type": "LTL",
        },
    )

    assert response.status_code == 422


def test_price_accepts_lowercase_transport_type():
    response = client.post(
        "/price",
        json={
            "weight_kg": 700,
            "pallets": 4,
            "loading_meters": 1.6,
            "transport_type": "ltl",
        },
    )

    assert response.status_code == 200
    assert response.json()["price_eur"] > 0
