#!/usr/bin/env python3
"""Detect high-frequency AES phrases missing taxonomy coverage (human review only)."""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from app.services.historical_database import DEFAULT_DB_PATH, database_available, _connect
from app.services.taxonomy_service import _load_taxonomy, detect_families
from scripts.generate_industrial_lexicon import MIN_FREQUENCY, _normalize_phrase, _tokenize
from scripts.import_aes_historical import import_aes_historical

REPORT_PATH = Path(__file__).resolve().parent.parent / "reports" / "taxonomy_candidates.json"
TIER1_REPORT_PATH = Path(__file__).resolve().parent.parent / "reports" / "taxonomy_candidates_tier1.json"
INDUSTRIAL_LEXICON_PATH = (
    Path(__file__).resolve().parent.parent / "app" / "data" / "generated_industrial_lexicon.json"
)

MIN_MEANINGFUL_WORDS = 3
MIN_INDUSTRIAL_MEANINGFUL_WORDS = 2
MIN_PHRASE_TOKENS = 2
MAX_PHRASE_TOKENS = 6
TIER1_LIMIT = 20

HEADING_FAMILY_HINTS: dict[str, tuple[str, str]] = {
    "3920": ("plastics_edge_band", "3920"),
    "7318": ("fastener_screws", "7318"),
    "3506": ("adhesive_sealant", "3506"),
    "8471": ("electronics_computer", "8471"),
    "9403": ("furniture_general", "9403"),
    "8302": ("furniture_fittings", "8302"),
    "6203": ("apparel_trousers_mens", "6203"),
    "6204": ("apparel_trousers_womens", "6204"),
}

STOPWORDS = frozenset(
    {
        "for",
        "the",
        "and",
        "with",
        "from",
        "pcs",
        "kos",
        "piece",
        "pieces",
        "mm",
        "cm",
        "lang",
        "beli",
        "crni",
        "rdeci",
        "modri",
        "new",
        "industrial",
        "ready",
        "meal",
    }
)

GENERIC_DOMAIN_TOKENS = frozenset(
    {
        "men",
        "mens",
        "man",
        "women",
        "womens",
        "cotton",
        "denim",
        "wool",
        "polyester",
        "sugar",
        "syrup",
        "wheat",
        "durum",
        "dress",
        "shirt",
        "shirts",
        "skirt",
        "adults",
        "jeans",
        "hlace",
        "hlace",
        "moske",
        "zenske",
        "majice",
        "sweater",
        "polo",
        "frozen",
        "pizza",
        "lasagna",
        "bakery",
        "flavoured",
        "aromatized",
        "500",
    }
)

INDUSTRIAL_CORE_WORDS = frozenset(
    {
        "robni",
        "trak",
        "okovje",
        "profil",
        "vijak",
        "vijaki",
        "vodila",
        "predale",
        "zamak",
        "lepilo",
        "vrtalnik",
        "kladivo",
        "tesnilo",
        "vodotesno",
        "profesionalni",
        "akumulatorski",
        "kombinirano",
        "hinge",
        "bracket",
        "fitting",
        "fittings",
        "mounting",
        "connector",
        "sealant",
        "adhesive",
        "sensor",
        "screw",
        "screws",
        "bolt",
        "bolts",
        "head",
        "hex",
        "pohistveno",
        "pohistvo",
        "omare",
        "inox",
        "aluminijasti",
        "industrijsko",
    }
)

