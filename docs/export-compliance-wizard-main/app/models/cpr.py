"""Canonical Product Record (CPR) v1 — Phase A."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CanonicalProductRecord(BaseModel):
    commercial_description: str
    normalized_description: str
    detected_language: str = "en"
    data_quality_score: float = Field(ge=0, le=1)
    product_families: list[str] = Field(default_factory=list)
    brands: list[str] = Field(default_factory=list)
    excluded_tokens: list[str] = Field(default_factory=list)
    model_spans: list[str] = Field(default_factory=list)
    condition: str | None = None
    chapter_priors: list[str] = Field(default_factory=list)
    excluded_chapters: list[str] = Field(default_factory=list)
    allowed_chapters: list[str] = Field(default_factory=list)
    heading_priors: list[str] = Field(default_factory=list)
    search_terms: list[str] = Field(default_factory=list)
    penalized_headings: list[str] = Field(default_factory=list)
    lexicon_concepts: list[str] = Field(default_factory=list)
    is_vehicle: bool = False
    is_industrial_sensor: bool = False
    is_industrial_automation: bool = False
    disambiguation_resolved: dict[str, str] = Field(default_factory=dict)
    pending_disambiguation: list[str] = Field(default_factory=list)
    universal_product_family: str | None = None
    universal_product_type: str | None = None
    universal_material: str | None = None
    universal_function: str | None = None
    universal_industry: str | None = None

    def summary(self) -> dict:
        return {
            "normalized_description": self.normalized_description,
            "data_quality_score": round(self.data_quality_score, 2),
            "product_families": self.product_families,
            "allowed_chapters": self.allowed_chapters,
            "excluded_chapters": self.excluded_chapters,
            "pending_disambiguation": self.pending_disambiguation,
        }
