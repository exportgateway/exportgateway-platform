from app.models.schemas import (
    ClassifyProductRequest,
    DutiesRequest,
    Incoterm,
    TransportCostRequest,
    TransportMode,
    VatRequest,
    VehicleType,
)
from app.services.classification_service import classify_product
from app.services.taric_service import get_duties
from app.services.transport_service import calculate_transport_cost
from app.services.vat_service import calculate_landed_cost, calculate_vat, get_vat_rate


class DummySettings:
    ai_classification_enabled = False


def test_classification_returns_top_suggestions_without_fallback():
    response = classify_product(
        ClassifyProductRequest(product_description="cotton t-shirts for adults"),
        DummySettings(),
    )

    assert response.requires_manual_entry is False
    assert len(response.suggestions) >= 1
    assert len(response.suggestions) <= 5
    assert response.cn_code is None
    assert all(item.confidence_level >= 0.35 for item in response.suggestions)
    assert all("product-aware matching" in item.match_explanation for item in response.suggestions)
    assert all(len(item.matched_keywords) >= 1 for item in response.suggestions)


def test_classification_no_random_fallback_for_unknown_product():
    response = classify_product(
        ClassifyProductRequest(product_description="xyzzy unknown product category"),
        DummySettings(),
    )

    assert response.suggestions == []
    assert response.requires_manual_entry is True
    assert response.requires_assistance is True
    assert response.cn_code is None


def test_classification_industrial_temperature_sensor_not_refrigeration():
    response = classify_product(
        ClassifyProductRequest(
            product_description="Industrijski temperaturni senzor Pepperl+Fuchs REF-H180"
        ),
        DummySettings(),
    )

    assert response.suggestions
    top = response.suggestions[0]
    assert response.detected_language == "sl"
    assert (response.language_detection_confidence or 0) >= 0.8
    assert not top.cn_code.startswith("8418")
    assert top.cn_code.startswith("9025") or top.cn_code.startswith("9026")
    assert "temperature_sensor" in top.match_explanation or "9025" in top.cn_code


def test_classification_vehicle_model_number_not_paper_chapter():
    response = classify_product(
        ClassifyProductRequest(
            product_description="Rabljeno tovorno vozilo DAF XF 480",
            disambiguation={"vehicle_gvm_band": "over_5t"},
        ),
        DummySettings(),
    )

    assert response.suggestions
    top = response.suggestions[0]
    assert top.cn_code.startswith("870")
    assert not top.cn_code.startswith("4802")
    assert "Entities:" in top.match_explanation
    assert "goods_vehicle" in top.match_explanation or "8704" in top.cn_code


def test_classification_user_cn_in_nomenclature():
    response = classify_product(
        ClassifyProductRequest(product_description="Cotton t-shirt", cn_code="61091000"),
        DummySettings(),
    )

    assert response.user_provided is True
    assert response.suggestions[0].cn_code == "6109 10 00"
    assert response.confidence_level == 1.0


def test_intra_eu_duties_are_zero():
    response = get_duties(
        DutiesRequest(
            cn_code="6109 10 00",
            origin_country="Slovenia",
            destination_country="Germany",
            goods_value_eur=10000,
        )
    )

    assert response.duty_rate_percent == 0.0
    assert response.source == "route-intra-eu"
    assert response.customs_duty_applicable is False


def test_intra_eu_vat_not_applicable():
    payload = VatRequest(
        goods_value_eur=10000,
        transport_cost_eur=500,
        duty_rate_percent=0,
        origin_country="Slovenia",
        destination_country="Germany",
    )
    vat = calculate_vat(payload)

    assert vat.import_vat_applicable is False
    assert vat.vat_rate_percent is None
    assert vat.vat_amount_eur == 0.0


def test_vat_import_route_uses_official_rate():
    payload = VatRequest(
        goods_value_eur=10000,
        transport_cost_eur=500,
        duty_rate_percent=4,
        origin_country="United States",
        destination_country="Germany",
    )
    vat = calculate_vat(payload)

    assert vat.vat_rate_percent == 19.0
    assert vat.vat_rate_source == "Official EU VAT Table"
    assert vat.import_vat_applicable is True


def test_vat_unknown_country_has_warning_not_default_rate():
    rate, warning = get_vat_rate("Atlantis")
    payload = VatRequest(
        goods_value_eur=10000,
        transport_cost_eur=500,
        duty_rate_percent=4,
        origin_country="United States",
        destination_country="Atlantis",
    )
    vat = calculate_vat(payload)

    assert rate is None
    assert warning is not None
    assert vat.vat_rate_percent is None
    assert vat.warning is not None
    assert vat.vat_amount_eur == 0.0


def test_transport_cost_returns_positive_estimate():
    response = calculate_transport_cost(
        TransportCostRequest(
            pickup_postal_code="1000",
            delivery_postal_code="2000",
            weight_kg=800,
            loading_meters=2.4,
            vehicle_type=VehicleType.TRUCK_13_6M,
            mode=TransportMode.ROAD,
        )
    )

    assert response.estimated_cost_eur > 0


def test_landed_cost_non_eu_import():
    payload = VatRequest(
        goods_value_eur=10000,
        transport_cost_eur=500,
        duty_rate_percent=4,
        origin_country="United States",
        destination_country="Slovenia",
    )
    landed = calculate_landed_cost(payload)

    assert landed.customs_duty_eur == 400
    assert landed.import_vat_eur > 0
    assert landed.total_landed_cost_eur > 10400
