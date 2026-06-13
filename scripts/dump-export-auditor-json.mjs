/**
 * Dump raw Export Auditor API JSON for an invoice PDF.
 * Usage: node scripts/dump-export-auditor-json.mjs "C:\path\to\invoice.pdf"
 */

import fs from "fs";
import path from "path";

// Apply same consignee destination rule as platform server-actions (post-OCR).
function resolveDestinationCountry(invoice) {
  const re = /\b(MK|RS|BA|AL|XK|ME)-(\d{4,5})\b/i;
  const map = {
    MK: { code: "MK", name: "North Macedonia" },
    RS: { code: "RS", name: "Serbia" },
    BA: { code: "BA", name: "Bosnia and Herzegovina" },
    AL: { code: "AL", name: "Albania" },
    XK: { code: "XK", name: "Kosovo" },
    ME: { code: "ME", name: "Montenegro" },
  };
  const m = (invoice.consignee ?? "").match(re);
  if (!m) return invoice;
  const hit = map[m[1].toUpperCase()];
  if (!hit) return invoice;
  return { ...invoice, country: hit.name, country_code: hit.code };
}

const baseUrl =
  process.env.EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") ||
  "https://export-auditor.onrender.com";

const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error("Usage: node scripts/dump-export-auditor-json.mjs <path-to-pdf>");
  process.exit(1);
}

const abs = path.resolve(pdfPath);
if (!fs.existsSync(abs)) {
  console.error(`File not found: ${abs}`);
  process.exit(1);
}

const buffer = fs.readFileSync(abs);
const blob = new Blob([buffer], { type: "application/pdf" });

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { url, status: res.status, bytes: text.length, json };
}

async function postOcr(url) {
  const form = new FormData();
  form.append("file", blob, path.basename(abs));
  const res = await fetch(url, { method: "POST", body: form });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { url, status: res.status, bytes: text.length, json };
}

function summarize(invoice, disposition, audit) {
  console.log("\n=== SUMMARY ===");
  console.log("invoice.invoice_number:", invoice?.invoice_number);
  console.log("invoice.items.length:", invoice?.items?.length ?? 0);
  console.log("\ninvoice.items:");
  console.log(JSON.stringify(invoice?.items ?? [], null, 2));
  console.log("\ndisposition.tariff_codes:");
  console.log(JSON.stringify(disposition?.tariff_codes ?? [], null, 2));
  console.log("\nHS fields on items:");
  for (const [i, item] of (invoice?.items ?? []).entries()) {
    console.log(`  [${i}]`, {
      hs_code: item?.hs_code,
      description: item?.description?.slice?.(0, 60),
    });
  }
  console.log("\naudit.audit_status:", audit?.audit_status);
}

console.log("API base:", baseUrl);
console.log("PDF:", abs, `(${buffer.length} bytes)`);

const ocrResult = await postOcr(`${baseUrl}/export-auditor/ocr`);
console.log(`\nOCR ${ocrResult.url} → HTTP ${ocrResult.status} (${ocrResult.bytes} bytes)`);
console.log("\n--- RAW OCR JSON ---");
console.log(JSON.stringify(ocrResult.json, null, 2));

const invoiceRaw = ocrResult.json?.invoice_number !== undefined ? ocrResult.json : null;
if (!invoiceRaw) {
  console.error("\nCould not extract invoice from OCR response.");
  process.exit(1);
}
const invoice = resolveDestinationCountry(invoiceRaw);
if (invoice.country !== invoiceRaw.country || invoice.country_code !== invoiceRaw.country_code) {
  console.log("\n--- POST-OCR DESTINATION CORRECTION ---");
  console.log("before:", { country: invoiceRaw.country, country_code: invoiceRaw.country_code });
  console.log("after:", { country: invoice.country, country_code: invoice.country_code });
}

const [readiness, disposition, preferenceOrigin, audit] = await Promise.all([
  postJson(`${baseUrl}/export-auditor/readiness`, invoice),
  postJson(`${baseUrl}/export-auditor/disposition`, invoice),
  postJson(`${baseUrl}/export-auditor/preference-origin`, invoice),
  postJson(`${baseUrl}/export-auditor/audit-report`, invoice),
]);

for (const result of [readiness, disposition, preferenceOrigin, audit]) {
  const label = result.url.split("/").pop();
  console.log(`\n${label} ${result.url} → HTTP ${result.status} (${result.bytes} bytes)`);
}

console.log("\n--- RAW READINESS JSON ---");
console.log(JSON.stringify(readiness.json, null, 2));
console.log("\n--- RAW DISPOSITION JSON ---");
console.log(JSON.stringify(disposition.json, null, 2));
console.log("\n--- RAW PREFERENCE-ORIGIN JSON ---");
console.log(JSON.stringify(preferenceOrigin.json, null, 2));
console.log("\n--- RAW AUDIT REPORT JSON ---");
console.log(JSON.stringify(audit.json, null, 2));

summarize(invoice, disposition.json, audit.json);

const hsFromItems = (invoice.items ?? [])
  .map((i) => i.hs_code?.trim())
  .filter(Boolean);
const hsFromDisposition = disposition.json?.tariff_codes ?? [];
console.log("\nHS from items (hs_code):", hsFromItems.length, hsFromItems);
console.log("HS from disposition.tariff_codes:", hsFromDisposition.length, hsFromDisposition);
