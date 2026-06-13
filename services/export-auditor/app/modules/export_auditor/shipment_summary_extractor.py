"""Shipment summary and delivery address extraction from invoice-level OCR text."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.modules.export_auditor.multilingual_invoice_labels import (
    build_label_alternation,
    build_labeled_value_pattern,
    build_section_header_pattern,
    MULTILINGUAL_FIELD_LABELS,
)

POSTAL_PREFIX_COUNTRIES = {
    "MK": ("MK", "North Macedonia"),
    "RS": ("RS", "Serbia"),
    "BA": ("BA", "Bosnia and Herzegovina"),
    "AL": ("AL", "Albania"),
    "XK": ("XK", "Kosovo"),
    "ME": ("ME", "Montenegro"),
    "SI": ("SI", "Slovenia"),
    "HR": ("HR", "Croatia"),
    "AT": ("AT", "Austria"),
    "DE": ("DE", "Germany"),
    "IT": ("IT", "Italy"),
}

COUNTRY_NAME_TO_CODE = {
    "serbia": "RS",
    "srbija": "RS",
    "north macedonia": "MK",
    "slovenia": "SI",
    "slovenija": "SI",
}


@dataclass
class ShipmentSummary:
    package_count: int | None = None
    package_type: str | None = None
    pallet_count: int | None = None
    gross_weight_total: float | None = None
    gross_weight_unit: str | None = None
    net_weight_total: float | None = None
    net_weight_unit: str | None = None
    pallet_dimensions: str | None = None


@dataclass
class DeliveryAddress:
    company: str | None = None
    address: str | None = None
    city: str | None = None
    postal_code: str | None = None
    country: str | None = None
    country_code: str | None = None


def _infer_package_type(token: str | None) -> str | None:
    if not token:
        return None
    lower = token.lower()
    if re.search(r"\bkoli\b|\bcolli\b", lower):
        return "COLLI"
    if re.search(r"palet|pallet", lower):
        return "PALLET"
    return None


def _parse_weight(raw: str) -> float | None:
    normalized = raw.strip().replace(" ", "").replace(".", "").replace(",", ".")
    try:
        return float(normalized)
    except ValueError:
        return None


def _normalize_corpus(corpus: str) -> str:
    """Flatten HTML table markup so label/value regexes work on OCR table cells."""
    if "<" not in corpus:
        return corpus
    text = re.sub(r"</tr>", "\n", corpus, flags=re.I)
    text = re.sub(r"</td>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text


def extract_package_count(corpus: str) -> tuple[int | None, str | None]:
    corpus = _normalize_corpus(corpus)
    package_label = build_labeled_value_pattern("packages")
    match = package_label.search(corpus)
    if match:
        after = corpus[match.end() :]
        value = re.match(r"^\s*(\d+)", after)
        if value:
            return int(value.group(1)), "COLLI"

    pallet_label = build_label_alternation(MULTILINGUAL_FIELD_LABELS["pallets"])
    pallet_match = re.search(rf"(\d+)\s*(?:x\s*)?\b(?:{pallet_label})\b", corpus, re.I)
    if pallet_match:
        return int(pallet_match.group(1)), "PALLET"

    patterns = [
        (re.compile(r"skupaj\s+število\s*[:\-]?\s*(\d+)\s*(koli|colli|palet(?:a|e|i)?|pallets?)?", re.I), 2),
        (re.compile(r"število\s+koli\s*[:\-]?\s*(\d+)", re.I), None),
        (re.compile(r"number\s+of\s+packages?\s*[:\-]?\s*(\d+)", re.I), None),
        (re.compile(r"packages?\s*[:\-]?\s*(\d+)", re.I), None),
        (re.compile(r"(\d+)\s+pallets?\b", re.I), -1),
        (re.compile(r"(\d+)\s+palet(?:a|e|i)?\b", re.I), -1),
        (re.compile(r"(\d+)\s+koli\b", re.I), -1),
        (re.compile(r"(\d+)\s+colli\b", re.I), -1),
    ]
    for pattern, type_index in patterns:
        match = pattern.search(corpus)
        if not match:
            continue
        count = int(match.group(1))
        package_type = None
        if type_index == -1:
            package_type = _infer_package_type("pallet" if "palet" in pattern.pattern else "koli")
        elif type_index and len(match.groups()) >= type_index:
            package_type = _infer_package_type(match.group(type_index))
        elif re.search(r"koli|colli", match.group(0), re.I):
            package_type = "COLLI"
        elif re.search(r"palet|pallet", match.group(0), re.I):
            package_type = "PALLET"
        return count, package_type
    return None, None


def extract_gross_weight(corpus: str) -> tuple[float | None, str | None]:
    corpus = _normalize_corpus(corpus)
    gross_label = build_labeled_value_pattern("grossWeight")
    match = gross_label.search(corpus)
    if match:
        after = corpus[match.end() :]
        value = re.match(r"^\s*([\d.,]+)\s*(kg|g|lb|t|ton)?", after, re.I)
        if value:
            total = _parse_weight(value.group(1))
            if total is not None:
                return total, (value.group(2) or "kg").lower()

    patterns = [
        re.compile(r"skupna\s+bruto\s+teža\s*[:\-]?\s*([\d.,]+)\s*(kg|g|lb|t|ton)?", re.I),
        re.compile(r"bruto\s+teža\s*[:\-]?\s*([\d.,]+)\s*(kg|g|lb|t|ton)?", re.I),
        re.compile(r"gross\s+weight\s*[:\-]?\s*([\d.,]+)\s*(kg|g|lb|t|ton)?", re.I),
    ]
    for pattern in patterns:
        match = pattern.search(corpus)
        if not match:
            continue
        total = _parse_weight(match.group(1))
        if total is None:
            continue
        unit = (match.group(2) or "kg").lower()
        return total, unit
    return None, None


def extract_net_weight(corpus: str) -> tuple[float | None, str | None]:
    corpus = _normalize_corpus(corpus)
    net_label = build_labeled_value_pattern("netWeight")
    match = net_label.search(corpus)
    if not match:
        return None, None
    after = corpus[match.end() :]
    value = re.match(r"^\s*([\d.,]+)\s*(kg|g|lb|t|ton)?", after, re.I)
    if not value:
        return None, None
    total = _parse_weight(value.group(1))
    if total is None:
        return None, None
    return total, (value.group(2) or "kg").lower()


def extract_pallet_count(corpus: str) -> int | None:
    corpus = _normalize_corpus(corpus)
    pallet_label = build_label_alternation(MULTILINGUAL_FIELD_LABELS["pallets"])
    match = re.search(rf"\b(?:{pallet_label})\b\s*:?\s*(\d+)", corpus, re.I)
    if match:
        return int(match.group(1))
    match = re.search(rf"(\d+)\s*(?:x\s*)?\b(?:{pallet_label})\b", corpus, re.I)
    return int(match.group(1)) if match else None


def extract_pallet_dimensions(corpus: str) -> str | None:
    labeled = [
        re.compile(r"paleta\s+dimenzije\s*[:\-]?\s*(\d{2,3}\s*[x×]\s*\d{2,3}\s*[x×]\s*\d{2,3}\s*cm)", re.I),
        re.compile(r"pallet\s+dimensions?\s*[:\-]?\s*(\d{2,3}\s*[x×]\s*\d{2,3}\s*[x×]\s*\d{2,3}\s*cm)", re.I),
    ]
    for pattern in labeled:
        match = pattern.search(corpus)
        if match:
            dim = re.sub(r"\s+", "", match.group(1)).replace("×", "x")
            return dim if "cm" in dim.lower() else f"{dim} cm"
    return None


def extract_delivery_address(corpus: str) -> DeliveryAddress:
    label = build_section_header_pattern("deliverySection").search(corpus)
    if not label:
        consignee = build_section_header_pattern("consigneeSection").search(corpus)
        if consignee:
            label = consignee
    if not label:
        return DeliveryAddress()

    remainder = corpus[label.end() :]
    block_lines: list[str] = []
    for raw in remainder.split("\n"):
        line = raw.strip()
        if not line and block_lines:
            break
        if block_lines and re.match(
            r"^(?:skupaj|število|bruto|gross|paleta|pallet|invoice|račun|total)",
            line,
            re.I,
        ):
            break
        if line:
            block_lines.append(line)
        if len(block_lines) >= 8:
            break

    company = address = city = postal_code = country = country_code = None
    postal_re = re.compile(r"\b([A-Z]{2}-\d{4,5})\b", re.I)
    city_postal_re = re.compile(r"^(.+?)\s+([A-Z]{2}-\d{4,5})\s*(.*)$", re.I)

    for i, line in enumerate(block_lines):
        city_postal = city_postal_re.match(line)
        if city_postal:
            city = city_postal.group(1).strip()
            postal_code = city_postal.group(2).upper()
            prefix = postal_code.split("-")[0]
            if prefix in POSTAL_PREFIX_COUNTRIES:
                country_code, country = POSTAL_PREFIX_COUNTRIES[prefix]
            continue

        postal_only = postal_re.search(line)
        if postal_only and not postal_code:
            postal_code = postal_only.group(1).upper()
            prefix = postal_code.split("-")[0]
            if prefix in POSTAL_PREFIX_COUNTRIES:
                country_code, country = POSTAL_PREFIX_COUNTRIES[prefix]
            continue

        lower = line.lower()
        for name, code in COUNTRY_NAME_TO_CODE.items():
            if name in lower:
                country_code = code
                country = POSTAL_PREFIX_COUNTRIES[code][1]
                break

        if not company:
            company = line
        elif not address:
            address = line
        elif not city:
            city = line

    return DeliveryAddress(
        company=company,
        address=address,
        city=city,
        postal_code=postal_code,
        country=country,
        country_code=country_code,
    )


def extract_shipment_summary(corpus: str) -> ShipmentSummary:
    package_count, package_type = extract_package_count(corpus)
    gross_weight_total, gross_weight_unit = extract_gross_weight(corpus)
    net_weight_total, net_weight_unit = extract_net_weight(corpus)
    pallet_count = extract_pallet_count(corpus)
    pallet_dimensions = extract_pallet_dimensions(corpus)
    return ShipmentSummary(
        package_count=package_count,
        package_type=package_type,
        pallet_count=pallet_count,
        gross_weight_total=gross_weight_total,
        gross_weight_unit=gross_weight_unit,
        net_weight_total=net_weight_total,
        net_weight_unit=net_weight_unit,
        pallet_dimensions=pallet_dimensions,
    )


MISSING_PACKAGE_COUNT = "MISSING_PACKAGE_COUNT"
MISSING_GROSS_WEIGHT = "MISSING_GROSS_WEIGHT"


def evaluate_shipment_readiness(summary: ShipmentSummary | None) -> list[tuple[str, str]]:
    warnings: list[tuple[str, str]] = []
    if summary is None or summary.package_count is None:
        warnings.append(
            (
                MISSING_PACKAGE_COUNT,
                "Package count is missing. Package quantity is commonly required for export declarations.",
            )
        )
    if summary is None or summary.gross_weight_total is None:
        warnings.append(
            (
                MISSING_GROSS_WEIGHT,
                "Gross shipment weight is missing. Gross weight is commonly required for customs declarations.",
            )
        )
    return warnings
