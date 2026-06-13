import unicodedata


COUNTRY_ALIASES = {
    "slovenija": "slovenia",
    "slovenia": "slovenia",
    "slo": "slovenia",
    "nemcija": "germany",
    "germany": "germany",
    "deutschland": "germany",
    "hrvaska": "croatia",
    "croatia": "croatia",
    "srbija": "serbia",
    "serbia": "serbia",
    "avstrija": "austria",
    "austria": "austria",
    "osterreich": "austria",
    "italija": "italy",
    "italy": "italy",
    "madzarska": "hungary",
    "hungary": "hungary",
    "francija": "france",
    "france": "france",
    "spanija": "spain",
    "spain": "spain",
    "poljska": "poland",
    "poland": "poland",
    "ceska": "czechia",
    "czechia": "czechia",
    "slovaska": "slovakia",
    "slovakia": "slovakia",
    "romunija": "romania",
    "romania": "romania",
    "bolgarija": "bulgaria",
    "bulgaria": "bulgaria",
    "nizozemska": "netherlands",
    "netherlands": "netherlands",
    "belgija": "belgium",
    "belgium": "belgium",
}


def normalize_country(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.strip().lower())
    ascii_value = "".join(char for char in normalized if not unicodedata.combining(char))
    ascii_value = " ".join(ascii_value.replace(",", " ").split())
    return COUNTRY_ALIASES.get(ascii_value, ascii_value)
