from fastapi import APIRouter

from app.modules.freight.engine import compute_price
from app.modules.freight.schemas import PriceRequest

router = APIRouter(prefix="/api/freight", tags=["freight"])


@router.get("/")
def freight_root():
    return {"status": "ok", "version": "ftl-fuel-engine-v1"}


@router.post("/price")
def price(req: PriceRequest):
    return compute_price(req)