INDUSTRIAL_MARKERS = frozenset(
    {
        "robni",
        "trak",
        "okovje",
        "profil",
        "vijak",
        "vijaki",
        "vodila",
        "predale",
        "zamak",
        "abs",
        "pvc",
        "alu",
        "aluminij",
        "aluminijasti",
        "inox",
        "lepilo",
        "sensor",
        "screw",
        "screws",
        "bolt",
        "bolts",
        "hinge",
        "bracket",
        "fitting",
        "fittings",
        "mounting",
        "drawer",
        "slide",
        "sealant",
        "adhesive",
        "motor",
        "relay",
        "bearing",
        "pohistveno",
        "pohistvo",
        "omare",
        "omaro",
        "hardware",
        "connector",
        "lasnica",
        "vodilo",
        "vrtalnik",
        "kladivo",
        "tesnilo",
        "vodotesno",
        "profesionalni",
        "akumulatorski",
        "kombinirano",
        "hex",
        "head",
        "industrijsko",
    }
)

MATERIAL_CODES = re.compile(r"^(abs|pvc|pe|pp|alu|pet|eva|pu|epoxy|inox)$", re.I)


@dataclass
class PhraseStats:
    phrase: str
    cn8: str
    frequency: int = 0
    unique_descriptions: set[str] = field(default_factory=set)
    regression_hits: int = 0
    non_regression_hits: int = 0
    regression_case_ids: set[str] = field(default_factory=set)
    source_ids: set[str] = field(default_factory=set)


def _tokenize_phrase(text: str) -> list[str]:
    return _tokenize(text)


def _is_meaningful_token(token: str) -> bool:
    if not token or token in STOPWORDS:
        return False
    if token.isdigit():
        return False
    if MATERIAL_CODES.match(token):
        return True
    if len(token) < 2:
        return False
    return True


def _meaningful_word_count(tokens: list[str]) -> int:
    return sum(1 for token in tokens if _is_meaningful_token(token))


def _has_industrial_marker(tokens: list[str]) -> bool:
    return any(token in INDUSTRIAL_MARKERS or MATERIAL_CODES.match(token) for token in tokens)


def _dominated_by_generic_tokens(tokens: list[str]) -> bool:
    meaningful = [token for token in tokens if _is_meaningful_token(token)]
    if not meaningful:
        return True
    generic = sum(1 for token in meaningful if token in GENERIC_DOMAIN_TOKENS)
    return generic / len(meaningful) >= 0.5


def _phrase_quality_ok(phrase: str) -> bool:
    tokens = _tokenize_phrase(phrase)
    if len(tokens) < MIN_PHRASE_TOKENS or len(tokens) > MAX_PHRASE_TOKENS:
        return False
    if tokens[0].isdigit():
        return False
    meaningful_count = _meaningful_word_count(tokens)
    if meaningful_count < MIN_INDUSTRIAL_MEANINGFUL_WORDS:
        return False
    if _dominated_by_generic_tokens(tokens):
        return False
    has_material = any(MATERIAL_CODES.match(token) for token in tokens)
    if meaningful_count >= MIN_MEANINGFUL_WORDS:
        return True
    if has_material and meaningful_count >= MIN_INDUSTRIAL_MEANINGFUL_WORDS and _has_industrial_marker(tokens):
        return True
    return _has_industrial_marker(tokens) and meaningful_count >= MIN_INDUSTRIAL_MEANINGFUL_WORDS


@lru_cache(maxsize=1)
def _taxonomy_phrases_normalized() -> tuple[str, ...]:
    config = _load_taxonomy()
    phrases: list[str] = []
    for entry in config.get("families", []):
        for phrase in entry.get("phrases", []):
            normalized = _normalize_phrase(str(phrase))
            if normalized:
                phrases.append(normalized)
    return tuple(sorted(set(phrases), key=len, reverse=True))


def _phrase_covered_by_taxonomy(phrase: str) -> bool:
    if detect_families(phrase):
        return True
    normalized = _normalize_phrase(phrase)
    if not normalized:
        return True
    for tax_phrase in _taxonomy_phrases_normalized():
        if normalized == tax_phrase:
            return True
        if tax_phrase in normalized and len(tax_phrase.split()) >= max(2, len(normalized.split()) - 1):
            return True
        if normalized in tax_phrase and len(normalized.split()) >= 2:
            return True
    return False


