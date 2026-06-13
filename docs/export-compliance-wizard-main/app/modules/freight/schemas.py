from typing import Literal

from pydantic import BaseModel, Field, field_validator


class PriceRequest(BaseModel):
    city_from: str | None = None
    city_to: str | None = None
    country_from: str | None = None
    country_to: str | None = None

    from_lat: float | None = Field(default=None, ge=-90, le=90)
    from_lon: float | None = Field(default=None, ge=-180, le=180)
    to_lat: float | None = Field(default=None, ge=-90, le=90)
    to_lon: float | None = Field(default=None, ge=-180, le=180)

    weight_kg: float = Field(default=0, ge=0)
    pallets: int = Field(default=0, ge=0)
    loading_meters: float = Field(default=0, ge=0)

    transport_type: Literal["FTL", "LTL"] = "FTL"

    @field_validator("transport_type", mode="before")
    @classmethod
    def normalize_transport_type(cls, value):
        if value is None:
            return "FTL"
        return str(value).upper()
