"""Consignee-based destination country resolution for export invoices."""

from __future__ import annotations

import re

from app.modules.export_auditor.schemas import NormalizedInvoice

CONSIGNEE_POSTAL_PREFIX_COUNTRIES: dict[str, tuple[str, str]] = {
    "MK": ("MK", "North Macedonia"),
    "RS": ("RS", "Serbia"),
    "BA": ("BA", "Bosnia and Herzegovina"),
    "AL": ("AL", "Albania"),
    "XK": ("XK", "Kosovo"),
    "ME": ("ME", "Montenegro"),
}

POSTAL_PREFIX_RE = re.compile(r"\b(MK|RS|BA|AL|XK|ME)-(\d{4,5})\b", re.IGNORECASE)


def extract_destination_from_consignee(consignee: str) -> tuple[str, str] | None:
    """Return (country_name, country_code) from consignee postal prefix, or None."""
    if not consignee.strip():
        return None

    match = POSTAL_PREFIX_RE.search(consignee)
    if not match:
        return None

    prefix = match.group(1).upper()
    mapped = CONSIGNEE_POSTAL_PREFIX_COUNTRIES.get(prefix)
    if not mapped:
        return None

    code, name = mapped
    return name, code


def resolve_destination_from_consignee(invoice: NormalizedInvoice) -> NormalizedInvoice:
    """
    Destination country must be the consignee/importer country.

    Consignee-derived country wins over exporter address, Incoterms place, and EXW location.
    """
    extracted = extract_destination_from_consignee(invoice.consignee)
    if not extracted:
        return invoice

    name, code = extracted
    return invoice.model_copy(update={"country": name, "country_code": code})
