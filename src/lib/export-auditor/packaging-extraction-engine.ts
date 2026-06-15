/**
 * Packaging line extraction — PALLET, CARTON, BOX, CRATE weights and counts.
 */

import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { parseLocaleNumber } from "@/lib/export-auditor/parse-locale-number";
import { isPackagingLine, LINE_TYPE_PACKAGING } from "@/lib/export-auditor/service-line-detection";

export interface PackagingLineSummary {
  position_number: number;
  description: string;
  package_type: string;
  package_count: number | null;
  net_weight_kg: number | null;
}

export interface PackagingExtractionResult {
  lines: PackagingLineSummary[];
  total_packaging_weight_kg: number;
  total_package_count: number;
  package_types: string[];
}

const PACKAGE_TYPE_ALIASES: Record<string, string> = {
  PALLET: "PAL",
  PALLETS: "PAL",
  PAL: "PAL",
  CARTON: "CTN",
  CARTONS: "CTN",
  CTN: "CTN",
  BOX: "BOX",
  BOXES: "BOX",
  CRATE: "CRT",
  CRATES: "CRT",
};

function parseWeight(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  const parsed = parseLocaleNumber(String(raw).trim());
  return parsed != null && parsed > 0 ? parsed : null;
}

function resolvePackageType(description: string): string {
  const upper = description.toUpperCase();
  for (const [token, code] of Object.entries(PACKAGE_TYPE_ALIASES)) {
    if (new RegExp(`\\b${token}\\b`, "i").test(upper)) {
      return code;
    }
  }
  return "PKG";
}

function extractCountFromDescription(description: string): number | null {
  const match = description.match(/\b(\d+)\s*(?:x\s*)?(?:pal|pallet|carton|ctn|box|crate)/i);
  if (!match) return null;
  const count = parseInt(match[1], 10);
  return Number.isFinite(count) && count > 0 ? count : null;
}

function resolvePosition(item: ApiInvoiceItem, index: number): number {
  return typeof item.position_number === "number" && item.position_number > 0
    ? item.position_number
    : index + 1;
}

/** Extract packaging lines from invoice items — never drops packaging rows. */
export function extractPackagingLines(invoice: NormalizedInvoice): PackagingExtractionResult {
  const items = invoice.items ?? [];
  const lines: PackagingLineSummary[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const description = item.description?.trim() ?? "";
    if (!isPackagingLine(description)) continue;

    const extended = item as ApiInvoiceItem & {
      net_weight?: number | string | null;
      package_count?: number | null;
      package_type?: string | null;
      line_type?: string | null;
    };

    const packageType =
      extended.package_type?.trim() ||
      (extended.line_type === LINE_TYPE_PACKAGING ? resolvePackageType(description) : resolvePackageType(description));

    lines.push({
      position_number: resolvePosition(item, index),
      description,
      package_type: packageType,
      package_count:
        typeof extended.package_count === "number" && extended.package_count > 0
          ? extended.package_count
          : extractCountFromDescription(description),
      net_weight_kg: parseWeight(extended.net_weight ?? item.quantity),
    });
  }

  const total_packaging_weight_kg = lines.reduce(
    (sum, line) => sum + (line.net_weight_kg ?? 0),
    0
  );
  const total_package_count = lines.reduce(
    (sum, line) => sum + (line.package_count ?? 0),
    0
  );
  const package_types = [...new Set(lines.map((line) => line.package_type))];

  return {
    lines,
    total_packaging_weight_kg: Math.round(total_packaging_weight_kg * 1000) / 1000,
    total_package_count,
    package_types,
  };
}

/** Attach packaging extraction metadata to invoice document_flags. */
export function enrichInvoicePackagingData(invoice: NormalizedInvoice): NormalizedInvoice {
  const extraction = extractPackagingLines(invoice);
  if (extraction.lines.length === 0) return invoice;

  return {
    ...invoice,
    document_flags: {
      ...invoice.document_flags,
      packaging_lines_count: extraction.lines.length,
      packaging_weight_total_kg: extraction.total_packaging_weight_kg,
      packaging_package_count: extraction.total_package_count,
      packaging_types: extraction.package_types.join(","),
      packaging_extraction_json: JSON.stringify(extraction.lines),
    },
  };
}
