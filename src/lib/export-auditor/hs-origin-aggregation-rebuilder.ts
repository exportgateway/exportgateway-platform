/**
 * HS aggregation origin rebuilder — sync countries_of_origin from all bucket lines.
 */

import type { HsAggregationRow, NormalizedAggregationItem } from "@/lib/export-auditor/hs-aggregation-engine";

/** Ensure each aggregation row lists all contributing countries (sorted, deduplicated). */
export function rebuildHsAggregationOrigins(
  hsRows: HsAggregationRow[],
  goods: NormalizedAggregationItem[]
): HsAggregationRow[] {
  return hsRows.map((row) => {
    const positions = new Set(row.source_positions);
    const countries = new Set<string>(row.countries_of_origin.filter(Boolean));

    for (const item of goods) {
      if (positions.has(item.position_number) && item.country_of_origin) {
        countries.add(item.country_of_origin);
      }
    }

    const sorted = [...countries].sort();
    return {
      ...row,
      countries_of_origin: sorted,
      country_of_origin: sorted.join(", "),
    };
  });
}

/** Format mixed origins for display (e.g. BG, PT). */
export function formatMixedOriginLabel(codes: string[]): string {
  const normalized = [...new Set(codes.filter(Boolean))].sort();
  if (normalized.length === 0) return "NOT PROVIDED";
  if (normalized.length === 1) return normalized[0];
  return normalized.join(", ");
}
