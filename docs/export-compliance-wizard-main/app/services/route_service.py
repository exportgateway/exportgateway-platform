from dataclasses import dataclass

from app.services.eu_countries import is_eu_member


@dataclass(frozen=True)
class RouteContext:
    route_type: str
    origin_eu: bool
    destination_eu: bool
    customs_duty_applicable: bool
    import_vat_applicable: bool
    import_declaration_applicable: bool
    message: str


INTRA_EU_MESSAGE = (
    "Intra-EU movement: no import customs duty, no import customs declaration, and no import VAT "
    "estimate at the border for this wizard model. Acquisition VAT and invoicing rules in the "
    "destination member state may still apply — confirm with your tax adviser."
)

EU_EXPORT_MESSAGE = (
    "EU export to a non-EU destination: export customs declaration and third-country import "
    "charges may apply at destination."
)

EU_IMPORT_MESSAGE = (
    "Import into the EU: customs duty and import VAT estimates may apply based on CN code and "
    "destination member state."
)

THIRD_COUNTRY_MESSAGE = (
    "Non-EU origin to non-EU destination: confirm customs requirements in both jurisdictions. "
    "This wizard applies simplified EU import/export models only when an EU member state is involved."
)


def resolve_route(origin_country: str, destination_country: str) -> RouteContext:
    origin_eu = is_eu_member(origin_country)
    destination_eu = is_eu_member(destination_country)

    if origin_eu and destination_eu:
        return RouteContext(
            route_type="intra_eu",
            origin_eu=True,
            destination_eu=True,
            customs_duty_applicable=False,
            import_vat_applicable=False,
            import_declaration_applicable=False,
            message=INTRA_EU_MESSAGE,
        )

    if origin_eu and not destination_eu:
        return RouteContext(
            route_type="eu_export",
            origin_eu=True,
            destination_eu=False,
            customs_duty_applicable=True,
            import_vat_applicable=False,
            import_declaration_applicable=False,
            message=EU_EXPORT_MESSAGE,
        )

    if not origin_eu and destination_eu:
        return RouteContext(
            route_type="eu_import",
            origin_eu=False,
            destination_eu=True,
            customs_duty_applicable=True,
            import_vat_applicable=True,
            import_declaration_applicable=True,
            message=EU_IMPORT_MESSAGE,
        )

    return RouteContext(
        route_type="third_country",
        origin_eu=False,
        destination_eu=False,
        customs_duty_applicable=False,
        import_vat_applicable=False,
        import_declaration_applicable=False,
        message=THIRD_COUNTRY_MESSAGE,
    )
