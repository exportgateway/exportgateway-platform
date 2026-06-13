/**
 * Preferential Origin Engine unit tests (mirrors TypeScript engine).
 * Run: npm run test:preferential-origin
 */

function parsePositionNumbers(raw) {
  const normalized = raw.replace(/\band\b/gi, ",");
  const nums = normalized
    .split(/[,;/\s]+/)
    .map((part) => parseInt(part.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(nums)].sort((a, b) => a - b);
}

function eur1ExplicitlyCoversRemainingPositions(text) {
  return (
    /all\s+(?:other|remaining)\s+(?:positions|line\s+items|products|goods)/i.test(text) ||
    /all\s+(?:positions|products|line\s+items|goods|lines)\s+except/i.test(text) ||
    /for\s+all\s+(?:positions|products|line\s+items|goods|lines)\s+except/i.test(text) ||
    /covers\s+all\s+(?:positions|products|items|lines|goods)\s+except/i.test(text) ||
    /applies\s+to\s+all\s+(?:positions|products|items|lines|goods)\s+except/i.test(text) ||
    /eur\.?\s*1\s+(?:enclosed|attached|included|provided|issued)\s+for\s+all\s+(?:positions|products|line\s+items|goods)\s+except/i.test(
      text
    )
  );
}

const DECLARATION_PATTERNS = [
  {
    kind: "positions_preferential_yes",
    re: /positions?\s+([\d,\sand]+)\s+(?:are\s+)?(?:of\s+)?(?:(?:EU|E\.U\.)\s+)?preferential\s+origin/gi,
    extractPositions: (m) => parsePositionNumbers(m[1]),
  },
  {
    kind: "eur1_except_positions",
    re: /eur\.?\s*1\s+(?:enclosed|attached|included|provided|issued).*?except(?:\s+where\s+otherwise\s+indicated)?(?:\s+(?:for\s+)?)?(?:positions?\s+)?([\d,\sand]+)/gi,
    extractExcluded: (m) => parsePositionNumbers(m[1]),
  },
  {
    kind: "all_products_preferential",
    re: /products?\s+covered\s+by\s+this\s+document\s+are\s+of\s+preferential\s+origin/gi,
  },
];

function detectDeclarations(corpus) {
  const found = [];
  for (const pattern of DECLARATION_PATTERNS) {
    pattern.re.lastIndex = 0;
    let match;
    while ((match = pattern.re.exec(corpus)) !== null) {
      found.push({
        kind: pattern.kind,
        text: match[0].trim(),
        positions: pattern.extractPositions?.(match),
        excluded_positions: pattern.extractExcluded?.(match),
      });
    }
  }
  return found;
}

function buildRuleState(declarations, corpus) {
  const state = {
    explicitYes: new Set(),
    explicitNo: new Set(),
    blanketAllYes: false,
    eur1Except: new Set(),
    eur1CoversRemainingExplicit: false,
  };
  const eur1Decls = declarations.filter((d) => d.kind === "eur1_except_positions");
  for (const decl of declarations) {
    if (decl.kind === "positions_preferential_yes") {
      for (const p of decl.positions ?? []) state.explicitYes.add(p);
    } else if (decl.kind === "all_products_preferential") {
      state.blanketAllYes = true;
    } else if (decl.kind === "eur1_except_positions") {
      for (const p of decl.excluded_positions ?? []) {
        state.eur1Except.add(p);
        state.explicitNo.add(p);
      }
    }
  }
  if (eur1Decls.length > 0) {
    state.eur1CoversRemainingExplicit =
      eur1Decls.some((d) => eur1ExplicitlyCoversRemainingPositions(d.text)) ||
      eur1ExplicitlyCoversRemainingPositions(corpus);
  }
  return state;
}

function resolveLine(position, rules) {
  if (rules.explicitNo.has(position)) {
    return { preferential_origin: "NO", preference_source: "excluded_positions_list" };
  }
  if (rules.explicitYes.has(position)) {
    return { preferential_origin: "YES", preference_source: "invoice_declaration" };
  }
  if (rules.blanketAllYes) {
    return { preferential_origin: "YES", preference_source: "invoice_declaration" };
  }
  if (rules.eur1Except.size > 0 && !rules.eur1Except.has(position)) {
    if (rules.eur1CoversRemainingExplicit) {
      return { preferential_origin: "YES", preference_source: "invoice_declaration" };
    }
    return { preferential_origin: "UNKNOWN", preference_source: "invoice_declaration" };
  }
  return { preferential_origin: "UNKNOWN", preference_source: "none" };
}

function runEngine(invoice) {
  const corpus = invoice.vat_article ?? "";
  const declarations = detectDeclarations(corpus);
  const rules = buildRuleState(declarations, corpus);
  return (invoice.items ?? []).map((item, i) => ({
    position_number: i + 1,
    country_of_origin: item.country_of_origin ?? "—",
    ...resolveLine(i + 1, rules),
  }));
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

console.log("eur1ExplicitlyCoversRemainingPositions");
assert(
  !eur1ExplicitlyCoversRemainingPositions("EUR.1 enclosed except positions 3 and 8"),
  "plain EUR.1 except — not explicit remaining"
);
assert(
  eur1ExplicitlyCoversRemainingPositions("EUR.1 enclosed for all positions except 3 and 8"),
  "for all positions except — explicit remaining"
);
assert(
  eur1ExplicitlyCoversRemainingPositions("All products except positions 3 and 8"),
  "all products except — explicit remaining"
);

console.log("\nEUR.1 except WITHOUT explicit remaining coverage");
const r1 = runEngine({
  vat_article: "EUR.1 enclosed except positions 3 and 8",
  items: [
    { country_of_origin: "DE" },
    { country_of_origin: "DE" },
    { country_of_origin: "CN" },
    { country_of_origin: "DE" },
  ],
});
assert(r1[2].preferential_origin === "NO", "excluded position 3 = NO");
assert(r1[0].preferential_origin === "UNKNOWN", "remaining position 1 = UNKNOWN");
assert(r1[3].preferential_origin === "UNKNOWN", "remaining position 4 = UNKNOWN");

console.log("\nEUR.1 except WITH explicit remaining coverage");
const r2 = runEngine({
  vat_article: "EUR.1 enclosed for all positions except 3 and 8",
  items: [
    { country_of_origin: "DE" },
    { country_of_origin: "DE" },
    { country_of_origin: "CN" },
    { country_of_origin: "DE" },
  ],
});
assert(r2[2].preferential_origin === "NO", "excluded position 3 = NO");
assert(r2[0].preferential_origin === "YES", "remaining position 1 = YES");
assert(r2[3].preferential_origin === "YES", "remaining position 4 = YES");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
