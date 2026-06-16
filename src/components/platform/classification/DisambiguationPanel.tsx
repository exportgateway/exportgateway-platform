"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import type { ClassifyV2Response, DisambiguationQuestion } from "@/lib/wizard-types";

interface DisambiguationPanelProps {
  result: ClassifyV2Response;
  loading?: boolean;
  onSubmitAnswers: (answers: Record<string, string>) => void;
  onCancel: () => void;
}

export function DisambiguationPanel({
  result,
  loading = false,
  onSubmitAnswers,
  onCancel,
}: DisambiguationPanelProps) {
  const questions: DisambiguationQuestion[] = result.disambiguation_questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const step = result.interaction_step ?? 1;
  const total = result.interaction_total_steps ?? (questions.length || 1);

  const allAnswered = questions.every((q) => answers[q.id]);

  return (
    <section
      className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/80 p-5 shadow-sm"
      aria-labelledby="disambiguation-heading"
      data-testid="disambiguation-panel"
    >
      <div className="mb-4 flex gap-3">
        <HelpCircle className="h-6 w-6 shrink-0 text-amber-700" aria-hidden />
        <div>
          <h2 id="disambiguation-heading" className="text-lg font-semibold text-amber-950">
            Additional Information Required
          </h2>
          <p className="mt-1 text-sm text-amber-900/90">
            {result.additional_information_reason ||
              "The product description does not contain enough detail for a reliable CN classification."}
          </p>
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-amber-800">
            Step {step} of {total}
            {result.interactive_family ? ` · ${result.interactive_family}` : ""}
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {questions.map((question) => (
          <fieldset key={question.id} className="space-y-2">
            <legend className="text-sm font-medium text-slate-800">{question.prompt}</legend>
            <div className="flex flex-wrap gap-2">
              {question.options.map((option) => {
                const selected = answers[question.id] === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={loading}
                    aria-pressed={selected}
                    onClick={() =>
                      setAnswers((prev) => ({ ...prev, [question.id]: option.id }))
                    }
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      selected
                        ? "border-amber-600 bg-amber-600 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-amber-400"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!allAnswered || loading}
          onClick={() => onSubmitAnswers(answers)}
          className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Classifying…" : "Continue classification"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onCancel}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Start over
        </button>
      </div>
    </section>
  );
}

export function isDisambiguationRequired(result: ClassifyV2Response): boolean {
  return (
    result.classification_state === "DISAMBIGUATE" ||
    (result.additional_information_required === true &&
      (result.disambiguation_questions?.length ?? 0) > 0)
  );
}
