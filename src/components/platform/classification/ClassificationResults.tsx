import type { ClassifyV2Response } from "@/lib/wizard-types";
import { isLowConfidenceResult } from "@/lib/classification-utils";
import { AlternativeClassificationsCard } from "@/components/platform/classification/AlternativeClassificationsCard";
import { ClassificationHero } from "@/components/platform/classification/ClassificationHero";
import { ClassificationSummaryCard } from "@/components/platform/classification/ClassificationSummaryCard";
import { CommodityDescriptionCard } from "@/components/platform/classification/CommodityDescriptionCard";
import { ComplianceCard } from "@/components/platform/classification/ComplianceCard";
import { ConfidenceCard } from "@/components/platform/classification/ConfidenceCard";
import { EvidenceCard } from "@/components/platform/classification/EvidenceCard";
import { LowConfidenceNotice } from "@/components/platform/classification/LowConfidenceNotice";
import { SourcesCard } from "@/components/platform/classification/SourcesCard";
import { WhyClassificationCard } from "@/components/platform/classification/WhyClassificationCard";

interface ClassificationResultsProps {
  result: ClassifyV2Response;
  onRestart: () => void;
}

export function ClassificationResults({ result, onRestart }: ClassificationResultsProps) {
  const showLowConfidence = isLowConfidenceResult(
    result.confidence,
    result.manual_classification_recommended
  );

  return (
    <section className="space-y-4 sm:space-y-5" aria-live="polite" data-testid="classification-results">
      <ClassificationHero result={result} />
      <CommodityDescriptionCard result={result} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ConfidenceCard result={result} />
        <EvidenceCard evidence={result.historical_evidence} />
      </div>

      {showLowConfidence ? <LowConfidenceNotice visible /> : null}

      <ClassificationSummaryCard result={result} />
      <WhyClassificationCard result={result} />
      <SourcesCard breakdown={result.source_breakdown} />

      <AlternativeClassificationsCard
        alternatives={result.alternatives}
        confidence={result.confidence}
      />

      {result.manual_classification_recommended ? (
        <p
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900"
          role="alert"
          data-testid="manual-classification-notice"
        >
          Manual classification recommended — insufficient evidence for an automatic suggestion.
        </p>
      ) : null}

      <ComplianceCard visible />

      <div className="pt-2">
        <button
          type="button"
          onClick={onRestart}
          className="rounded-lg border border-surface-border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Classify Another Product
        </button>
      </div>
    </section>
  );
}