def _extract_candidate_phrases(description: str) -> list[str]:
    tokens = _tokenize_phrase(description)
    if not tokens:
        return []
    candidates: set[str] = set()
    if len(tokens) <= MAX_PHRASE_TOKENS and _phrase_quality_ok(" ".join(tokens)):
        candidates.add(_normalize_phrase(" ".join(tokens)))
    for size in range(MIN_PHRASE_TOKENS, min(MAX_PHRASE_TOKENS, len(tokens)) + 1):
        for index in range(0, len(tokens) - size + 1):
            phrase = _normalize_phrase(" ".join(tokens[index : index + size]))
            if _phrase_quality_ok(phrase):
                candidates.add(phrase)
    return sorted(candidates, key=len, reverse=True)


def _is_regression_source(source_id: str) -> bool:
    return str(source_id).startswith("regression:")


def _regression_case_id(source_id: str) -> str | None:
    if not _is_regression_source(source_id):
        return None
    parts = str(source_id).split(":")
    return parts[1] if len(parts) >= 2 else None


def _frequency_only_from_duplicated_benchmark(bucket: PhraseStats) -> bool:
    if bucket.non_regression_hits > 0:
        return False
    if len(bucket.regression_case_ids) >= 2:
        return False
    return bucket.regression_hits > 0


def _has_noise_numeric_token(tokens: list[str]) -> bool:
    for token in tokens:
        if MATERIAL_CODES.match(token):
            continue
        if token.isdigit():
            return True
        if re.fullmatch(r"\d+[a-z]{0,2}", token):
            return True
    return False


def _two_word_industrial_ok(tokens: list[str]) -> bool:
    if len(tokens) != 2:
        return True
    return all(token in INDUSTRIAL_CORE_WORDS for token in tokens)


def _tier1_phrase_ok(phrase: str) -> bool:
    tokens = _tokenize_phrase(phrase)
    if "pcs" in tokens or "kos" in tokens:
        return False
    if tokens and len(tokens[0]) <= 2 and not MATERIAL_CODES.match(tokens[0]):
        return False
    if not _two_word_industrial_ok(tokens):
        return False
    if not _has_noise_numeric_token(tokens):
        return True
    return _meaningful_word_count(tokens) >= 4


def _token_set(phrase: str) -> frozenset[str]:
    return frozenset(_tokenize_phrase(phrase))


def _canonical_phrase_preference(phrase: str) -> tuple[int, int, int, int]:
    tokens = _tokenize_phrase(phrase)
    stopword_count = sum(1 for token in tokens if token in STOPWORDS)
    material_first = 0 if tokens and MATERIAL_CODES.match(tokens[0]) else 1
    return (stopword_count, material_first, len(tokens), -_meaningful_word_count(tokens))


def _suggest_family(cn8: str) -> tuple[str, str]:
    heading = cn8[:4]
    return HEADING_FAMILY_HINTS.get(heading, (f"heading_{heading}", heading))


def _is_subset_phrase(candidate: str, accepted: str) -> bool:
    if candidate == accepted:
        return False
    if candidate in accepted:
        left_pad = accepted
        if left_pad.startswith(candidate):
            next_char = left_pad[len(candidate) : len(candidate) + 1]
            return not next_char or not next_char.isalnum()
        if left_pad.endswith(candidate):
            prev_char = left_pad[-len(candidate) - 1 : -len(candidate)]
            return not prev_char or not prev_char.isalnum()
        return f" {candidate} " in f" {accepted} "
    return False


