import Link from "next/link";
import { Shield } from "lucide-react";

const noticeItems = [
  "Uploaded documents are processed temporarily for OCR extraction and export compliance analysis.",
  "ExportGateway does not permanently store uploaded source documents.",
  "Documents may be transmitted to trusted AI processing providers for OCR extraction and structured data analysis.",
  "OCR processing currently uses Mistral AI infrastructure.",
  "Customer documents are not used for model training under commercial API terms.",
  "AI providers may retain request data for up to 30 days for abuse prevention unless Zero Data Retention is enabled.",
  "By uploading a document, the user confirms they are authorized to process the document contents.",
] as const;

export function ExportAuditorPrivacyNotice() {
  return (
    <aside
      className="rounded-xl border border-surface-border bg-surface-muted/40 p-3 sm:p-4"
      aria-labelledby="export-auditor-privacy-notice-title"
    >
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Shield className="h-3.5 w-3.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3
            id="export-auditor-privacy-notice-title"
            className="text-sm font-semibold text-slate-900"
          >
            Privacy Notice
          </h3>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-600">
            {noticeItems.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-xs text-slate-500">
            See our{" "}
            <Link href="/privacy" className="font-medium text-brand-600 hover:underline">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/security" className="font-medium text-brand-600 hover:underline">
              Security page
            </Link>{" "}
            for full details.
          </p>
        </div>
      </div>
    </aside>
  );
}
