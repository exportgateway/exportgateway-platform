#!/usr/bin/env python3
"""Run live production benchmark with extended AES injection diagnostics."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

DEFAULT_CLASSIFY_URL = "https://export-compliance-wizard.onrender.com/classify-product"
DEFAULT_HEALTH_URL = "https://export-compliance-wizard.onrender.com/health"
LEXICON_PATH = ROOT / "app" / "data" / "generated_industrial_lexicon.json"

KNOWN_BRANDS = (
    "sika", "sikaflex", "loctite", "bosch", "makita", "hilti",
    "wurth", "würth", "henkel", "festool", "dewalt", "metabo",
)


def _normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(c for c in decomposed if unicodedata.category(c) != "Mn")


def _http_json(url: str, payload: dict | None = None, timeout: int = 120) -> tuple[dict, float]:
    started = time.perf_counter()
    data = None
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=data, headers=headers, method="POST" if payload else "GET")
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = {"error": exc.read().decode("utf-8", errors="replace"), "status": exc.code}
    except Exception as exc:
        body = {"error": str(exc)}
    return body, round((time.perf_counter() - started) * 1000, 1)


def _load_lexicon_phrases() -> list[str]:
    if not LEXICON_PATH.is_file():
        return []
    with LEXICON_PATH.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    return [
        str(entry.get("normalized_phrase") or entry.get("phrase", "")).strip().lower()
        for entry in payload.get("entries", [])
    ]


def _parse_case(
    case_id: str,
    category: str,
    description: str,
    response: dict,
    latency_ms: float,
    lexicon_phrases: list[str],
) -> dict:
    suggestions = response.get("suggestions") or []
    top = suggestions[0] if suggestions else {}
    keywords = list(top.get("matched_keywords") or [])
    state = response.get("classification_state")
    suggested_cn = top.get("cn_code")
    success = state == "SUGGEST" and bool(suggested_cn)

    hist = response.get("historical_evidence") or {}
    hist_count = int(hist.get("total_declarations") or hist.get("matches_found") or 0)
    explanation = str(top.get("match_explanation") or "")

    won_ranking = any(k.startswith("aes_knowledge:") for k in keywords)
    # Proxy: injection performed when novel historical CN influenced pool (legacy API has no field)
    injection_performed = won_ranking or "aes_knowledge:" in explanation

    return {
        "id": case_id,
        "category": category,
        "description": description,
        "classification_state": state,
        "success": success,
        "suggested_cn": suggested_cn,
        "confidence": top.get("confidence_level") or response.get("confidence_level"),
        "historical_evidence_count": hist_count,
        "historical_candidates_used": won_ranking,
        "signals": {
            "aes_usage": (
                hist_count > 0
                or bool(response.get("historical_validation_applied"))
                or "AES validation bonus" in explanation
                or any(k.startswith("historical:") for k in keywords)
            ),
            "historical_injection_performed": injection_performed,
            "historical_injection_won_ranking": won_ranking,
        },
        "latency_ms": latency_ms,
        "error": response.get("error"),
    }


def _summary(cases: list[dict]) -> dict:
    total = len(cases)
    successes = [c for c in cases if c.get("success")]
    confidences = [c["confidence"] for c in successes if c.get("confidence") is not None]
    return {
        "total_cases": total,
        "errors": sum(1 for c in cases if c.get("error")),
        "overall_success_rate": round(len(successes) / total, 4) if total else 0,
        "average_confidence": round(sum(confidences) / len(confidences), 4) if confidences else 0,
        "aes_usage_rate": round(
            sum(1 for c in cases if (c.get("signals") or {}).get("aes_usage")) / total, 4
        ) if total else 0,
        "historical_candidate_injection_rate": round(
            sum(1 for c in cases if c.get("historical_candidates_used")) / total, 4
        ) if total else 0,
        "historical_injection_performed_rate": round(
            sum(1 for c in cases if (c.get("signals") or {}).get("historical_injection_performed")) / total, 4
        ) if total else 0,
        "historical_injection_won_ranking_rate": round(
            sum(1 for c in cases if (c.get("signals") or {}).get("historical_injection_won_ranking")) / total, 4
        ) if total else 0,
    }


def run_benchmark(
    *,
    cases: list[dict],
    classify_url: str,
    health_url: str,
    benchmark_id: str,
    benchmark_name: str,
) -> dict:
    health, _ = _http_json(health_url)
    lexicon = _load_lexicon_phrases()
    request_defaults = {
        "include_historical_evidence": True,
        "historical_validation_enabled": True,
    }
    results: list[dict] = []
    for index, case in enumerate(cases, 1):
        print(f"[{index}/{len(cases)}] {case['id']}", flush=True)
        payload = {"product_description": case["description"], **request_defaults}
        response, latency_ms = _http_json(classify_url, payload)
        results.append(
            _parse_case(
                case["id"],
                case.get("category", ""),
                case["description"],
                response,
                latency_ms,
                lexicon,
            )
        )
        time.sleep(0.3)

    aes = health.get("aes_knowledge_engine", {})
    return {
        "benchmark_id": benchmark_id,
        "benchmark_name": benchmark_name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "target": {"classify_product_url": classify_url, "health_url": health_url},
        "environment_snapshot": {"health": health, "aes_knowledge_engine": aes},
        "request_defaults": request_defaults,
        "metric_definitions": {
            "success": "classification_state == SUGGEST and suggested_cn is not null",
            "historical_candidate_injection_rate": "top suggestion matched_keywords contains aes_knowledge:*",
            "historical_injection_performed": "AES historical CN added to candidate pool (proxy via response)",
            "historical_injection_won_ranking": "top suggestion carries aes_knowledge:* keyword",
        },
        "cases": results,
        "summary": _summary(results),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run live production AES benchmark.")
    parser.add_argument("--baseline", type=Path, help="JSON with case id/description/category")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--benchmark-id", default="live_benchmark_v2")
    parser.add_argument("--classify-url", default=DEFAULT_CLASSIFY_URL)
    parser.add_argument("--health-url", default=DEFAULT_HEALTH_URL)
    args = parser.parse_args()

    baseline_path = args.baseline or (ROOT / "reports" / "live_baseline_benchmark.json")
    with baseline_path.open(encoding="utf-8") as handle:
        baseline = json.load(handle)
    cases = [
        {"id": c["id"], "description": c["description"], "category": c.get("category")}
        for c in baseline.get("cases", [])
    ]

    report = run_benchmark(
        cases=cases,
        classify_url=args.classify_url,
        health_url=args.health_url,
        benchmark_id=args.benchmark_id,
        benchmark_name="Live Production Benchmark (AES optimization pass #1)",
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps(report["summary"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
