import os

TIER_LOW_MAX_EUR = 200
TIER_MID_MAX_EUR = 500

DEFAULT_MARKUP_UNDER_200 = 0.20
DEFAULT_MARKUP_200_TO_500 = 0.10
DEFAULT_MARKUP_OVER_500 = 0.05


def _markup_rate(env_key: str, default: float) -> float:
    raw = os.getenv(env_key)
    if raw is None or not raw.strip():
        return default
    return float(raw)


def _markup_rates() -> tuple[float, float, float]:
    return (
        _markup_rate("FREIGHT_MARKUP_UNDER_200", DEFAULT_MARKUP_UNDER_200),
        _markup_rate("FREIGHT_MARKUP_200_TO_500", DEFAULT_MARKUP_200_TO_500),
        _markup_rate("FREIGHT_MARKUP_OVER_500", DEFAULT_MARKUP_OVER_500),
    )


def apply_commercial_markup(cost: float) -> float:
    """Return customer-facing price from estimated freight cost."""
    under_200, mid_tier, over_500 = _markup_rates()

    if cost < TIER_LOW_MAX_EUR:
        markup = under_200
    elif cost <= TIER_MID_MAX_EUR:
        markup = mid_tier
    else:
        markup = over_500

    return cost * (1 + markup)
