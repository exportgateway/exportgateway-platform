import logging
import smtplib
from email.message import EmailMessage

from app.core.config import Settings
from app.models.schemas import LeadRequest

logger = logging.getLogger(__name__)


def build_lead_email(payload: LeadRequest) -> tuple[str, str]:
    subject = (
        f"Export Compliance Wizard lead — {payload.company_name} "
        f"({payload.origin_country} → {payload.destination_country})"
    )
    body = f"""New assistance request from the Export Compliance Wizard

Company: {payload.company_name}
Contact: {payload.contact_name}
Email: {payload.email}

Country of export: {payload.origin_country}
Destination country: {payload.destination_country}

Product description:
{payload.product_description}

CN / HS code: {payload.cn_code}

Wizard summary:
{payload.wizard_summary}

---
Sent automatically from ExportGateway.eu Export Compliance Wizard.
"""
    return subject, body


def send_lead_email(payload: LeadRequest, settings: Settings) -> None:
    subject, body = build_lead_email(payload)
    recipient = settings.lead_email_to

    if settings.smtp_host:
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = settings.smtp_from
        message["To"] = recipient
        message["Reply-To"] = payload.email
        message.set_content(body)

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            if settings.smtp_use_tls:
                server.starttls()
            if settings.smtp_username and settings.smtp_password:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
        logger.info("Lead email sent to %s for %s", recipient, payload.email)
        return

    if settings.app_env == "local" or settings.lead_allow_dev_log:
        logger.warning(
            "SMTP not configured; lead logged only (env=%s). Lead from %s <%s>:\n%s",
            settings.app_env,
            payload.contact_name,
            payload.email,
            body,
        )
        return

    raise RuntimeError(
        "Lead email is not configured. Set SMTP_HOST and related variables on the server."
    )
