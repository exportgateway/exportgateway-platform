"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { usePlanAccess } from "@/components/plan-simulator/PlanProvider";
import { ClassificationInput } from "@/components/platform/classification/ClassificationInput";
import { ClassificationLoadingStages } from "@/components/platform/classification/ClassificationLoadingStages";
import { ClassificationResults } from "@/components/platform/classification/ClassificationResults";
import { ClassificationTrustSection } from "@/components/platform/classification/ClassificationTrustSection";
import { UsageBar } from "@/components/platform/classification/UsageBar";
import type { OnClassificationSelected } from "@/components/platform/classification/classification-integration";
import { extractAesRecordCount } from "@/lib/classification-utils";
import { classifyProductV2, getClassificationUsage, healthCheck } from "@/lib/wizard-api";
import type { ClassifyV2Response, UsageResponse } from "@/lib/wizard-types";

export interface ClassificationWizardProps {
  /** Future Export Auditor handoff — not activated */
  onClassificationSelected?: OnClassificationSelected;
  auditorContext?: boolean;
  className?: string;
}

type WizardPhase = "idle" | "loading" | "results" | "error";

export function ClassificationWizard({
  auditorContext = false,
  className,
}: ClassificationWizardProps) {
  const { effectivePlan } = usePlanAccess();
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<WizardPhase>("idle");
  const [activeStage, setActiveStage] = useState(0);
  const [result, setResult] = useState<ClassifyV2Response | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [aesRecordCount, setAesRecordCount] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const refreshUsage = useCallback(async () => {
    const response = await getClassificationUsage(effectivePlan);
    if (response.success) setUsage(response.data);
  }, [effectivePlan]);

  useEffect(() => {
    void refreshUsage();
    void healthCheck().then((res) => {
      if (res.success) {
        setApiAvailable(res.data.status !== "error");
        setAesRecordCount(extractAesRecordCount(res.data));
      } else {
        setApiAvailable(false);
      }
    });
  }, [refreshUsage]);

  const handleRestart = useCallback(() => {
    setQuery("");
    setResult(null);
    setError(null);
    setPhase("idle");
    setActiveStage(0);
    void refreshUsage();
  }, [refreshUsage]);

  const handleClassify = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || isPending) return;

    setError(null);
    setResult(null);
    setPhase("loading");
    setActiveStage(0);

    startTransition(async () => {
      const stageTimers = [
        setTimeout(() => setActiveStage(1), 600),
        setTimeout(() => setActiveStage(2), 1400),
      ];

      const response = await classifyProductV2({
        product_description: trimmed,
        plan: effectivePlan,
      });

      stageTimers.forEach(clearTimeout);

      if (!response.success) {
        setPhase("error");
        setError(response.detail);
        return;
      }

      const data = response.data;
      setActiveStage(data.research_source === "Web Research" ? 3 : 2);
      setResult(data);
      setUsage(data.usage);
      setPhase("results");
    });
  }, [effectivePlan, isPending, query]);

  const loading = phase === "loading" && isPending;

  return (
    <div className={className} data-wizard="native" data-auditor-context={auditorContext}>
      <header className="mb-6 space-y-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Export Classification Wizard
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Determine the most likely EU CN / HS tariff code from a product description — using AES
          historical evidence, validated knowledge, AI nomenclature analysis, and product research
          only when required.
        </p>
        <p className="text-xs font-medium text-slate-500" role="note">
          Indicative classification guidance only — not a legally binding tariff ruling. Verify before
          customs filing.
        </p>
      </header>

      {!apiAvailable ? (
        <div
          className="mb-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="alert"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
          <p>
            Classification API is temporarily unavailable. Results may fail until the backend reconnects.
          </p>
        </div>
      ) : null}

      <div className="mb-5 space-y-5">
        <ClassificationTrustSection aesRecordCount={aesRecordCount} />
        <UsageBar usage={usage} />
      </div>

      <ClassificationInput
        value={query}
        onChange={setQuery}
        onSubmit={handleClassify}
        loading={loading}
        disabled={!apiAvailable}
      />

      {phase === "loading" ? (
        <ClassificationLoadingStages
          activeStage={activeStage}
          isPending={isPending}
          showWebStage={activeStage >= 3}
        />
      ) : null}

      {phase === "error" && error ? (
        <p
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          role="alert"
          data-testid="classification-error"
        >
          {error}
        </p>
      ) : null}

      {phase === "results" && result ? (
        <div className="mt-5">
          <ClassificationResults result={result} onRestart={handleRestart} />
        </div>
      ) : null}
    </div>
  );
}
