from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models.schemas import PdfReportRequest


BRAND_NAVY = colors.HexColor("#10243e")
BRAND_TEAL = colors.HexColor("#0f8b8d")
BRAND_GREEN = colors.HexColor("#2e7d32")
BRAND_MUTED = colors.HexColor("#4b5563")

PDF_DISCLAIMER = (
    "<b>IMPORTANT NOTICE</b><br/><br/>"
    "This report contains indicative estimates only.<br/>"
    "CN classification, customs duties, VAT rates, transport costs and customs measures "
    "must be verified before customs declaration or commercial use."
)

SOURCE_LABELS = {
    "sample-rule-engine": "Sample Rule Engine",
    "sample-fallback": "Sample Rule Engine",
    "user-provided": "User Provided",
    "sample-taric-structure": "Sample Tariff Structure",
    "sample-exportgateway-freight-logic": "Sample Freight Logic",
}


def money(value: float) -> str:
    return f"EUR {value:,.2f}"


def _format_source(source: str | None) -> str:
    if not source:
        return "—"
    return SOURCE_LABELS.get(source, source.replace("-", " ").title())


def _section_spacer() -> Spacer:
    return Spacer(1, 9 * mm)


def _kv_table(rows: list[list[str]], col_widths: list[float]) -> Table:
    return Table(rows, colWidths=col_widths, style=_base_table_style())


