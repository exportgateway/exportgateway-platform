"""Preferential Origin Engine — per-line preference from explicit invoice declarations only."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.modules.export_auditor.schemas import InvoiceItem, NormalizedInvoice

PreferentialOriginStatus = str  # YES | NO | UNKNOWN
PreferenceSource = str

def eur1_explicitly_covers_remaining_positions(text: str) -> bool:
    patterns = (
        r"all\s+(?:other|remaining)\s+(?:positions|line\s+items|products|goods)",
        r"all\s+(?:positions|products|line\s+items|goods|lines)\s+except",
        r"for\s+all\s+(?:positions|products|line\s+items|goods|lines)\s+except",
        r"covers\s+all\s+(?:positions|products|items|lines|goods)\s+except",
        r"applies\s+to\s+all\s+(?:positions|products|items|lines|goods)\s+except",
        r"eur\.?\s*1\s+(?:enclosed|attached|included|provided|issued)\s+for\s+all\s+(?:positions|products|line\s+items|goods)\s+except",
    )
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)


@dataclass
class DetectedDeclaration:
    kind: str
    text: str
    positions: list[int] = field(default_factory=list)
    excluded_positions: list[int] = field(default_factory=list)


@dataclass
class LinePreferentialOrigin:
    position_number: int
    country_of_origin: str
    preferential_origin: PreferentialOriginStatus
    preference_reason: str
    preference_source: PreferenceSource


DECLARATION_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "positions_preferential_yes",
        re.compile(
            r"positions?\s+([\d,\sand]+)\s+(?:are\s+)?(?:of\s+)?(?:(?:EU|E\.U\.)\s+)?preferential\s+origin",
            re.IGNORECASE,
        ),
    ),
    (
        "all_products_preferential",
        re.compile(
            r"products?\s+covered\s+by\s+this\s+document\s+are\s+of\s+preferential\s+origin",
            re.IGNORECASE,
        ),
    ),
    (
        "eur1_except_positions",
        re.compile(
            r"eur\.?\s*1\s+(?:enclosed|attached|included|provided|issued).*?except"
            r"(?:\s+where\s+otherwise\s+indicated)?(?:\s+(?:for\s+)?)?(?:positions?\s+)?([\d,\sand]+)",
            re.IGNORECASE,
        ),
    ),
    ("except_where_otherwise_indicated", re.compile(r"except\s+where\s+otherwise\s+indicated", re.IGNORECASE)),
    (
        "supplier_declaration",
        re.compile(
            r"(?:short-term|long-term)\s+supplier\s+declaration|STSD|LTSD|supplier\s+declaration",
            re.IGNORECASE,
        ),
    ),
    ("manufacturer_declaration", re.compile(r"manufacturer(?:'?s)?\s+declaration", re.IGNORECASE)),
    (
        "authorised_exporter",
        re.compile(
            r"exporter\s+of\s+(?:the\s+)?products\s+covered\s+by\s+this\s+document[\s\S]{0,300}?"
            r"\(\s*customs\s+authori[sz]ation\s+(?:no\.?|number)\s*[A-Z]{2}/\d+/\d+\s*\)",
            re.IGNORECASE,
        ),
    ),
    (
        "authorised_exporter",
        re.compile(
            r"customs\s+authori[sz]ation\s+(?:no\.?|number)\s*[A-Z]{2}/\d+/\d+",
            re.IGNORECASE,
        ),
    ),
    (
        "authorised_exporter",
        re.compile(
            r"customs\s+authori[sz]ation\s+(?:no\.?|number)\s+[A-Z]{2}\d{6}/\d{4}",
            re.IGNORECASE,
        ),
    ),
    (
        "authorised_exporter",
        re.compile(
            r"authori[sz]ed\s+exporter\s+(?:no\.?|number)\s*[A-Z]{2}/\d+/\d+",
            re.IGNORECASE,
        ),
    ),
    (
        "authorised_exporter",
        re.compile(r"authorised\s+exporter|authorized\s+exporter|\bREX[\s-]?(?:No|Number|#)?", re.IGNORECASE),
    ),
]


def parse_position_numbers(raw: str) -> list[int]:
    normalized = re.sub(r"\band\b", ",", raw, flags=re.IGNORECASE)
    nums = [int(part) for part in re.split(r"[,;/\s]+", normalized) if part.strip().isdigit()]
    return sorted(set(n for n in nums if n > 0))


def collect_declaration_corpus(invoice: NormalizedInvoice) -> str:
    parts: list[str] = []
    if invoice.vat_article.strip():
        parts.append(invoice.vat_article.strip())
    for value in invoice.document_flags.values():
        if isinstance(value, str) and value.strip():
            if re.search(r"preferential|origin declaration|eur\.?\s*1|except where", value, re.I):
                parts.append(value.strip())
    return "\n".join(parts)


def detect_declarations(corpus: str) -> list[DetectedDeclaration]:
    found: list[DetectedDeclaration] = []
    for kind, pattern in DECLARATION_PATTERNS:
        for match in pattern.finditer(corpus):
            positions: list[int] = []
            excluded: list[int] = []
            if kind == "positions_preferential_yes" and match.lastindex:
                positions = parse_position_numbers(match.group(1))
            if kind == "eur1_except_positions" and match.lastindex:
                excluded = parse_position_numbers(match.group(1))
            found.append(
                DetectedDeclaration(
                    kind=kind,
                    text=match.group(0).strip(),
                    positions=positions,
                    excluded_positions=excluded,
                )
            )
    return found


def run_preferential_origin_engine(invoice: NormalizedInvoice) -> list[LinePreferentialOrigin]:
    """Return per-line preferential origin — never inferred from country_of_origin alone."""
    declarations = detect_declarations(collect_declaration_corpus(invoice))
    corpus = collect_declaration_corpus(invoice)
    explicit_yes: set[int] = set()
    explicit_no: set[int] = set()
    blanket_all = False
    eur1_except: set[int] = set()
    eur1_covers_remaining = False
    supplier_ref = False

    eur1_decls = [d for d in declarations if d.kind == "eur1_except_positions"]

    for decl in declarations:
        if decl.kind == "positions_preferential_yes":
            explicit_yes.update(decl.positions)
        elif decl.kind == "all_products_preferential":
            blanket_all = True
        elif decl.kind == "eur1_except_positions":
            eur1_except.update(decl.excluded_positions)
            explicit_no.update(decl.excluded_positions)
        elif decl.kind == "supplier_declaration":
            supplier_ref = True

    if eur1_decls:
        eur1_covers_remaining = eur1_explicitly_covers_remaining_positions(corpus) or any(
            eur1_explicitly_covers_remaining_positions(d.text) for d in eur1_decls
        )

    lines: list[LinePreferentialOrigin] = []
    goods: list[InvoiceItem] = invoice.items or []

    for index, item in enumerate(goods):
        position = index + 1
        coo = item.country_of_origin.strip() or "—"

        if position in explicit_no:
            lines.append(
                LinePreferentialOrigin(
                    position_number=position,
                    country_of_origin=coo,
                    preferential_origin="NO",
                    preference_reason=f"Position {position} excluded from EUR.1 / preferential coverage.",
                    preference_source="excluded_positions_list",
                )
            )
            continue

        if position in explicit_yes or blanket_all:
            lines.append(
                LinePreferentialOrigin(
                    position_number=position,
                    country_of_origin=coo,
                    preferential_origin="YES",
                    preference_reason=f"Position {position} covered by explicit invoice preferential declaration.",
                    preference_source="invoice_declaration",
                )
            )
            continue

        if eur1_except and position not in eur1_except:
            if eur1_covers_remaining:
                lines.append(
                    LinePreferentialOrigin(
                        position_number=position,
                        country_of_origin=coo,
                        preferential_origin="YES",
                        preference_reason=(
                            f"Position {position} covered — EUR.1 explicitly applies to all remaining positions."
                        ),
                        preference_source="invoice_declaration",
                    )
                )
            else:
                lines.append(
                    LinePreferentialOrigin(
                        position_number=position,
                        country_of_origin=coo,
                        preferential_origin="UNKNOWN",
                        preference_reason=(
                            f"EUR.1 excludes other positions but does not explicitly confirm "
                            f"preferential origin for all remaining positions."
                        ),
                        preference_source="invoice_declaration",
                    )
                )
            continue

        if supplier_ref:
            lines.append(
                LinePreferentialOrigin(
                    position_number=position,
                    country_of_origin=coo,
                    preferential_origin="UNKNOWN",
                    preference_reason="Supplier declaration referenced — no line-level linkage.",
                    preference_source="supplier_declaration_reference",
                )
            )
            continue

        lines.append(
            LinePreferentialOrigin(
                position_number=position,
                country_of_origin=coo,
                preferential_origin="UNKNOWN",
                preference_reason="No explicit preferential origin declaration. COO alone does not establish preference.",
                preference_source="none",
            )
        )

    return lines
