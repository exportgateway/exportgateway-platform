"""EU member state names and aliases for route and VAT lookup."""

EU_MEMBER_NAMES = frozenset(
    {
        "austria",
        "belgium",
        "bulgaria",
        "croatia",
        "cyprus",
        "czechia",
        "czech republic",
        "denmark",
        "estonia",
        "finland",
        "france",
        "germany",
        "greece",
        "hungary",
        "ireland",
        "italy",
        "latvia",
        "lithuania",
        "luxembourg",
        "malta",
        "netherlands",
        "poland",
        "portugal",
        "romania",
        "slovakia",
        "slovenia",
        "spain",
        "sweden",
    }
)

COUNTRY_ALIASES = {
    "czech republic": "czechia",
    "holland": "netherlands",
    "uk": "united kingdom",
}


def normalize_country_key(country: str) -> str:
    key = country.strip().lower()
    return COUNTRY_ALIASES.get(key, key)


def is_eu_member(country: str) -> bool:
    return normalize_country_key(country) in EU_MEMBER_NAMES
