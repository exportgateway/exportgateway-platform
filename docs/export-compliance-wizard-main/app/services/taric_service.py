from app.models.schemas import DutiesRequest, DutiesResponse, TaricMeasure
from app.services.route_service import resolve_route


SAMPLE_TARIC_DATA = {
    "6109": {
        "duty_rate_percent": 12.0,
        "measures": [("Y917", "Textile product declaration"), ("Y919", "No sanctions restriction declared")],
        "restrictions": [("Y900", "Goods not subject to prohibitions listed for this route")],
        "certificates": [("C400", "Certificate of origin where preferential treatment is claimed")],
    },
    "6403": {
        "duty_rate_percent": 8.0,
        "measures": [("Y917", "Footwear material composition declaration")],
        "restrictions": [("Y900", "No endangered species component declared")],
        "certificates": [("C400", "Certificate of origin where preferential treatment is claimed")],
    },
    "9403": {
        "duty_rate_percent": 2.7,
        "measures": [("Y919", "No anti-dumping measure declared")],
        "restrictions": [("Y900", "Timber due-diligence status should be verified")],
        "certificates": [("C400", "Origin evidence if preference is requested")],
    },
    "8543": {
        "duty_rate_percent": 3.7,
        "measures": [("Y917", "Product compliance declaration may be required")],
        "restrictions": [("Y900", "Dual-use controls should be screened")],
        "certificates": [("C400", "Origin evidence if preference is requested")],
    },
    "2204": {
        "duty_rate_percent": 13.1,
        "measures": [("Y917", "Excise and alcohol product controls may apply")],
        "restrictions": [("Y919", "Import license status should be checked")],
        "certificates": [("C400", "VI-1 or origin-related certificate if applicable")],
    },
}


def _to_measures(items: list[tuple[str, str]]) -> list[TaricMeasure]:
    return [TaricMeasure(code=code, description=description) for code, description in items]


def get_duties(payload: DutiesRequest) -> DutiesResponse:
    route = resolve_route(payload.origin_country, payload.destination_country)

    if not route.customs_duty_applicable:
        return DutiesResponse(
            cn_code=payload.cn_code,
            duty_rate_percent=0.0,
            measures=[],
            restrictions=[],
            certificates=[],
            source="route-intra-eu",
            route_type=route.route_type,
            route_message=route.message,
            customs_duty_applicable=False,
        )

    prefix = "".join(char for char in payload.cn_code if char.isdigit())[:4]
    sample = SAMPLE_TARIC_DATA.get(
        prefix,
        {
            "duty_rate_percent": 4.2,
            "measures": [("Y917", "Standard customs declaration measure")],
            "restrictions": [("Y900", "No sample restriction identified")],
            "certificates": [("C400", "Origin documentation may be requested")],
        },
    )

    return DutiesResponse(
        cn_code=payload.cn_code,
        duty_rate_percent=sample["duty_rate_percent"],
        measures=_to_measures(sample["measures"]),
        restrictions=_to_measures(sample["restrictions"]),
        certificates=_to_measures(sample["certificates"]),
        source="sample-taric-structure",
        route_type=route.route_type,
        route_message=route.message,
        customs_duty_applicable=True,
    )
