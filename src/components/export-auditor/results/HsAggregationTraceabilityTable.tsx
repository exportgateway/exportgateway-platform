"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { HsAggregationReport, HsAggregationRow, PositionTraceabilityLine } from "@/lib/export-auditor/types";
import { getTraceabilityLinesForHs } from "@/lib/export-auditor/position-traceability";
import {
  formatCountryOfOriginField,
  formatOriginCountriesList,
} from "@/lib/export-auditor/origin-countries-summary";
import { cn } from "@/lib/utils";

function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value == null) return "—";
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

interface HsAggregationTraceabilityTableProps {
  rows: HsAggregationRow[];
  traceabilityLines: PositionTraceabilityLine[];
  currency?: string;
  selectedHsCode: string | null;
  onSelectHsCode: (hsCode: string) => void;
}

export function HsAggregationTraceabilityTable({
  rows,
  traceabilityLines,
  currency = "EUR",
  selectedHsCode,
  onSelectHsCode,
}: HsAggregationTraceabilityTableProps) {
  const [expandedHs, setExpandedHs] = useState<string | null>(null);

  const toggleExpand = (hsCode: string) => {
    setExpandedHs((current) => (current === hsCode ? null : hsCode));
  };

  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-surface-border bg-white p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          HS Aggregation
        </h3>
        <p className="mt-3 text-sm text-slate-500">No HS codes available for aggregation.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-surface-border bg-white p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        HS Aggregation
      </h3>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-surface-border text-left">
              <th className="w-8 px-2 py-2" aria-hidden />
              {[
                "HS Code",
                "Quantity",
                "Value",
                "Net Weight",
                "Origin Countries",
                "Source Positions",
              ].map((header) => (
                <th
                  key={header}
                  className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isExpanded = expandedHs === row.hsCode;
              const isSelected = selectedHsCode === row.hsCode;
              const detailLines = getTraceabilityLinesForHs(row.hsCode, row, traceabilityLines);

              return (
                <Fragment key={row.hsCode}>
                  <tr
                    className={cn(
                      "border-b border-surface-border/60 cursor-pointer transition-colors",
                      isSelected && "bg-brand-50/50",
                      !isSelected && "hover:bg-slate-50/80"
                    )}
                    onClick={() => onSelectHsCode(row.hsCode)}
                  >
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        className="rounded p-0.5 text-slate-500 hover:text-slate-800"
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? "Collapse row" : "Expand row"}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleExpand(row.hsCode);
                        }}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-slate-900 tabular-nums">
                      {row.hsCode}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800 tabular-nums">
                      {formatNumber(row.totalQuantity, 0)}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800 tabular-nums">
                      {currency} {formatNumber(row.totalValue)}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800 tabular-nums">
                      {formatNumber(row.totalNetWeight, 3)}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">
                      {formatOriginCountriesList(row.countriesOfOrigin)}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800 tabular-nums">
                      {row.sourcePositions.length > 0
                        ? `Positions: ${row.sourcePositions.join(",")}`
                        : "—"}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b border-surface-border/60 bg-slate-50/60">
                      <td colSpan={7} className="px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                          Source invoice positions
                        </p>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] text-xs">
                            <thead>
                              <tr className="text-left text-slate-400">
                                {[
                                  "Position",
                                  "Description",
                                  "Quantity",
                                  "Value",
                                  "Net Weight",
                                  "Country Of Origin",
                                  "Preferential Origin",
                                ].map((h) => (
                                  <th key={h} className="px-2 py-1.5 font-semibold uppercase tracking-wider">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {detailLines.map((line) => (
                                <tr key={line.positionNumber} className="border-t border-surface-border/40">
                                  <td className="px-2 py-2 font-semibold tabular-nums">{line.positionNumber}</td>
                                  <td className="px-2 py-2 text-slate-700">{line.description || "—"}</td>
                                  <td className="px-2 py-2 tabular-nums">{formatNumber(line.quantity, 0)}</td>
                                  <td className="px-2 py-2 tabular-nums">
                                    {currency} {formatNumber(line.value)}
                                  </td>
                                  <td className="px-2 py-2 tabular-nums">{formatNumber(line.netWeight, 3)}</td>
                                  <td className="px-2 py-2">{formatCountryOfOriginField(line.countryOfOrigin)}</td>
                                  <td className="px-2 py-2 font-medium">{line.preferentialOrigin}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface AuditTraceabilityPanelProps {
  selectedHsCode: string | null;
  rows: HsAggregationRow[];
  traceabilityLines: PositionTraceabilityLine[];
  currency?: string;
}

export function AuditTraceabilityPanel({
  selectedHsCode,
  rows,
  traceabilityLines,
  currency = "EUR",
}: AuditTraceabilityPanelProps) {
  const selectedRow = useMemo(
    () => rows.find((row) => row.hsCode === selectedHsCode) ?? null,
    [rows, selectedHsCode]
  );

  const lines = useMemo(() => {
    if (!selectedRow) return [];
    return getTraceabilityLinesForHs(selectedRow.hsCode, selectedRow, traceabilityLines);
  }, [selectedRow, traceabilityLines]);

  return (
    <section className="rounded-xl border border-surface-border bg-white p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Audit Traceability
      </h3>
      {!selectedRow ? (
        <p className="mt-3 text-sm text-slate-500">
          Select an HS code in the aggregation table to verify how totals were calculated.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-slate-600">
            HS <span className="font-semibold text-slate-900">{selectedRow.hsCode}</span> —{" "}
            {lines.length} source position{lines.length === 1 ? "" : "s"} (
            {selectedRow.sourcePositions.join(", ")})
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left">
                  {[
                    "Position Number",
                    "Description",
                    "Quantity",
                    "Value",
                    "Net Weight",
                    "Country Of Origin",
                    "Preferential Origin",
                  ].map((header) => (
                    <th
                      key={header}
                      className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.positionNumber} className="border-b border-surface-border/60 last:border-0">
                    <td className="px-3 py-2.5 font-semibold tabular-nums">{line.positionNumber}</td>
                    <td className="px-3 py-2.5 text-slate-700">{line.description || "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatNumber(line.quantity, 0)}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {currency} {formatNumber(line.value)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{formatNumber(line.netWeight, 3)}</td>
                    <td className="px-3 py-2.5">{formatCountryOfOriginField(line.countryOfOrigin)}</td>
                    <td className="px-3 py-2.5 font-medium">{line.preferentialOrigin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

interface HsAggregationReportSectionsProps {
  report: HsAggregationReport;
  currency?: string;
}

export function HsAggregationReportSections({
  report,
  currency = "EUR",
}: HsAggregationReportSectionsProps) {
  const [selectedHsCode, setSelectedHsCode] = useState<string | null>(
    report.hsAggregation[0]?.hsCode ?? null
  );

  return (
    <>
      <HsAggregationTraceabilityTable
        rows={report.hsAggregation}
        traceabilityLines={report.traceabilityLines}
        currency={currency}
        selectedHsCode={selectedHsCode}
        onSelectHsCode={setSelectedHsCode}
      />
      <AuditTraceabilityPanel
        selectedHsCode={selectedHsCode}
        rows={report.hsAggregation}
        traceabilityLines={report.traceabilityLines}
        currency={currency}
      />
    </>
  );
}
