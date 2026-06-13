from app.models.schemas import DocumentsRequest, DocumentsResponse, Incoterm, TransportMode
from app.services.eu_countries import is_eu_member
from app.services.route_service import resolve_route


def get_document_requirements(payload: DocumentsRequest) -> DocumentsResponse:
    route = resolve_route(payload.origin_country, payload.destination_country)
    origin_eu = is_eu_member(payload.origin_country)
    destination_eu = is_eu_member(payload.destination_country)
    required = ["Commercial Invoice", "Packing List"]
    optional = ["Certificate of Origin"]
    notes = [route.message]

    if payload.transport_mode == TransportMode.ROAD:
        required.append("CMR")
    elif payload.transport_mode == TransportMode.SEA:
        required.append("Bill of Lading")
    else:
        required.append("Air Waybill")

    if route.route_type == "intra_eu":
        notes.append(
            "Intra-EU movement: no import customs declaration is listed for this route in the wizard model."
        )
    elif origin_eu and not destination_eu:
        required.append("Export Declaration")
        optional.extend(["EUR.1", "Supplier Declaration"])
        notes.append("EU export declaration is typically required for shipments leaving the EU customs territory.")
    elif not origin_eu and destination_eu:
        required.append("Import Declaration")
        notes.append("Importer should validate import licensing, VAT deferment and customs representation requirements.")
    else:
        notes.append("Confirm customs requirements in both non-EU jurisdictions.")

    if payload.incoterm in {Incoterm.CIP, Incoterm.DDP}:
        optional.append("Insurance Certificate")

    if payload.incoterm == Incoterm.DDP:
        notes.append("DDP requires the seller to account for import charges and local compliance obligations.")

    return DocumentsResponse(
        required_documents=list(dict.fromkeys(required)),
        optional_documents=list(dict.fromkeys(optional)),
        additional_notes=list(dict.fromkeys(notes)),
        route_type=route.route_type,
        route_message=route.message,
    )
