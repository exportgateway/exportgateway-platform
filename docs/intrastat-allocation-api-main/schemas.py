from pydantic import BaseModel, Field


class RootResponse(BaseModel):
    success: bool
    message: str


class IntrastatRequest(BaseModel):
    from_lat: float = Field(..., ge=-90, le=90, examples=[52.5200])
    from_lon: float = Field(..., ge=-180, le=180, examples=[13.4050])
    to_lat: float = Field(..., ge=-90, le=90, examples=[46.0569])
    to_lon: float = Field(..., ge=-180, le=180, examples=[14.5058])
    total_cost: float = Field(..., gt=0, examples=[500])
    domestic_country: str = Field(default="Slovenia", min_length=2, examples=["Slovenia"])


class IntrastatAddressRequest(BaseModel):
    from_postal_code: str = Field(..., min_length=2, examples=["10115"])
    from_city: str = Field(..., min_length=2, examples=["Berlin"])
    from_country: str = Field(default="Germany", min_length=2, examples=["Germany"])
    to_postal_code: str = Field(..., min_length=2, examples=["1000"])
    to_city: str = Field(..., min_length=2, examples=["Ljubljana"])
    to_country: str = Field(default="Slovenia", min_length=2, examples=["Slovenia"])
    total_cost: float = Field(..., gt=0, examples=[500])
    domestic_country: str = Field(default="Slovenia", min_length=2, examples=["Slovenia"])


class IntrastatResponse(BaseModel):
    success: bool
    total_km: float
    domestic_km: float
    foreign_km: float
    domestic_cost: float
    foreign_cost: float
