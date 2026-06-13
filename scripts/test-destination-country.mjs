/**
 * Unit tests for consignee destination country resolution (mirrors destination-country.ts).
 * Run: npm run test:destination-country
 */

const CONSIGNEE_POSTAL_PREFIX_COUNTRIES = {
  MK: { code: "MK", name: "North Macedonia" },
  RS: { code: "RS", name: "Serbia" },
  BA: { code: "BA", name: "Bosnia and Herzegovina" },
  AL: { code: "AL", name: "Albania" },
  XK: { code: "XK", name: "Kosovo" },
  ME: { code: "ME", name: "Montenegro" },
};

const CONSIGNEE_POSTAL_PREFIX_RE = /\b(MK|RS|BA|AL|XK|ME)-(\d{4,5})\b/i;

function extractDestinationFromConsignee(consignee) {
  const text = consignee?.trim() ?? "";
  if (!text) return null;
  const match = text.match(CONSIGNEE_POSTAL_PREFIX_RE);
  if (!match) return null;
  const prefix = match[1].toUpperCase();
  const mapped = CONSIGNEE_POSTAL_PREFIX_COUNTRIES[prefix];
  if (!mapped) return null;
  return { code: mapped.code, name: mapped.name, prefix };
}

function resolveDestinationCountry(invoice) {
  const fromConsignee = extractDestinationFromConsignee(invoice.consignee);
  if (!fromConsignee) return invoice;
  return { ...invoice, country: fromConsignee.name, country_code: fromConsignee.code };
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

console.log("extractDestinationFromConsignee");

assert(
  extractDestinationFromConsignee("AVC Group d.o.o., MK-1000 Skopje")?.code === "MK",
  "MK-1000 Skopje → MK"
);
assert(
  extractDestinationFromConsignee("AVC Group d.o.o., MK-1000 Skopje")?.name ===
    "North Macedonia",
  "MK-1000 Skopje → North Macedonia"
);
assert(
  extractDestinationFromConsignee("Customer, RS-11000 Beograd")?.code === "RS",
  "RS-11000 → RS"
);
assert(
  extractDestinationFromConsignee("Customer, BA-71000 Sarajevo")?.code === "BA",
  "BA-71000 → BA"
);
assert(extractDestinationFromConsignee("1000 Ljubljana, Slovenia") === null, "SI postal → null");
assert(extractDestinationFromConsignee("") === null, "empty consignee → null");

console.log("\nresolveDestinationCountry — invoice 26-392-000027 scenario");

const ocrWrong = {
  invoice_number: "26-392-000027",
  exporter: "AVC Group d.o.o., Ljubljana, Slovenia",
  consignee: "AVC Group d.o.o.\nMK-1000 Skopje",
  country: "Slovenia",
  country_code: "SI",
  incoterms: "EXW SI-1000 Ljubljana",
};

const fixed = resolveDestinationCountry(ocrWrong);

assert(fixed.country === "North Macedonia", "EXW SI + consignee MK-1000 → country North Macedonia");
assert(fixed.country_code === "MK", "EXW SI + consignee MK-1000 → country_code MK");
assert(fixed.incoterms === "EXW SI-1000 Ljubljana", "incoterms unchanged");
assert(fixed.exporter?.includes("Ljubljana"), "exporter unchanged");

console.log("\nresolveDestinationCountry — no consignee prefix");

const unchanged = resolveDestinationCountry({
  consignee: "Beta Import GmbH, Vienna, Austria",
  country: "Austria",
  country_code: "AT",
});
assert(unchanged.country === "Austria", "no prefix → country unchanged");
assert(unchanged.country_code === "AT", "no prefix → code unchanged");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
