from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_freight_api_route_registered():
    response = client.get("/api/freight/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_intrastat_api_route_registered():
    response = client.get("/api/intrastat/")
    assert response.status_code == 200
    assert response.json()["success"] is True


def test_legacy_price_route_registered():
    response = client.post(
        "/price",
        json={
            "from_lat": 46.05,
            "from_lon": 14.51,
            "to_lat": 52.52,
            "to_lon": 13.40,
            "weight_kg": 500,
            "pallets": 1,
            "transport_type": "LTL",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert "price_eur" in body


def test_freight_prefixed_price_matches_legacy():
    payload = {
        "from_lat": 46.05,
        "from_lon": 14.51,
        "to_lat": 52.52,
        "to_lon": 13.40,
        "weight_kg": 500,
        "pallets": 1,
        "transport_type": "LTL",
    }
    legacy = client.post("/price", json=payload).json()
    prefixed = client.post("/api/freight/price", json=payload).json()
    assert legacy == prefixed


def test_compliance_health_unchanged():
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json()["status"] == "live"
