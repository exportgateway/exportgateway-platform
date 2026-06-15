import { AlertTriangle } from "lucide-react";

interface LowConfidenceNoticeProps {
  visible: boolean;
}

/** Shown for ambiguous inputs (e.g. SENSOR, PART) — do not pretend certainty. */
export function LowConfidenceNotice({ visible }: LowConfidenceNoticeProps) {
  if (!visible) return null;

  return (
    <div
      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 sm:px-5"
      role="alert"
      data-testid="low-confidence-notice"
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden />
        <div>
          <p className="text-sm font-bold text-rose-900">Low confidence — additional product information required</p>
          <p className="mt-1 text-sm leading-relaxed text-rose-900/85">
            This description is too generic to classify with certainty. Provide material, function, end
            use, or model details — or consult a customs specialist before filing.
          </p>
        </div>
      </div>
    </div>
  );
}
