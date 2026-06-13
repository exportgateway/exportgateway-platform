import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.startup_diagnostics import (
    StartupTracker,
    get_startup_report,
    memory_footprint_report,
    probe_aes_knowledge_engine,
    probe_product_understanding,
    run_startup_initialization,
)

configure_logging()
logger = logging.getLogger(__name__)
settings = get_settings()

_understanding_startup: dict | None = None
_startup_task: asyncio.Task | None = None


def _defer_startup() -> bool:
    return settings.app_env.lower() in ("production", "prod")


async def _execute_startup(tracker: StartupTracker) -> None:
    global _understanding_startup
    result = await asyncio.to_thread(run_startup_initialization, tracker)
    _understanding_startup = result["understanding_info"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Bind the HTTP port before heavy initialization on production (Render port scan)."""
    global _startup_task
    tracker = StartupTracker()
    tracker.mark_begin()

    if _defer_startup():
        _startup_task = asyncio.create_task(_execute_startup(tracker))
        app.state.startup_task = _startup_task
        logger.info("startup deferred to background (production)")
        yield
        if _startup_task and not _startup_task.done():
            _startup_task.cancel()
            try:
                await _startup_task
            except asyncio.CancelledError:
                pass
        return

    await _execute_startup(tracker)
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="ExportGateway.eu export and customs compliance wizard API.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health/live")
def health_live():
    """Liveness probe — registered before heavy imports; always fast."""
    return {
        "status": "live",
        "routes_registered": True,
        "startup_complete": get_startup_report().get("startup_complete_logged", False),
    }


@app.get("/health/startup")
def health_startup():
    """Startup timing and component diagnostics."""
    return get_startup_report()


@app.get("/health")
def health():
    understanding = _understanding_startup or probe_product_understanding()
    production = settings.app_env.lower() in ("production", "prod")
    openai_ready = understanding.get("understanding_ready", False)
    aes_knowledge = probe_aes_knowledge_engine()
    body = {
        "status": "ok" if (openai_ready or not production) else "degraded",
        "production_ready": openai_ready if production else True,
        "app": settings.app_name,
        "environment": settings.app_env,
        "product_understanding": understanding,
        "aes_knowledge_engine": {
            "enabled": aes_knowledge["enabled"],
            "aes_mode": aes_knowledge["aes_mode"],
            "historical_db_present": aes_knowledge["historical_db_present"],
            "historical_records": aes_knowledge["historical_records"],
            "exports_records": aes_knowledge["exports_records"],
            "imports_records": aes_knowledge["imports_records"],
            "exports_unique_cn8": aes_knowledge["exports_unique_cn8"],
            "imports_unique_cn8": aes_knowledge["imports_unique_cn8"],
            "industrial_lexicon_phrases": aes_knowledge["industrial_lexicon_phrases"],
            "brand_entries": aes_knowledge["brand_entries"],
        },
        "memory_footprint": memory_footprint_report(),
    }
    if production and not openai_ready:
        return JSONResponse(status_code=503, content=body)
    return body


app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


from app.api.freight.router import router as freight_router  # noqa: E402
from app.api.intrastat.router import router as intrastat_router  # noqa: E402
from app.api.legacy import router as legacy_router  # noqa: E402
from app.api.routes import router  # noqa: E402

app.include_router(router)
app.include_router(freight_router)
app.include_router(intrastat_router)
app.include_router(legacy_router)
logger.info("routes registered (compliance, freight, intrastat, legacy)")
