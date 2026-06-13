/**
 * Forensic: raw Mistral OCR pages + document_annotation for Invoice_156.pdf
 * Mirrors production export-auditor mistral_ocr.py (upstream schema, no shipment patch).
 * Run: node scripts/forensic-mistral-ocr-156.mjs
 */

import fs from "fs";
import path from "path";

const PDF =
  process.env.INVOICE_156_PDF ||
  "C:\\CURSOR\\export-auditor\\test_invoice_v1\\Invoice_156.pdf";
const OUT_DIR = path.join(process.cwd(), "reports", "denkirs-156-mistral-raw");

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// Upstream production DOCUMENT_ANNOTATION_PROMPT (export-auditor main)
const DOCUMENT_ANNOTATION_PROMPT = `Extract complete commercial export invoice data from this document.

Requirements:
- Process ALL pages. Line items may continue across multiple pages — include every row.
- Extract the invoice grand total into total_value (subtotal, total, amount due, or net/gross total).
- Preserve full Incoterms text exactly as printed, including delivery place (example: "DAP Beograd", not just "DAP").
- For each line item extract item_code, description, quantity, unit price, line total, tariff/HS/CN code, and country of origin.
- Extract item_code from product code / artikel / SKU columns (examples: HONMB-PN002, HON013730.10, ADI033442.21, HONMB-DGB2MF).
- Extract vat_article as the full legal VAT exemption/reference text exactly as printed, including leading words such as "Article".
- Map tariff code columns (Tariff, HS, CN, Customs code, Tariff code) into hs_code.
- Map origin columns (Country of origin, Origin, COO) into country_of_origin.
- country_code must be ISO 3166-1 alpha-2 when identifiable.
- Use empty strings for unknown fields. Do not invent values.
- Include all line items from invoice tables, not a summary row only.
`;

// Upstream production ExtractedInvoiceSchema (no shipment_summary / ocr_text)
const PRODUCTION_ANNOTATION_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "ExtractedInvoiceSchema",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        invoice_number: { type: "string" },
        invoice_date: { type: "string" },
        exporter: { type: "string" },
        consignee: { type: "string" },
        country: { type: "string" },
        country_code: { type: "string" },
        incoterms: {
          type: "string",
          description: "Full Incoterms text including place, e.g. 'DAP Beograd'.",
        },
        currency: { type: "string" },
        total_value: {
          type: "string",
          description: "Invoice grand total / total amount as printed on the invoice.",
        },
        vat_article: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              item_code: { type: "string" },
              description: { type: "string" },
              quantity: { type: "string" },
              unit_price: { type: "string" },
              line_total: { type: "string" },
              hs_code: { type: "string" },
              country_of_origin: { type: "string" },
            },
            required: [
              "item_code",
              "description",
              "quantity",
              "unit_price",
              "line_total",
              "hs_code",
              "country_of_origin",
            ],
          },
        },
        document_flags: {
          type: "object",
          additionalProperties: false,
          properties: {
            commercial_invoice: { type: "boolean" },
            packing_list_referenced: { type: "boolean" },
            certificate_of_origin_referenced: { type: "boolean" },
            proforma_invoice: { type: "boolean" },
            delivery_note_referenced: { type: "boolean" },
          },
          required: [
            "commercial_invoice",
            "packing_list_referenced",
            "certificate_of_origin_referenced",
            "proforma_invoice",
            "delivery_note_referenced",
          ],
        },
      },
      required: [
        "invoice_number",
        "invoice_date",
        "exporter",
        "consignee",
        "country",
        "country_code",
        "incoterms",
        "currency",
        "total_value",
        "vat_article",
        "items",
        "document_flags",
      ],
    },
  },
};

function searchNeedles(haystack, label) {
  const needles = [
    "bruto",
    "teža",
    "teza",
    "koli",
    "76,74",
    "76.74",
    "neto",
    "gross",
    "weight",
    "package",
    "colli",
    "palete",
  ];
  const lower = haystack.toLowerCase();
  const hits = needles.filter((n) => lower.includes(n.toLowerCase()));
  console.log(`\n[${label}] length=${haystack.length} needle hits: ${hits.join(", ") || "(none)"}`);
  for (const n of ["bruto", "koli", "76,74", "76.74"]) {
    const idx = lower.indexOf(n.toLowerCase());
    if (idx >= 0) {
      console.log(`  context "${n}":`, JSON.stringify(haystack.slice(Math.max(0, idx - 80), idx + 120)));
    }
  }
}

async function main() {
  loadEnvLocal();
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.error("MISTRAL_API_KEY not set");
    process.exit(1);
  }
  if (!fs.existsSync(PDF)) {
    console.error("PDF not found:", PDF);
    process.exit(1);
  }

  const pdfBytes = fs.readFileSync(PDF);
  const b64 = pdfBytes.toString("base64");
  console.log("PDF:", PDF, `(${pdfBytes.length} bytes)`);
  console.log("Calling Mistral OCR (production-identical config)...");

  const body = {
    model: "mistral-ocr-latest",
    document: {
      type: "document_url",
      document_url: `data:application/pdf;base64,${b64}`,
    },
    table_format: "html",
    include_image_base64: false,
    extract_header: true,
    extract_footer: true,
    document_annotation_format: PRODUCTION_ANNOTATION_SCHEMA,
    document_annotation_prompt: DOCUMENT_ANNOTATION_PROMPT,
  };

  const res = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("Mistral OCR failed:", res.status, text.slice(0, 2000));
    process.exit(1);
  }

  const data = JSON.parse(text);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "full-mistral-response.json"), JSON.stringify(data, null, 2));

  const pages = data.pages ?? [];
  const pageTexts = [];
  for (let i = 0; i < pages.length; i++) {
    const md = pages[i]?.markdown ?? "";
    pageTexts.push(`=== PAGE ${i + 1} OF ${pages.length} ===\n${md}`);
    fs.writeFileSync(path.join(OUT_DIR, `page-${i + 1}.md`), md);
  }
  const fullText = pageTexts.join("\n\n---\n\n");
  fs.writeFileSync(path.join(OUT_DIR, "ocr-full-text.md"), fullText);

  const docAnn = data.document_annotation ?? "";
  fs.writeFileSync(
    path.join(OUT_DIR, "document_annotation.json"),
    typeof docAnn === "string" ? docAnn : JSON.stringify(docAnn, null, 2)
  );

  console.log("\n=== MISTRAL OCR SUMMARY ===");
  console.log("page_count:", pages.length);
  console.log("page_lengths:", pages.map((p) => (p?.markdown ?? "").length));
  console.log("document_annotation_length:", String(docAnn).length);

  searchNeedles(fullText, "OCR pages (markdown)");
  searchNeedles(String(docAnn), "document_annotation");

  let parsedAnn = {};
  try {
    parsedAnn = typeof docAnn === "string" ? JSON.parse(docAnn) : docAnn;
  } catch {
    parsedAnn = {};
  }
  fs.writeFileSync(
    path.join(OUT_DIR, "document_annotation-parsed.json"),
    JSON.stringify(parsedAnn, null, 2)
  );

  console.log("\n=== document_annotation top-level keys ===");
  console.log(Object.keys(parsedAnn).join(", "));
  console.log("shipment_summary in annotation:", "shipment_summary" in parsedAnn);
  console.log("ocr_text in annotation:", "ocr_text" in parsedAnn);

  console.log("\nSaved to:", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
