const DIMENSION_PATTERNS: RegExp[] = [
  /\d+(?:[.,]\d+)?\s*(?:mm|cm|m\b|inch|in\b|ft|"|')\b/gi,
  /\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?/gi,
  /\d+\s*-\s*\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\+\w+)?/gi,
  /\+\w{2,}/gi,
];

const STANDARD_PATTERNS: RegExp[] = [
  /\b(?:EN|ISO|DIN|ASTM|BS|NF|JIS|UNE|GOST)\s*\d+[\w.-]*/gi,
];

const PROCESS_NOISE = /\b(?:lubricated|oiled|coated|packed|assembled)\b/gi;

const PRODUCT_TYPES: { pattern: RegExp; label: string }[] = [
  { pattern: /wire\s*rope|non[- ]?rotating\s*rope|\brope\b/i, label: "wire rope" },
  { pattern: /valve/i, label: "valve" },
  { pattern: /seal/i, label: "seal" },
  { pattern: /\bbolt\b|\bscrew\b/i, label: "bolt" },
  { pattern: /bracket/i, label: "bracket" },
  { pattern: /gasket/i, label: "gasket" },
  { pattern: /wire\b/i, label: "wire" },
  { pattern: /tube|pipe/i, label: "tube" },
  { pattern: /bearing/i, label: "bearing" },
  { pattern: /flange/i, label: "flange" },
  { pattern: /plate|sheet/i, label: "plate" },
  { pattern: /cable/i, label: "cable" },
];

const MATERIALS: { pattern: RegExp; label: string; priority: number }[] = [
  { pattern: /stainless\s*steel/i, label: "Stainless steel", priority: 1 },
  { pattern: /galvanized|galvanised/i, label: "Galvanized", priority: 2 },
  { pattern: /\bsteel\b/i, label: "steel", priority: 3 },
  { pattern: /\balumin/i, label: "aluminum", priority: 4 },
  { pattern: /\brubber\b/i, label: "rubber", priority: 5 },
  { pattern: /\bbrass\b/i, label: "brass", priority: 6 },
  { pattern: /\bcopper\b/i, label: "copper", priority: 7 },
  { pattern: /\bplastic\b/i, label: "plastic", priority: 8 },
  { pattern: /\biron\b/i, label: "iron", priority: 9 },
];

const QUALIFIERS: { pattern: RegExp; label: string }[] = [
  { pattern: /non[- ]?rotating/i, label: "non-rotating" },
  { pattern: /forged/i, label: "forged" },
  { pattern: /cast/i, label: "cast" },
];

function stripTechnicalNoise(text: string): string {
  let cleaned = text;
  for (const pattern of [...DIMENSION_PATTERNS, ...STANDARD_PATTERNS]) {
    cleaned = cleaned.replace(pattern, " ");
  }
  cleaned = cleaned.replace(PROCESS_NOISE, " ");
  return cleaned.replace(/\s+/g, " ").trim();
}

function findFirstMatch<T extends { pattern: RegExp }>(text: string, entries: T[]): T | null {
  for (const entry of entries) {
    if (entry.pattern.test(text)) {
      return entry;
    }
  }
  return null;
}

function capitalizeWords(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function buildCondensedDescription(original: string, cleaned: string): string | null {
  const product = findFirstMatch(cleaned, PRODUCT_TYPES);
  if (!product) return null;

  const materials = MATERIALS.filter((entry) => entry.pattern.test(cleaned)).sort(
    (a, b) => a.priority - b.priority
  );
  const qualifiers = QUALIFIERS.filter((entry) => entry.pattern.test(original)).map(
    (entry) => entry.label
  );

  const parts: string[] = [];
  const galvanized = materials.find((entry) => /galvanized/i.test(entry.label));
  const stainless = materials.find((entry) => /stainless steel/i.test(entry.label));
  const steel = materials.find((entry) => entry.label === "steel");

  if (galvanized && product.label === "wire rope") {
    parts.push("Galvanized steel wire rope");
  } else if (stainless) {
    parts.push(`${stainless.label} ${product.label}`);
  } else if (galvanized) {
    parts.push(`${galvanized.label} ${steel ? `${steel.label} ` : ""}${product.label}`.trim());
  } else if (steel) {
    parts.push(`${capitalizeWords(steel.label)} ${product.label}`);
  } else if (materials[0]) {
    parts.push(`${capitalizeWords(materials[0].label)} ${product.label}`);
  } else {
    parts.push(capitalizeWords(product.label));
  }

  const condensed = parts[0] ?? capitalizeWords(product.label);
  const extraQualifiers = qualifiers.filter(
    (qualifier) => !condensed.toLowerCase().includes(qualifier.toLowerCase())
  );
  if (extraQualifiers.length > 0) {
    return `${condensed}, ${extraQualifiers.join(", ")}`;
  }
  return condensed;
}

function fallbackDescription(original: string, cleaned: string): string {
  const source = cleaned.length > 0 ? cleaned : original.trim();
  if (source.length === 0) return "";
  const maxLength = 120;
  if (source.length <= maxLength) return source;
  const truncated = source.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated).trim();
}

/** Rule-based condenser for customs declaration wording (Box 31). */
export function generateCustomsDescription(invoiceDescription: string): string {
  const original = invoiceDescription.trim();
  if (!original) return "";

  const cleaned = stripTechnicalNoise(original);
  const condensed = buildCondensedDescription(original, cleaned);
  if (condensed) return condensed;

  return fallbackDescription(original, cleaned);
}

function pluralizeProductLabel(label: string): string {
  if (label.endsWith("s")) return label;
  if (label === "wire rope") return "wire ropes";
  return `${label}s`;
}

function extractProductLabel(description: string): string | null {
  const cleaned = stripTechnicalNoise(description);
  return findFirstMatch(cleaned, PRODUCT_TYPES)?.label ?? null;
}

function extractQualifierLabels(description: string): string[] {
  return QUALIFIERS.filter((entry) => entry.pattern.test(description)).map((entry) => entry.label);
}

/** Merge unique customs descriptions for HS aggregation export rows. */
export function aggregateCustomsDescriptions(descriptions: string[]): string {
  const unique = [...new Set(descriptions.map((desc) => desc.trim()).filter(Boolean))];
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0];

  const productLabels = [
    ...new Set(
      unique
        .map((desc) => extractProductLabel(desc))
        .filter((label): label is string => label != null)
    ),
  ];

  if (productLabels.length === 1) {
    const qualifiers = [
      ...new Set(unique.flatMap((desc) => extractQualifierLabels(desc))),
    ];
    const hasGalvanized = unique.some((desc) => /galvanized/i.test(desc));
    const hasSteel = unique.some((desc) => /\bsteel\b/i.test(desc) || /wire rope/i.test(desc));

    let base = capitalizeWords(pluralizeProductLabel(productLabels[0]));
    if (productLabels[0] === "wire rope" && hasGalvanized) {
      base = hasSteel ? "Galvanized steel wire ropes" : "Galvanized wire ropes";
    } else if (hasGalvanized) {
      base = `Galvanized ${base.toLowerCase()}`;
    }

    if (qualifiers.length > 0) {
      return `${base}, ${qualifiers.join(", ")}`;
    }
    return base;
  }

  return unique.join(", ");
}
