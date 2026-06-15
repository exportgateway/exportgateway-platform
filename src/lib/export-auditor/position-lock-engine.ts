/**
 * Position lock — commercial qty/value/position fields are immutable after canonical assembly.
 */

import type { ApiInvoiceItem, NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { extractStyleCodeFromItem } from "@/lib/export-auditor/commercial-line-deduplication";
import { parseLocaleNumber } from "@/lib/export-auditor/parse-locale-number";

export const POSITION_DATA_OVERWRITE_ATTEMPT = "POSITION_DATA_OVERWRITE_ATTEMPT";
export const POSITION_DATA_OVERWRITE_CORRUPTION = "POSITION_DATA_OVERWRITE_CORRUPTION";

export const POSITION_OVERWRITE_BLOCKED_FLAG = "position_overwrite_blocked_count";
export const POSITION_OVERWRITE_CORRUPTION_FLAG = "position_overwrite_corruption_count";

export const LOCKED_COMMERCIAL_FIELDS = [
  "position_number",
  "quantity",
  "unit_price",
  "line_total",
] as const;

export type LockedCommercialField = (typeof LOCKED_COMMERCIAL_FIELDS)[number];

export interface PositionFingerprint {
  position_number: number;
  style_code: string;
  description: string;
  hs_code: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface PositionOverwriteAttempt {
  position_number: number;
  field: LockedCommercialField;
  engine: string;
  before: string;
  after: string;
}

function parseNum(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  return parseLocaleNumber(String(raw).trim()) ?? 0;
}

function fieldValue(item: ApiInvoiceItem, field: LockedCommercialField): string {
  switch (field) {
    case "position_number":
      return String(item.position_number ?? 0);
    case "quantity":
      return parseNum(item.quantity).toFixed(3);
    case "unit_price":
      return parseNum(item.unit_price).toFixed(4);
    case "line_total":
      return parseNum(item.line_total).toFixed(2);
    default:
      return "";
  }
}

/** Stable fingerprint for a commercial line. */
export function buildPositionFingerprint(item: ApiInvoiceItem, index: number): PositionFingerprint {
  return {
    position_number:
      typeof item.position_number === "number" && item.position_number > 0
        ? item.position_number
        : index + 1,
    style_code: extractStyleCodeFromItem(item),
    description: (item.description ?? "").trim().slice(0, 120),
    hs_code: (item.hs_code ?? "").trim(),
    quantity: parseNum(item.quantity),
    unit_price: parseNum(item.unit_price),
    line_total: parseNum(item.line_total),
  };
}

function snapshotLockedFields(items: ApiInvoiceItem[]): Map<number, Record<LockedCommercialField, string>> {
  const snapshot = new Map<number, Record<LockedCommercialField, string>>();
  items.forEach((item, index) => {
    const position =
      typeof item.position_number === "number" && item.position_number > 0
        ? item.position_number
        : index + 1;
    snapshot.set(position, {
      position_number: String(position),
      quantity: fieldValue(item, "quantity"),
      unit_price: fieldValue(item, "unit_price"),
      line_total: fieldValue(item, "line_total"),
    });
  });
  return snapshot;
}

/** Mark all commercial lines locked after canonical assembly. */
export function lockCommercialPositions(invoice: NormalizedInvoice): NormalizedInvoice {
  const items = invoice.items ?? [];
  if (items.length === 0) return invoice;

  const fingerprints = items.map((item, index) => buildPositionFingerprint(item, index));
  const lockedSnapshot = snapshotLockedFields(items);

  return {
    ...invoice,
    document_flags: {
      ...invoice.document_flags,
      position_lock_active: true,
      position_lock_count: items.length,
      position_lock_fingerprints: JSON.stringify(fingerprints),
      position_lock_snapshot: JSON.stringify(Object.fromEntries(lockedSnapshot)),
    },
  };
}

function itemByPosition(items: ApiInvoiceItem[], position: number): ApiInvoiceItem | undefined {
  return items.find((item, index) => {
    const resolved =
      typeof item.position_number === "number" && item.position_number > 0
        ? item.position_number
        : index + 1;
    return resolved === position;
  });
}

/** Detect locked-field overwrites between two item arrays (same positions). */
export function detectPositionOverwrites(
  before: ApiInvoiceItem[],
  after: ApiInvoiceItem[],
  engine: string,
  ocrEvidence?: ApiInvoiceItem[]
): PositionOverwriteAttempt[] {
  if (!before.length) return [];

  const locked = snapshotLockedFields(before);
  const attempts: PositionOverwriteAttempt[] = [];

  for (const [position, fields] of locked) {
    const afterItem = itemByPosition(after, position);
    if (!afterItem) continue;

    for (const field of LOCKED_COMMERCIAL_FIELDS) {
      const prev = fields[field];
      const next = fieldValue(afterItem, field);
      if (prev === next) continue;

      const ocrItem = ocrEvidence ? itemByPosition(ocrEvidence, position) : undefined;
      const ocrAllows =
        ocrItem != null &&
        field !== "position_number" &&
        fieldValue(ocrItem, field as Exclude<LockedCommercialField, "position_number">) === next;

      if (!ocrAllows) {
        attempts.push({
          position_number: position,
          field,
          engine,
          before: prev,
          after: next,
        });
      }
    }
  }

  return attempts;
}

function countCorruptionAfterRestore(
  lockedSnapshot: Map<number, Record<LockedCommercialField, string>>,
  items: ApiInvoiceItem[]
): number {
  let corruption = 0;
  for (const [position, fields] of lockedSnapshot) {
    const afterItem = itemByPosition(items, position);
    if (!afterItem) continue;
    for (const field of LOCKED_COMMERCIAL_FIELDS) {
      if (fields[field] !== fieldValue(afterItem, field)) {
        corruption += 1;
        break;
      }
    }
  }
  return corruption;
}

/** Apply mutator and detect locked-field overwrites; restore locked fields on violation. */
export function applyWithPositionLock(
  invoice: NormalizedInvoice,
  engine: string,
  mutator: (input: NormalizedInvoice) => NormalizedInvoice
): { invoice: NormalizedInvoice; overwrites: PositionOverwriteAttempt[] } {
  const beforeItems = [...(invoice.items ?? [])];
  const locked = Boolean(invoice.document_flags?.position_lock_active);

  const mutated = mutator(invoice);
  if (!locked) {
    return { invoice: mutated, overwrites: [] };
  }

  const lockedSnapshot = snapshotLockedFields(beforeItems);
  const attempts = detectPositionOverwrites(beforeItems, mutated.items ?? [], engine);
  if (attempts.length === 0) {
    return { invoice: mutated, overwrites: [] };
  }

  const restoredItems = (mutated.items ?? []).map((item, index) => {
    const position =
      typeof item.position_number === "number" && item.position_number > 0
        ? item.position_number
        : index + 1;
    const original = itemByPosition(beforeItems, position);
    if (!original) return item;

    return {
      ...item,
      position_number: original.position_number ?? position,
      quantity: original.quantity,
      unit_price: original.unit_price,
      line_total: original.line_total,
    };
  });

  const blockedCount =
    Number(invoice.document_flags?.[POSITION_OVERWRITE_BLOCKED_FLAG] ?? 0) + attempts.length;
  const corruptionCount = countCorruptionAfterRestore(lockedSnapshot, restoredItems);
  const priorCorruption = Number(
    invoice.document_flags?.[POSITION_OVERWRITE_CORRUPTION_FLAG] ?? 0
  );

  return {
    invoice: {
      ...mutated,
      items: restoredItems,
      document_flags: {
        ...mutated.document_flags,
        [POSITION_OVERWRITE_BLOCKED_FLAG]: blockedCount,
        position_overwrite_last_engine: engine,
        position_overwrite_forensic_json: JSON.stringify(attempts.slice(0, 20)),
        ...(corruptionCount > 0
          ? {
              [POSITION_OVERWRITE_CORRUPTION_FLAG]: priorCorruption + corruptionCount,
              position_overwrite_attempts: priorCorruption + corruptionCount,
            }
          : {}),
      },
    },
    overwrites: attempts,
  };
}
