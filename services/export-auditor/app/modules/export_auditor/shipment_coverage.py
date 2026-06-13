"""Shipment field coverage metrics for OCR observability."""

from __future__ import annotations

from app.modules.export_auditor.schemas import ShipmentSummary

TRACKED_SHIPMENT_FIELDS = (
    "gross_weight_total",
    "net_weight_total",
    "package_count",
    "package_type",
    "pallet_count",
)


def _field_present(summary: ShipmentSummary, field_name: str) -> bool:
    value = getattr(summary, field_name, None)
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True


def compute_shipment_field_coverage(
    summary: ShipmentSummary | None,
) -> tuple[list[str], list[str]]:
    """Return (detected_fields, missing_fields) for observability dashboard."""
    if summary is None:
        return [], list(TRACKED_SHIPMENT_FIELDS)

    detected: list[str] = []
    missing: list[str] = []
    for field_name in TRACKED_SHIPMENT_FIELDS:
        if _field_present(summary, field_name):
            detected.append(field_name)
        else:
            missing.append(field_name)
    return detected, missing


def has_structured_shipment_data(summary: ShipmentSummary | None) -> bool:
    if summary is None:
        return False
    return summary.package_count is not None or summary.gross_weight_total is not None
