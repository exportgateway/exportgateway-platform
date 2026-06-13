"use client";

import { useEffect, useState } from "react";
import {
  DECLARATION_LANGUAGE_LABELS,
  DECLARATION_LANGUAGES,
  getDeclarationLanguage,
  setDeclarationLanguage,
} from "@/lib/export-auditor/declaration-language-prefs";
import type { DeclarationLanguage } from "@/lib/export-auditor/types";

export function DeclarationLanguageSettings() {
  const [language, setLanguage] = useState<DeclarationLanguage>("en");

  useEffect(() => {
    setLanguage(getDeclarationLanguage());
  }, []);

  const handleChange = (value: DeclarationLanguage) => {
    setLanguage(value);
    setDeclarationLanguage(value);
  };

  return (
    <section className="mb-8">
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Export Preferences
      </h3>
      <div className="rounded-xl border border-surface-dark-border bg-surface-dark-card p-6 space-y-4">
        <div>
          <label
            htmlFor="declaration-language"
            className="block text-xs font-medium text-slate-500 mb-1.5"
          >
            Declaration Language
          </label>
          <select
            id="declaration-language"
            value={language}
            onChange={(event) => handleChange(event.target.value as DeclarationLanguage)}
            className="w-full rounded-lg border border-surface-dark-border bg-surface-dark-muted px-3 py-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
          >
            {DECLARATION_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {DECLARATION_LANGUAGE_LABELS[code]}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate-500">
            Default language for AI-generated declaration descriptions in Enterprise Export.
          </p>
        </div>
      </div>
    </section>
  );
}
