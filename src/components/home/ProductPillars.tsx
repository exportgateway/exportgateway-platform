"use client";

import { PillarSection } from "@/components/platform/PillarSection";
import type { PillarId } from "@/lib/platform-modules";

const pillars: PillarId[] = ["customs", "freight", "documents", "ai"];

function ClassificationDemo() {
  return (
    <div className="rounded-xl border border-surface-border bg-white p-5 shadow-sm">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Live demo</p>
      <p className="text-sm text-slate-600 italic mb-3">&ldquo;500 kos moške bombažne jeans hlače&rdquo;</p>
      <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-bold text-slate-900">6203 42 31</span>
          <span className="text-xs font-semibold text-emerald-700">87% confidence</span>
        </div>
        <p className="text-xs text-slate-500 mt-1">Men&apos;s cotton denim trousers · AES evidence</p>
      </div>
    </div>
  );
}

function FreightDemo() {
  return (
    <div className="rounded-xl border border-surface-border bg-white p-5 shadow-sm">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Beta preview</p>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Route</span>
          <span className="font-medium text-slate-900">Ljubljana → Berlin</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Distance</span>
          <span className="font-medium text-slate-900">1,009 km · LTL</span>
        </div>
        <div className="flex justify-between border-t border-surface-border pt-2">
          <span className="text-slate-500">Estimate</span>
          <span className="font-bold text-brand-600">€380 (€340–€420)</span>
        </div>
      </div>
    </div>
  );
}

function DocumentsDemo() {
  return (
    <div className="rounded-xl border border-surface-border bg-white p-5 shadow-sm">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Document checklist</p>
      <ul className="space-y-1.5 text-sm text-slate-600">
        <li className="flex items-center gap-2"><span className="text-emerald-500">✓</span> Commercial Invoice</li>
        <li className="flex items-center gap-2"><span className="text-emerald-500">✓</span> Packing List</li>
        <li className="flex items-center gap-2"><span className="text-emerald-500">✓</span> CMR</li>
        <li className="flex items-center gap-2"><span className="text-emerald-500">✓</span> Export Declaration</li>
      </ul>
      <p className="mt-3 text-[11px] text-slate-400">Invoice generation — Coming Soon</p>
    </div>
  );
}

function AIDemo() {
  return (
    <div className="rounded-xl border border-surface-border bg-white p-5 shadow-sm">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Product understanding</p>
      <div className="rounded-lg bg-violet-50 border border-violet-100 p-3 text-xs font-mono text-violet-900 space-y-1">
        <p>language: <span className="text-slate-700">sl</span></p>
        <p>material: <span className="text-slate-700">cotton</span></p>
        <p>construction: <span className="text-slate-700">woven</span></p>
        <p>family: <span className="text-slate-700">apparel_trousers_mens</span></p>
      </div>
    </div>
  );
}

const demos: Partial<Record<PillarId, React.ReactNode>> = {
  customs: <ClassificationDemo />,
  freight: <FreightDemo />,
  documents: <DocumentsDemo />,
  ai: <AIDemo />,
};

export function ProductPillars() {
  return (
    <>
      {pillars.map((pillar, i) => (
        <PillarSection
          key={pillar}
          pillar={pillar}
          id={`pillar-${pillar}`}
          reversed={i % 2 === 1}
          featured={demos[pillar]}
        />
      ))}
    </>
  );
}
