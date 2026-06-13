from fastapi import APIRouter

from app.modules.intrastat.handlers import handle_intrastat, handle_intrastat_address
from app.modules.intrastat.schemas import (
    IntrastatAddressRequest,
    IntrastatRequest,
    IntrastatResponse,
    RootResponse,
)

router = APIRouter(prefix="/api/intrastat", tags=["intrastat"])


@router.get("/", response_model=RootResponse)
def intrastat_root() -> RootResponse:
    return RootResponse(
        success=True,
        message="Intrastat Freight Allocation Tool API is running.",
    )


@router.post("/", response_model=IntrastatResponse)
async def intrastat(payload: IntrastatRequest) -> IntrastatResponse:
    return await handle_intrastat(payload)


@router.post("/address", response_model=IntrastatResponse)
async def intrastat_by_address(payload: IntrastatAddressRequest) -> IntrastatResponse:
    return await handle_intrastat_address(payload)
