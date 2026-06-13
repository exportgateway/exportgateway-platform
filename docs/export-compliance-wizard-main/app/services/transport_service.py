from app.models.schemas import TransportCostRequest, TransportCostResponse, VehicleType


VEHICLE_BASE_RATES = {
    VehicleType.VAN: 85,
    VehicleType.TRUCK_7_5T: 145,
    VehicleType.TRUCK_13_6M: 260,
    VehicleType.MEGA_TRAILER: 310,
}

WEIGHT_RATE_PER_KG = {
    VehicleType.VAN: 0.18,
    VehicleType.TRUCK_7_5T: 0.12,
    VehicleType.TRUCK_13_6M: 0.08,
    VehicleType.MEGA_TRAILER: 0.075,
}


def postal_distance_factor(pickup: str, delivery: str) -> float:
    pickup_digits = "".join(char for char in pickup if char.isdigit())
    delivery_digits = "".join(char for char in delivery if char.isdigit())
    if not pickup_digits or not delivery_digits:
        return 1.25
    spread = abs(int(pickup_digits[:2]) - int(delivery_digits[:2]))
    return max(1.0, min(3.8, 1 + spread / 18))


def calculate_transport_cost(payload: TransportCostRequest) -> TransportCostResponse:
    base = VEHICLE_BASE_RATES[payload.vehicle_type]
    weight_component = payload.weight_kg * WEIGHT_RATE_PER_KG[payload.vehicle_type]
    ldm_component = max(payload.loading_meters, 0) * 95
    factor = postal_distance_factor(payload.pickup_postal_code, payload.delivery_postal_code)
    estimated = round((base + weight_component + ldm_component) * factor, 2)

    return TransportCostResponse(
        estimated_cost_eur=estimated,
        method="sample-exportgateway-freight-logic",
        assumptions=[
            "Road freight estimate based on weight, loading meters, vehicle type and postal-code distance factor.",
            "Fuel, toll and handling surcharges are included as blended sample rates.",
            "Final rate should be confirmed against live carrier pricing.",
        ],
    )
