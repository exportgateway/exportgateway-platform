/**
 * Bootstrap golden-invoices/ from registry — creates invoice-source.json + expected-results.json.
 * Run: npm run golden-dataset:bootstrap
 */

import fs from "fs";
import path from "path";
import type { NormalizedInvoice } from "../src/lib/export-auditor/api-types";
import {
  buildExpectedResultsFromCapture,
  processGoldenInvoiceSource,
} from "../src/lib/export-auditor/golden-dataset";
import type { GoldenAnomalyCode } from "../src/lib/export-auditor/golden-dataset/types";
import { GOLDEN_INVOICE_REGISTRY } from "./golden-dataset-registry";

const ROOT = path.join(process.cwd(), "golden-invoices");

function loadSource(entry: (typeof GOLDEN_INVOICE_REGISTRY)[number]): NormalizedInvoice {
  if (entry.inline) return structuredClone(entry.inline);
  if (entry.fixturePath) {
    const fixturePath = path.join(process.cwd(), entry.fixturePath);
    const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as NormalizedInvoice & {
      _captureNote?: string;
    };
    delete raw._captureNote;
    return raw;
  }
  throw new Error(`No source for ${entry.id}`);
}

function writePdfPlaceholder(dir: string, name: string, note: string) {
  const target = path.join(dir, name);
  if (fs.existsSync(target)) return;
  fs.writeFileSync(
    target,
    `% Placeholder — replace with actual PDF.\n% ${note}\n`,
    "utf8"
  );
}

console.log("Bootstrapping golden invoice dataset...\n");

fs.mkdirSync(ROOT, { recursive: true });

let created = 0;

for (const entry of GOLDEN_INVOICE_REGISTRY) {
  const dir = path.join(ROOT, entry.id);
  fs.mkdirSync(dir, { recursive: true });

  const source = loadSource(entry);
  const sourcePath = path.join(dir, "invoice-source.json");
  fs.writeFileSync(sourcePath, JSON.stringify(source, null, 2), "utf8");

  const { captured } = processGoldenInvoiceSource(source, {
    pdfText: entry.pdfText ?? null,
    fileName: entry.fileName ?? `${entry.id}.pdf`,
  });

  const expected = buildExpectedResultsFromCapture(entry.id, entry.label, captured);
  expected.allowedAnomalies = (entry.allowedAnomalies ?? []) as GoldenAnomalyCode[];
  expected.notes = entry.notes;

  fs.writeFileSync(
    path.join(dir, "expected-results.json"),
    JSON.stringify(expected, null, 2),
    "utf8"
  );

  writePdfPlaceholder(
    dir,
    "invoice.pdf",
    `Source PDF for ${entry.label}. Original: ${entry.fileName ?? entry.id}`
  );
  writePdfPlaceholder(
    dir,
    "validation-report.pdf",
    `Export validation report PDF for ${entry.id}. Generate via validation-pdf-export.`
  );

  console.log(`  ✓ ${entry.id} — ${entry.label}`);
  created += 1;
}

const registryPath = path.join(ROOT, "registry.json");
fs.writeFileSync(
  registryPath,
  JSON.stringify(
    {
      version: 1,
      updatedAt: new Date().toISOString(),
      invoiceCount: created,
      ids: GOLDEN_INVOICE_REGISTRY.map((e) => e.id),
    },
    null,
    2
  ),
  "utf8"
);

fs.writeFileSync(
  path.join(ROOT, "README.md"),
  `# Golden Invoice Validation Dataset

Each subfolder contains:

| File | Purpose |
|------|---------|
| \`invoice.pdf\` | Source invoice PDF (replace placeholder with real file) |
| \`validation-report.pdf\` | Exported validation report PDF |
| \`invoice-source.json\` | OCR / normalized invoice payload |
| \`expected-results.json\` | Captured golden expectations |

## Commands

\`\`\`bash
npm run golden-dataset:bootstrap   # Rebuild expected-results from current engine
npm run test:golden-dataset        # Compare actual vs expected, generate review
\`\`\`

## Adding a new invoice

1. Add entry to \`scripts/golden-dataset-registry.ts\`
2. Run \`npm run golden-dataset:bootstrap\`
3. Review \`expected-results.json\` and adjust if needed
4. Drop real PDFs into \`golden-invoices/{id}/\`
`,
  "utf8"
);

console.log(`\nBootstrapped ${created} golden invoices in golden-invoices/`);
console.log("Run: npm run test:golden-dataset");
