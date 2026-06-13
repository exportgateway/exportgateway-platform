"""Backward-compatible route aliases for legacy WordPress embeds and clients."""

from fastapi import APIRouter

from app.modules.freight.engine import compute_price
from app.modules.freight.schemas import PriceRequest
from app.modules.intrastat.handlers import handle_intrastat, handle_intrastat_address
from app.modules.intrastat.schemas import (
    IntrastatAddressRequest,
    IntrastatRequest,
    IntrastatResponse,
)

router = APIRouter(tags=["legacy"])


@router.post("/price")
def legacy_price(req: PriceRequest):
    return compute_price(req)


@router.post("/intrastat", response_model=IntrastatResponse)
async def legacy_intrastat(payload: IntrastatRequest) -> IntrastatResponse:
    return await handle_intrastat(payload)


@router.post("/intrastat/address", response_model=IntrastatResponse)
async def legacy_intrastat_address(payload: IntrastatAddressRequest) -> IntrastatResponse:
    return await handle_intrastat_address(payload)