def _collect_phrase_stats(db_path: Path) -> dict[tuple[str, str], PhraseStats]:
    with _connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT source_id, item_description, cn_digits
            FROM aes_items
            WHERE length(cn_digits) >= 8
            """
        ).fetchall()

    stats: dict[tuple[str, str], PhraseStats] = {}
    for row in rows:
        description = str(row["item_description"]).strip()
        cn8 = str(row["cn_digits"])[:8]
        source_id = str(row["source_id"] or "")
        if not description:
            continue
        seen_for_row: set[str] = set()
        for phrase in _extract_candidate_phrases(description):
            if phrase in seen_for_row:
                continue
            seen_for_row.add(phrase)
            key = (phrase, cn8)
            bucket = stats.get(key)
            if bucket is None:
                bucket = PhraseStats(phrase=phrase, cn8=cn8)
                stats[key] = bucket
            bucket.frequency += 1
            bucket.unique_descriptions.add(description)
            bucket.source_ids.add(source_id)
            if _is_regression_source(source_id):
                bucket.regression_hits += 1
                case_id = _regression_case_id(source_id)
                if case_id:
                    bucket.regression_case_ids.add(case_id)
            else:
                bucket.non_regression_hits += 1
    return stats


def _merge_industrial_lexicon_stats(stats: dict[tuple[str, str], PhraseStats]) -> None:
    if not INDUSTRIAL_LEXICON_PATH.is_file():
        return
    with INDUSTRIAL_LEXICON_PATH.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    for entry in payload.get("entries", []):
        phrase = _normalize_phrase(str(entry.get("normalized_phrase", entry.get("phrase", ""))))
        cn8 = re.sub(r"\D", "", str(entry.get("cn8", "")))[:8]
        count = int(entry.get("count", 0))
        if not phrase or len(cn8) < 8 or count < MIN_FREQUENCY:
            continue
        if not _phrase_quality_ok(phrase) or not _has_industrial_marker(_tokenize_phrase(phrase)):
            continue
        key = (phrase, cn8)
        bucket = stats.get(key)
        if bucket is None:
            bucket = PhraseStats(phrase=phrase, cn8=cn8)
            stats[key] = bucket
        if count > bucket.frequency:
            bucket.frequency = count
        bucket.non_regression_hits = max(bucket.non_regression_hits, min(count, 5))


def _benchmark_impact_for_phrase(
    phrase: str,
    *,
    cn8: str,
    descriptions: set[str],
    cache: dict[str, tuple[str, str | None]],
) -> float:
    from app.services.classification_pipeline import run_classification_pipeline

    impacted = 0
    for description in descriptions:
        if description not in cache:
            result = run_classification_pipeline(description, historical_validation_enabled=True)
            pred = result.suggestions[0].cn_code if result.suggestions else None
            pred_heading = re.sub(r"\D", "", pred or "")[:4] or None
            cache[description] = (result.state.name, pred_heading)
        state, pred_heading = cache[description]
        expected_heading = cn8[:4]
        if state in {"ABSTAIN", "EXPERT_REQUIRED"} or pred_heading != expected_heading:
            impacted += 1
    if not descriptions:
        return 0.0
    return impacted / len(descriptions)


def _filter_tier1_candidates(
    stats: dict[tuple[str, str], PhraseStats],
    *,
    min_frequency: int,
    benchmark_cache: dict[str, tuple[str, str | None]],
) -> tuple[list[dict], dict[str, int]]:
    rejected: Counter[str] = Counter()
    scored: list[dict] = []

    for (phrase, cn8), bucket in stats.items():
        if bucket.frequency < min_frequency:
            rejected["below_min_frequency"] += 1
            continue
        if not _phrase_quality_ok(phrase):
            rejected["phrase_quality"] += 1
            continue
        if not _has_industrial_marker(_tokenize_phrase(phrase)):
            rejected["not_industrial"] += 1
            continue
        if not _tier1_phrase_ok(phrase):
            rejected["numeric_fragment"] += 1
            continue
        if _frequency_only_from_duplicated_benchmark(bucket):
            rejected["regression_only_frequency"] += 1
            continue
        if _phrase_covered_by_taxonomy(phrase):
            rejected["taxonomy_covered"] += 1
            continue

        uniqueness = len(bucket.unique_descriptions) / bucket.frequency
        benchmark_impact = _benchmark_impact_for_phrase(
            phrase,
            cn8=cn8,
            descriptions=bucket.unique_descriptions,
            cache=benchmark_cache,
        )
        suggested_family, suggested_heading = _suggest_family(cn8)
        score = round(bucket.frequency * uniqueness * (1.0 + benchmark_impact), 4)
        scored.append(
            {
                "phrase": phrase,
                "frequency": bucket.frequency,
                "unique_descriptions": len(bucket.unique_descriptions),
                "cn8": cn8,
                "heading": suggested_heading,
                "suggested_family": suggested_family,
                "suggested_heading": suggested_heading,
                "uniqueness": round(uniqueness, 4),
                "benchmark_impact": round(benchmark_impact, 4),
                "score": score,
                "non_regression_hits": bucket.non_regression_hits,
                "regression_hits": bucket.regression_hits,
                "regression_case_ids": len(bucket.regression_case_ids),
            }
        )

    def _material_sort_key(item: dict) -> tuple:
        tokens = _tokenize_phrase(item["phrase"])
        has_material = any(MATERIAL_CODES.match(token) for token in tokens)
        return (
            0 if has_material else 1,
            len(tokens),
            *_canonical_phrase_preference(item["phrase"]),
        )

    scored.sort(
        key=lambda item: (
            -item["score"],
            *_material_sort_key(item),
            item["phrase"],
        ),
    )

    accepted: list[dict] = []
    for item in scored:
        phrase = item["phrase"]
        if any(_is_subset_phrase(phrase, kept["phrase"]) for kept in accepted):
            rejected["subset_of_accepted_phrase"] += 1
            continue
        if any(_is_subset_phrase(kept["phrase"], phrase) for kept in accepted):
            rejected["superset_of_accepted_phrase"] += 1
            continue

        phrase_tokens = _token_set(phrase)
        replaced = False
        for index, kept in enumerate(accepted):
            kept_tokens = _token_set(kept["phrase"])
            if phrase_tokens > kept_tokens and phrase_tokens.issuperset(kept_tokens):
                added = phrase_tokens - kept_tokens
                if any(MATERIAL_CODES.match(token) for token in added):
                    accepted[index] = item
                    replaced = True
                    break
            if phrase_tokens < kept_tokens and kept_tokens.issuperset(phrase_tokens):
                rejected["token_subset_of_accepted_phrase"] += 1
                replaced = True
                break
            if phrase_tokens == kept_tokens and kept["cn8"] == item["cn8"]:
                rejected["duplicate_token_phrase"] += 1
                replaced = True
                break
        if replaced:
            continue
        if any(
            phrase_tokens > _token_set(kept["phrase"])
            and phrase_tokens.issuperset(_token_set(kept["phrase"]))
            for kept in accepted
        ):
            rejected["token_superset_of_accepted_phrase"] += 1
            continue
        accepted.append(item)

    accepted = _upgrade_canonical_material_phrases(accepted, stats)
    accepted.sort(key=lambda item: item["score"], reverse=True)
    return accepted, dict(rejected)


def _upgrade_canonical_material_phrases(
    accepted: list[dict],
    stats: dict[tuple[str, str], PhraseStats],
) -> list[dict]:
    upgrades = {
        "robni trak": "abs robni trak",
        "trak abs": "abs robni trak",
    }
    upgraded: list[dict] = []
    seen_phrases: set[str] = set()
    for item in accepted:
        phrase = item["phrase"]
        canonical = upgrades.get(phrase, phrase)
        if canonical != phrase:
            key = (canonical, item["cn8"])
            if key in stats and _tier1_phrase_ok(canonical):
                phrase = canonical
        if phrase in seen_phrases:
            continue
        seen_phrases.add(phrase)
        upgraded.append({**item, "phrase": phrase})
    return upgraded


def build_taxonomy_candidates(
    *,
    db_path: Path | None = None,
    min_frequency: int = MIN_FREQUENCY,
    limit: int = 200,
) -> dict:
    path = db_path or DEFAULT_DB_PATH
    if not database_available(path):
        import_aes_historical(rebuild=True)
        path = DEFAULT_DB_PATH

    stats = _collect_phrase_stats(path)
    candidates: list[dict] = []
    for (phrase, cn8), bucket in sorted(
        stats.items(),
        key=lambda item: item[1].frequency,
        reverse=True,
    ):
        if bucket.frequency < min_frequency:
            continue
        if _phrase_covered_by_taxonomy(phrase):
            continue
        suggested_family, suggested_heading = _suggest_family(cn8)
        candidates.append(
            {
                "phrase": phrase,
                "frequency": bucket.frequency,
                "cn8": cn8,
                "suggested_family": suggested_family,
                "suggested_heading": suggested_heading,
            }
        )
        if len(candidates) >= limit:
            break

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_database": str(path),
        "min_frequency": min_frequency,
        "candidate_count": len(candidates),
        "review_required": True,
        "note": "Do not auto-modify cn_taxonomy_v1.json. Human review required.",
        "candidates": candidates,
    }


def build_taxonomy_candidates_tier1(
    *,
    db_path: Path | None = None,
    min_frequency: int = MIN_FREQUENCY,
    limit: int = TIER1_LIMIT,
) -> dict:
    path = db_path or DEFAULT_DB_PATH
    if not database_available(path):
        import_aes_historical(rebuild=True)
        path = DEFAULT_DB_PATH

    stats = _collect_phrase_stats(path)
    _merge_industrial_lexicon_stats(stats)
    benchmark_cache: dict[str, tuple[str, str | None]] = {}
    accepted, rejected = _filter_tier1_candidates(
        stats,
        min_frequency=min_frequency,
        benchmark_cache=benchmark_cache,
    )
    tier1 = accepted[:limit]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_database": str(path),
        "min_frequency": min_frequency,
        "candidate_count": len(tier1),
        "review_required": True,
        "ranking": "frequency × uniqueness × (1 + benchmark_impact)",
        "filters": {
            "min_meaningful_words": MIN_MEANINGFUL_WORDS,
            "min_industrial_meaningful_words": MIN_INDUSTRIAL_MEANINGFUL_WORDS,
            "reject_subset_of_accepted": True,
            "reject_regression_only_frequency": True,
            "reject_taxonomy_covered": True,
        },
        "rejected_counts": rejected,
        "note": "High-value industrial phrases only. Do not auto-modify cn_taxonomy_v1.json.",
        "candidates": tier1,
    }


def write_taxonomy_candidates(payload: dict, output_path: Path | None = None) -> Path:
    path = output_path or REPORT_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description="Build taxonomy candidate report from AES history.")
    parser.add_argument("--db-path", type=Path, default=None)
    parser.add_argument("--min-frequency", type=int, default=MIN_FREQUENCY)
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--output", type=Path, default=REPORT_PATH)
    parser.add_argument("--tier1-output", type=Path, default=TIER1_REPORT_PATH)
    parser.add_argument("--tier1-only", action="store_true")
    args = parser.parse_args()

    if not args.tier1_only:
        payload = build_taxonomy_candidates(
            db_path=args.db_path,
            min_frequency=args.min_frequency,
            limit=args.limit,
        )
        path = write_taxonomy_candidates(payload, args.output)
        print(f"Wrote {payload['candidate_count']} taxonomy candidates to {path}")

    tier1 = build_taxonomy_candidates_tier1(
        db_path=args.db_path,
        min_frequency=args.min_frequency,
        limit=TIER1_LIMIT,
    )
    tier1_path = write_taxonomy_candidates(tier1, args.tier1_output)
    print(f"Wrote {tier1['candidate_count']} tier-1 taxonomy candidates to {tier1_path}")
    if tier1.get("rejected_counts"):
        print("Rejected:", tier1["rejected_counts"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
