"""Enterprise HS aggregation engine — Python mirror."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

PreferentialOriginStatus = Literal["YES", "NO", "UNKNOWN"]

SERVICE_LINE_PATTERNS = [
    re.compile(r"^\s*transport\s*$", re.I),
    re.compile(r"\bfreight\b", re.I),
    re.compile(r"\bshipping\b", re.I),
    re.compile(r"\bexport\s+costs\b", re.I),
    re.compile(r"stroški\s+izvoza", re.I),
    re.compile(r"\bprevoz\b", re.I),
    re.compile(r"\bcarriage\b", re.I),
]


@dataclass
class NormalizedAggregationItem:
    position_number: int
    description: str
    quantity: float
    line_total: float
    hs_code: str
    country_of_origin: str
    net_weight: float | None
    preferential_origin: PreferentialOriginStatus


@dataclass
class HsAggregationRow:
    hs_code: str
    total_quantity: float
    total_value: float
    total_net_weight: float | None
    item_count: int
    countries_of_origin: list[str] = field(default_factory=list)
    source_positions: list[int] = field(default_factory=list)


@dataclass
class PreferenceAggregationRow:
    hs_code: str
    total_value: float
    total_net_weight: float | None
    total_quantity: float
    source_positions: list[int] = field(default_factory=list)


@dataclass
class MrnSummary:
    total_goods_lines: int
    unique_hs_codes: int
    total_invoice_value: float
    total_net_weight: float | None
    total_gross_weight: float | None
    countries_of_origin: list[str]
    excluded_service_lines: int


@dataclass
class HsAggregationResult:
    hs_aggregation: list[HsAggregationRow]
    preferential_summary: list[PreferenceAggregationRow]
    non_preferential_summary: list[PreferenceAggregationRow]
    unknown_preference_summary: list[PreferenceAggregationRow]
    mrn_summary: MrnSummary


def is_service_or_transport_line(description: str | None) -> bool:
    text = (description or "").strip()
    if not text:
        return False
    return any(pattern.search(text) for pattern in SERVICE_LINE_PATTERNS)


def _parse_numeric(value: object) -> float:
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    normalized = str(value).strip().replace(" ", "").replace(".", "").replace(",", ".")
    try:
        return float(normalized)
    except ValueError:
        return 0.0


def _round_value(value: float) -> float:
    return round(value, 2)


def _round_weight(value: float) -> float:
    return round(value, 3)


def filter_goods_lines(items: list[NormalizedAggregationItem]) -> list[NormalizedAggregationItem]:
    return [
        item
        for item in items
        if not is_service_or_transport_line(item.description) and item.hs_code
    ]


def _aggregate_by_hs(goods: list[NormalizedAggregationItem]) -> list[HsAggregationRow]:
    groups: dict[str, HsAggregationRow] = {}
    for item in goods:
        row = groups.get(item.hs_code)
        if row is None:
            groups[item.hs_code] = HsAggregationRow(
                hs_code=item.hs_code,
                total_quantity=item.quantity,
                total_value=item.line_total,
                total_net_weight=item.net_weight,
                item_count=1,
                countries_of_origin=[item.country_of_origin] if item.country_of_origin else [],
                source_positions=[item.position_number],
            )
            continue
        row.total_quantity += item.quantity
        row.total_value += item.line_total
        row.item_count += 1
        row.source_positions.append(item.position_number)
        if item.net_weight is not None:
            row.total_net_weight = (row.total_net_weight or 0) + item.net_weight
        if item.country_of_origin and item.country_of_origin not in row.countries_of_origin:
            row.countries_of_origin.append(item.country_of_origin)

    result = list(groups.values())
    for row in result:
        row.total_quantity = _round_value(row.total_quantity)
        row.total_value = _round_value(row.total_value)
        if row.total_net_weight is not None:
            row.total_net_weight = _round_weight(row.total_net_weight)
        row.countries_of_origin.sort()
        row.source_positions.sort()
    return sorted(result, key=lambda r: r.hs_code)


def _aggregate_preference_bucket(
    goods: list[NormalizedAggregationItem], status: PreferentialOriginStatus
) -> list[PreferenceAggregationRow]:
    groups: dict[str, PreferenceAggregationRow] = {}
    for item in goods:
        if item.preferential_origin != status:
            continue
        row = groups.get(item.hs_code)
        if row is None:
            groups[item.hs_code] = PreferenceAggregationRow(
                hs_code=item.hs_code,
                total_value=item.line_total,
                total_net_weight=item.net_weight,
                total_quantity=item.quantity,
                source_positions=[item.position_number],
            )
            continue
        row.total_value += item.line_total
        row.total_quantity += item.quantity
        row.source_positions.append(item.position_number)
        if item.net_weight is not None:
            row.total_net_weight = (row.total_net_weight or 0) + item.net_weight

    result = list(groups.values())
    for row in result:
        row.total_value = _round_value(row.total_value)
        row.total_quantity = _round_value(row.total_quantity)
        if row.total_net_weight is not None:
            row.total_net_weight = _round_weight(row.total_net_weight)
        row.source_positions.sort()
    return sorted(result, key=lambda r: r.hs_code)


def run_hs_aggregation_engine(
    items: list[NormalizedAggregationItem],
    gross_weight: float | None = None,
) -> HsAggregationResult:
    excluded = sum(1 for item in items if is_service_or_transport_line(item.description))
    goods = filter_goods_lines(items)
    hs_rows = _aggregate_by_hs(goods)

    total_net: float | None = None
    origins: set[str] = set()
    for item in goods:
        if item.country_of_origin:
            origins.add(item.country_of_origin)
        if item.net_weight is not None:
            total_net = (total_net or 0) + item.net_weight

    mrn = MrnSummary(
        total_goods_lines=len(goods),
        unique_hs_codes=len(hs_rows),
        total_invoice_value=_round_value(sum(item.line_total for item in goods)),
        total_net_weight=_round_weight(total_net) if total_net is not None else None,
        total_gross_weight=_round_weight(gross_weight) if gross_weight is not None else None,
        countries_of_origin=sorted(origins),
        excluded_service_lines=excluded,
    )

    return HsAggregationResult(
        hs_aggregation=hs_rows,
        preferential_summary=_aggregate_preference_bucket(goods, "YES"),
        non_preferential_summary=_aggregate_preference_bucket(goods, "NO"),
        unknown_preference_summary=_aggregate_preference_bucket(goods, "UNKNOWN"),
        mrn_summary=mrn,
    )
