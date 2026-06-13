import type { SupportingDocumentReference } from "@/lib/export-auditor/types";
import { Check } from "lucide-react";

interface SupportingDocumentsSectionProps {
  documents: SupportingDocumentReference[];
}

export function SupportingDocumentsSection({ documents }: SupportingDocumentsSectionProps) {
  if (documents.length === 0) {
    return null;
  }

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
        Supporting Documents Detected
      </h3>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li key={doc.kind} className="flex items-center gap-2 text-sm text-emerald-900">
              <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              {doc.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
