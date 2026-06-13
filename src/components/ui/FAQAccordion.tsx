"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQAccordionProps {
  items: FAQItem[];
}

export function FAQAccordion({ items }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="divide-y divide-surface-border rounded-2xl border border-surface-border bg-white overflow-hidden">
      {items.map((item, index) => (
        <div key={index}>
          <button
            className="flex w-full items-center justify-between px-6 py-5 text-left transition-colors hover:bg-surface-muted/50"
            onClick={() => setOpenIndex(openIndex === index ? null : index)}
            aria-expanded={openIndex === index}
          >
            <span className="text-sm font-semibold text-slate-900 pr-4">
              {item.question}
            </span>
            <ChevronDown
              className={cn(
                "h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200",
                openIndex === index && "rotate-180"
              )}
            />
          </button>
          <div
            className={cn(
              "overflow-hidden transition-all duration-300 ease-in-out",
              openIndex === index ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <p className="px-6 pb-5 text-sm leading-relaxed text-slate-600">
              {item.answer}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
