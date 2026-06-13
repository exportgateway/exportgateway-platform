from app.core.config import Settings
from app.models.schemas import LeadRequest
from app.services.lead_service import build_lead_email, send_lead_email


def test_build_lead_email_includes_required_fields():
    payload = LeadRequest(
        company_name="Acme Logistics",
        contact_name="Jane Doe",
        email="jane@acme.example",
        origin_country="Slovenia",
        destination_country="Germany",
        product_description="Cotton t-shirts",
        cn_code="6109 10 00",
        wizard_summary="Goods value: EUR 10,000\nTotal landed cost: EUR 13,298",
    )
    subject, body = build_lead_email(payload)

    assert "Acme Logistics" in subject
    assert "jane@acme.example" in body
    assert "6109 10 00" in body
    assert "Wizard summary" in body


def test_send_lead_logs_when_smtp_missing_in_local(monkeypatch):
    payload = LeadRequest(
        company_name="Test Co",
        contact_name="Test User",
        email="test@example.com",
        origin_country="Slovenia",
        destination_country="Italy",
        product_description="Test goods",
        cn_code="8479 89 97",
        wizard_summary="Summary line for testing purposes only.",
    )
    settings = Settings(
        app_env="local",
        smtp_host=None,
        lead_allow_dev_log=True,
    )

    send_lead_email(payload, settings)
