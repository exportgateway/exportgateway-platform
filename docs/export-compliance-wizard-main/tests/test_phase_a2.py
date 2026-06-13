from app.models.schemas import ClassifyProductRequest
from app.services.classification_service import classify_product
from app.services.polysemy_service import apply_polysemy_context
from tests.test_services import DummySettings


def test_ifm_pn7094_pressure_sensor_family():
    r = classify_product(ClassifyProductRequest(product_description="IFM PN7094"), DummySettings())
    assert r.cpr and "pressure_sensor" in r.cpr.product_families
    assert r.suggestions
    assert r.suggestions[0].cn_code.replace(" ", "").startswith("9026")


def test_printer_cartridge_not_chapter_93():
    r = classify_product(
        ClassifyProductRequest(product_description="Printer cartridge"), DummySettings()
    )
    if r.suggestions:
        assert r.suggestions[0].cn_code.replace(" ", "")[:2] != "93"


def test_womens_polyester_jacket_not_chapter_39():
    r = classify_product(
        ClassifyProductRequest(product_description="Women's polyester jacket"),
        DummySettings(),
    )
    assert r.cpr and "apparel_jacket_womens" in r.cpr.product_families
    if r.suggestions:
        assert r.suggestions[0].cn_code.replace(" ", "")[:2] in {"61", "62"}


def test_polysemy_permanent_marker():
    poly = apply_polysemy_context("Permanent marker")
    assert "stationery_marker" in poly.family_ids


def test_danfoss_fc302_inverter():
    r = classify_product(
        ClassifyProductRequest(product_description="Danfoss FC302"), DummySettings()
    )
    assert r.cpr and "frequency_inverter" in r.cpr.product_families
