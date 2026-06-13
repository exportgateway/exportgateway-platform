from app.models.schemas import LandedCostResponse, VatRequest, VatResponse
from app.services.eu_countries import normalize_country_key
from app.services.route_service import resolve_route

VAT_RATE_SOURCE = "Official EU VAT Table"

# Standard VAT rates for EU member states (standard rate, %).
EU_STANDARD_VAT_RATES = {
    "austria": 20.0,
    "belgium": 21.0,
    "bulgaria": 20.0,
    "croatia": 25.0,
    "cyprus": 19.0,
    "czechia": 21.0,
    "denmark": 25.0,
    "estonia": 24.0,
    "finland": 25.5,
    "france": 20.0,
    "germany": 19.0,
    "greece": 24.0,
    "hungary": 27.0,
    "ireland": 23.0,
    "italy": 22.0,
    "latvia": 21.0,
    "lithuania": 21.0,
    "luxembourg": 17.0,
    "malta": 18.0,
    "netherlands": 21.0,
    "poland": 23.0,
    "portugal": 23.0,
    "romania": 19.0,
    "slovakia": 23.0,
    "slovenia": 22.0,
    "spain": 21.0,
    "sweden": 25.0,
}


def get_vat_rate(destination_country: str) -> tuple[float | None, str | None]:
    key = normalize_country_key(destination_country)
    rate = EU_STANDARD_VAT_RATES.get(key)
    if rate is None:
        return None, (
            f"No standard VAT rate is configured for destination country '{destination_country.strip()}'. "
            "Select a supported EU member state or verify the country name."
        )
    return rate, None


def calculate_vat(payload: VatRequest) -> VatResponse:
    route = resolve_route(payload.origin_country, payload.destination_country)
    duty_amount = round(payload.goods_value_eur * payload.duty_rate_percent / 100, 2)

    if not route.import_vat_applicable:
        return VatResponse(
            goods_value_eur=round(payload.goods_value_eur, 2),
            transport_cost_eur=round(payload.transport_cost_eur, 2),
            duty_amount_eur=duty_amount,
            customs_value_eur=round(payload.goods_value_eur + payload.transport_cost_eur + duty_amount, 2),
            vat_rate_percent=None,
            vat_amount_eur=0.0,
            total_import_charges_eur=round(duty_amount, 2),
            import_vat_applicable=False,
            vat_rate_available=False,
            vat_rate_source=VAT_RATE_SOURCE,
            route_type=route.route_type,
            route_message=route.message,
            warning=None,
        )

    vat_rate, warning = get_vat_rate(payload.destination_country)
    if vat_rate is None:
        return VatResponse(
            goods_value_eur=round(payload.goods_value_eur, 2),
            transport_cost_eur=round(payload.transport_cost_eur, 2),
            duty_amount_eur=duty_amount,
            customs_value_eur=round(payload.goods_value_eur + payload.transport_cost_eur + duty_amount, 2),
            vat_rate_percent=None,
            vat_amount_eur=0.0,
            total_import_charges_eur=round(duty_amount, 2),
            import_vat_applicable=True,
            vat_rate_available=False,
            vat_rate_source=VAT_RATE_SOURCE,
            route_type=route.route_type,
            route_message=route.message,
            warning=warning,
        )

    customs_value = round(payload.goods_value_eur + payload.transport_cost_eur + duty_amount, 2)
    vat_amount = round(customs_value * vat_rate / 100, 2)
    total_import_charges = round(duty_amount + vat_amount, 2)

    return VatResponse(
        goods_value_eur=round(payload.goods_value_eur, 2),
        transport_cost_eur=round(payload.transport_cost_eur, 2),
        duty_amount_eur=duty_amount,
        customs_value_eur=customs_value,
        vat_rate_percent=vat_rate,
        vat_amount_eur=vat_amount,
        total_import_charges_eur=total_import_charges,
        import_vat_applicable=True,
        vat_rate_available=True,
        vat_rate_source=VAT_RATE_SOURCE,
        route_type=route.route_type,
        route_message=route.message,
        warning=None,
    )


def calculate_landed_cost(payload: VatRequest) -> LandedCostResponse:
    vat = calculate_vat(payload)
    total = round(
        vat.goods_value_eur + vat.transport_cost_eur + vat.duty_amount_eur + vat.vat_amount_eur,
        2,
    )
    return LandedCostResponse(
        goods_value_eur=vat.goods_value_eur,
        transport_cost_eur=vat.transport_cost_eur,
        customs_duty_eur=vat.duty_amount_eur,
        import_vat_eur=vat.vat_amount_eur,
        total_landed_cost_eur=total,
        route_type=vat.route_type,
        route_message=vat.route_message,
        import_vat_applicable=vat.import_vat_applicable,
        warning=vat.warning,
    )