def generate_pdf_report(payload: PdfReportRequest) -> bytes:
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=32 * mm,
    )
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="BrandTitle",
            parent=styles["Title"],
            textColor=BRAND_NAVY,
            fontSize=22,
            leading=26,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Section",
            parent=styles["Heading2"],
            textColor=BRAND_TEAL,
            fontSize=13,
            leading=16,
            spaceBefore=2,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Muted",
            parent=styles["Normal"],
            fontSize=9,
            leading=12,
            textColor=BRAND_MUTED,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Disclaimer",
            parent=styles["Normal"],
            fontSize=8,
            leading=11,
            textColor=BRAND_MUTED,
        )
    )
    story = []

    story.append(Paragraph("ExportGateway.eu", styles["BrandTitle"]))
    story.append(Paragraph("Export Compliance Wizard Report", styles["Heading2"]))
    story.append(Paragraph(f"Generated on {payload.report_date.isoformat()}", styles["Muted"]))
    story.append(_section_spacer())

    story.append(Paragraph("Shipment Summary", styles["Section"]))
    shipment_rows = [
        ["Origin country", payload.origin_country, "Destination country", payload.destination_country],
        ["Product", payload.product_description, "CN / HS code", payload.cn_code],
    ]
    if payload.incoterm or payload.transport_mode:
        shipment_rows.append(
            [
                "Incoterm",
                payload.incoterm or "—",
                "Transport mode",
                payload.transport_mode or "—",
            ]
        )
    if payload.goods_value_eur is not None:
        shipment_rows.append(
            [
                "Goods value",
                money(payload.goods_value_eur),
                "Transport cost",
                money(payload.transport_cost_eur),
            ]
        )
    if payload.net_weight_kg is not None and payload.gross_weight_kg is not None:
        shipment_rows.append(
            [
                "Net weight",
                f"{payload.net_weight_kg:,.2f} kg",
                "Gross weight",
                f"{payload.gross_weight_kg:,.2f} kg",
            ]
        )
    story.append(_kv_table(shipment_rows, [34 * mm, 54 * mm, 34 * mm, 54 * mm]))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph("Classification", styles["Section"]))
    classification_rows = [["CN8 code", payload.cn_code]]
    if payload.classification_chapter_code:
        chapter_line = payload.classification_chapter_code
        if payload.classification_chapter_title:
            chapter_line = f"{chapter_line} — {payload.classification_chapter_title}"
        classification_rows.append(["Chapter", chapter_line])
    if payload.classification_heading_code:
        heading_line = payload.classification_heading_code
        if payload.classification_heading_title:
            heading_line = f"{heading_line} — {payload.classification_heading_title}"
        classification_rows.append(["Heading", heading_line])
    if payload.classification_combined_description:
        classification_rows.append(
            ["Full description", payload.classification_combined_description]
        )
    elif payload.classification_cn8_description:
        classification_rows.append(["CN8 wording", payload.classification_cn8_description])
    if payload.classification_confidence is not None:
        classification_rows.append(
            [
                "Confidence",
                f"{payload.classification_confidence * 100:.0f}%",
            ]
        )
    if payload.classification_source:
        classification_rows.append(
            ["Source", _format_source(payload.classification_source)]
        )
    story.append(_kv_table(classification_rows, [44 * mm, 132 * mm]))

    if payload.classification_hierarchy_levels:
        story.append(Spacer(1, 3 * mm))
        story.append(Paragraph("Full CN hierarchy", styles["Muted"]))
        hier_rows = [["Level", "Code", "Description"]]
        level_names = {"chapter": "Chapter", "heading": "Heading", "cn8": "CN8", "path": "Path"}
        for level in payload.classification_hierarchy_levels:
            hier_rows.append(
                [
                    level_names.get(level.level, level.level.title()),
                    level.code or "—",
                    level.description,
                ]
            )
        story.append(Table(hier_rows, colWidths=[28 * mm, 28 * mm, 120 * mm], style=_base_table_style(header=True)))

    if payload.alternate_classifications:
        story.append(Spacer(1, 4 * mm))
        story.append(Paragraph("Other possible matches", styles["Muted"]))
        alt_rows = [["CN8 code", "Description", "Confidence"]]
        for alt in payload.alternate_classifications:
            desc = alt.combined_description or alt.description or "—"
            conf = (
                f"{alt.confidence_level * 100:.0f}%"
                if alt.confidence_level is not None
                else "—"
            )
            alt_rows.append([alt.cn_code, desc, conf])
        story.append(Table(alt_rows, colWidths=[32 * mm, 108 * mm, 36 * mm], style=_base_table_style(header=True)))

    story.append(_section_spacer())

    source_rows = [["Data component", "Source"]]
    if payload.classification_source:
        source_rows.append(["CN classification", _format_source(payload.classification_source)])
    if payload.duties_source:
        source_rows.append(["Customs duties", _format_source(payload.duties_source)])
    if payload.transport_source:
        source_rows.append(["Transport estimate", _format_source(payload.transport_source)])
    if len(source_rows) > 1:
        story.append(Paragraph("Data Sources", styles["Section"]))
        story.append(_kv_table(source_rows, [70 * mm, 106 * mm]))
        story.append(_section_spacer())

    story.append(Paragraph("Required Documents", styles["Section"]))
    doc_rows = [["Document"]] + [[doc] for doc in payload.required_documents]
    story.append(Table(doc_rows, colWidths=[176 * mm], style=_base_table_style(header=True)))
    story.append(_section_spacer())

    story.append(Paragraph("Duty and VAT Estimate (Simplified Model)", styles["Section"]))
    calc_rows = [
        ["Item", "Value"],
        ["Duty rate", f"{payload.duty_rate_percent:.2f}%"],
        ["Customs duty", money(payload.duty_amount_eur)],
        ["VAT rate", f"{payload.vat_rate_percent:.2f}%"],
        ["Import VAT", money(payload.vat_amount_eur)],
        ["Transport cost", money(payload.transport_cost_eur)],
        ["Total landed cost", money(payload.total_landed_cost_eur)],
    ]
    story.append(Table(calc_rows, colWidths=[88 * mm, 88 * mm], style=_base_table_style(header=True)))
    story.append(_section_spacer())

    story.append(Paragraph(PDF_DISCLAIMER, styles["Disclaimer"]))
    story.append(Spacer(1, 5 * mm))
    story.append(Paragraph("Generated by ExportGateway.eu", styles["Muted"]))

    document.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()


def _base_table_style(header: bool = False) -> TableStyle:
    commands = [
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d8dee8")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#1f2937")),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]
    if header:
        commands.extend(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ]
        )
    return TableStyle(commands)


def _footer(canvas, document) -> None:
    canvas.saveState()
    canvas.setStrokeColor(BRAND_GREEN)
    canvas.setLineWidth(1.3)
    canvas.line(18 * mm, 28 * mm, 192 * mm, 28 * mm)
    canvas.setFillColor(BRAND_NAVY)
    canvas.setFont("Helvetica-Bold", 7)
    canvas.drawString(18 * mm, 22 * mm, "IMPORTANT NOTICE")
    canvas.setFont("Helvetica", 6.5)
    footer_lines = [
        "This report contains indicative estimates only.",
        "CN classification, customs duties, VAT rates, transport costs and customs measures",
        "must be verified before customs declaration or commercial use.",
    ]
    y = 18 * mm
    for line in footer_lines:
        canvas.drawString(18 * mm, y, line)
        y -= 3.2 * mm
    canvas.setFont("Helvetica", 7)
    canvas.drawString(18 * mm, 7 * mm, "Generated by ExportGateway.eu")
    canvas.restoreState()
