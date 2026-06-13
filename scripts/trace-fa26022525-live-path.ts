/**
 * Read-only runtime trace — FA26022525 live path vs golden test path.
 * Run: npx tsx scripts/trace-fa26022525-live-path.ts
 */
import fs from "fs";
import path from "path";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";
import { enrichInvoiceDocument } from "../src/lib/export-auditor/document-enrichment";
import { mapAuditReportToExportReport } from "../src/lib/export-auditor/map-api-response";
import { runPreferentialOriginEngine } from "../src/lib/export-auditor/preferential-origin-engine";
import { collectShipmentCorpus } from "../src/lib/export-auditor/shipment-summary-extractor";
import { collectDeclarationCorpus } from "../src/lib/export-auditor/preferential-origin-engine";
import type {
  AuditReportResponse,
  DispositionResponse,
  NormalizedInvoice,
  PreferenceOriginResponse,
  ReadinessResponse,
} from "../src/lib/export-auditor/api-types";

const PDF =
  process.env.GOLDEN_PDF_FA26022525 ||
  "C:\\CURSOR\\export-auditor\\test_invoice_v1\\650330_FA26022525_CR0698891.PDF";
const FIXTURE = path.join(__dirname, "fixtures", "fa26022525-ocr.json");
const BASE =
  process.env.EXPORT_AUDITOR_API_URL?.replace(/\/$/, "") ||
  "https://export-auditor.onrender.com";

function snap(label: string, data: Record<string, unknown>) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(data, null, 2));
}

async function fetchOcrRaw(): Promise<NormalizedInvoice> {
  const buf = fs.readFileSync(PDF);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "application/pdf" }), path.basename(PDF));
  const res = await fetch(`${BASE}/export-auditor/ocr`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`OCR ${res.status}: ${await res.text()}`);
  return (await res.json()) as NormalizedInvoice;
}

async function postJson<T>(endpoint: string, invoice: NormalizedInvoice): Promise<T> {
  const res = await fetch(`${BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(invoice),
  });
  if (!res.ok) throw new Error(`${endpoint} ${res.status}`);
  return (await res.json()) as T;
}

/** Simulates JSON round-trip through Next.js Server Action (client ↔ server). */
function simulateServerActionRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mapShipmentSummaryLikeLive(
  invoice: NormalizedInvoice,
  audit: AuditReportResponse
) {
  const source = audit?.shipment_summary ?? invoice.shipment_summary;
  return {
    packageCount: source?.package_count ?? null,
    packageType: source?.package_type ?? null,
    grossWeightTotal: source?.gross_weight_total ?? null,
    grossWeightUnit: source?.gross_weight_unit ?? null,
    netWeightTotal: source?.net_weight_total ?? null,
    netWeightUnit: source?.net_weight_unit ?? null,
  };
}

async function main() {
  console.log("FA26022525 Runtime Data-Flow Trace\n");

  // --- Golden test path ---
  const pdfBuffer = fs.readFileSync(PDF);
  const pdfTextDirect = await extractPdfText(pdfBuffer);
  const goldenRaw = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as NormalizedInvoice;
  const goldenEnriched = enrichInvoiceDocument(goldenRaw, pdfTextDirect);
  const goldenEngine = runPreferentialOriginEngine(goldenEnriched);
  const goldenAuditStub: AuditReportResponse = {
    audit_status: "WARNING",
    readiness: { score: 70, status: "WARNING", warnings: [], errors: [] },
    preference_origin: {
      destination_outside_eu: true,
      origin_declaration_found: false,
      authorised_exporter_found: false,
      eur1_recommended: true,
      required_documents: ["EUR.1"],
    },
    issues: [],
    recommended_actions: [],
    summary: "stub",
  };
  const goldenReport = mapAuditReportToExportReport(
    goldenEnriched,
    goldenAuditStub,
    "650330_FA26022525_CR0698891.PDF"
  );

  snap("GOLDEN: pdfText.length", { length: pdfTextDirect.length });
  snap("GOLDEN: enriched invoice keys", {
    has_ocr_text: Boolean(goldenEnriched.ocr_text?.length),
    ocr_text_len: goldenEnriched.ocr_text?.length ?? 0,
    origin_declaration_text_len: goldenEnriched.origin_declaration_text?.length ?? 0,
    authorised_exporter_number: goldenEnriched.authorised_exporter_number ?? null,
    shipment_summary: goldenEnriched.shipment_summary ?? null,
  });
  snap("GOLDEN: engine", {
    authorised_exporter_detected: goldenEngine.authorised_exporter_detected,
    origin_declaration_found: goldenEngine.origin_declaration_found,
    line_statuses: goldenEngine.lines.map((l) => l.preferential_origin),
  });
  snap("GOLDEN: final report UI fields", {
    authorisedExporterDetected: goldenReport.preferenceOrigin.authorisedExporterDetected,
    originDeclarationFound: goldenReport.preferenceOrigin.originDeclarationFound,
    shipmentSummary: goldenReport.shipmentSummary,
    unknownLines: goldenReport.preferenceOrigin.lineItems.filter(
      (l) => l.preferential_origin === "UNKNOWN"
    ).length,
  });

  // --- Live path step 1: OCR API ---
  console.log("\n--- LIVE PATH ---");
  let rawOcr: NormalizedInvoice;
  try {
    rawOcr = await fetchOcrRaw();
  } catch (e) {
    console.error("Live OCR fetch failed:", e);
    rawOcr = goldenRaw;
    console.log("(Using fixture as raw OCR fallback for remainder of trace)");
  }

  snap("LIVE Step 1: raw OCR from API", {
    invoice_number: rawOcr.invoice_number,
    has_ocr_text: Boolean(rawOcr.ocr_text?.length),
    ocr_text_len: rawOcr.ocr_text?.length ?? 0,
    has_shipment_summary: Boolean(rawOcr.shipment_summary),
    shipment_summary: rawOcr.shipment_summary ?? null,
    item_count: rawOcr.items?.length ?? 0,
  });

  // --- Live path step 2: PDF text in server action ---
  const pdfTextInServerAction = await extractPdfText(pdfBuffer);
  snap("LIVE Step 2: extractPdfText in server action", {
    pdfText_length: pdfTextInServerAction.length,
    contains_Pallet: /Pallet\(s\)/i.test(pdfTextInServerAction),
    contains_GrossWeight: /GrossWeight/i.test(pdfTextInServerAction),
    contains_preferential: /preferential origin/i.test(pdfTextInServerAction),
  });

  // --- Live path step 3: enrichInvoiceDocument (postExportAuditorOcrAction) ---
  const enrichedLive = enrichInvoiceDocument(rawOcr, pdfTextInServerAction);
  snap("LIVE Step 3: after enrichInvoiceDocument", {
    ocr_text_len: enrichedLive.ocr_text?.length ?? 0,
    origin_declaration_text_len: enrichedLive.origin_declaration_text?.length ?? 0,
    authorised_exporter_number: enrichedLive.authorised_exporter_number ?? null,
    shipment_summary: enrichedLive.shipment_summary ?? null,
    declaration_corpus_len: collectDeclarationCorpus(enrichedLive).length,
    shipment_corpus_len: collectShipmentCorpus(enrichedLive).length,
  });

  // --- Live path step 4: Server Action JSON round-trip ---
  const enrichedAfterRoundTrip = simulateServerActionRoundTrip(enrichedLive);
  snap("LIVE Step 4: after Server Action JSON round-trip", {
    ocr_text_len: enrichedAfterRoundTrip.ocr_text?.length ?? 0,
    origin_declaration_text_len: enrichedAfterRoundTrip.origin_declaration_text?.length ?? 0,
    authorised_exporter_number: enrichedAfterRoundTrip.authorised_exporter_number ?? null,
    shipment_summary: enrichedAfterRoundTrip.shipment_summary ?? null,
  });

  // --- Live path step 5: upstream API analysis ---
  let readiness: ReadinessResponse;
  let disposition: DispositionResponse;
  let preferenceOrigin: PreferenceOriginResponse;
  let auditReport: AuditReportResponse;
  try {
    [readiness, disposition, preferenceOrigin, auditReport] = await Promise.all([
      postJson<ReadinessResponse>("/export-auditor/readiness", enrichedAfterRoundTrip),
      postJson<DispositionResponse>("/export-auditor/disposition", enrichedAfterRoundTrip),
      postJson<PreferenceOriginResponse>(
        "/export-auditor/preference-origin",
        enrichedAfterRoundTrip
      ),
      postJson<AuditReportResponse>("/export-auditor/audit-report", enrichedAfterRoundTrip),
    ]);
  } catch (e) {
    console.error("Upstream API failed:", e);
    auditReport = goldenAuditStub;
    preferenceOrigin = {
      preference_analysis: {
        origin_declaration_found: false,
        authorised_exporter_found: false,
        eur1_recommended: true,
      },
    };
    readiness = { score: 70, status: "WARNING", warnings: [], errors: [], checks_passed: 5, checks_total: 8 };
    disposition = {};
  }

  snap("LIVE Step 5a: audit-report preference_origin from API", auditReport.preference_origin ?? {});
  snap("LIVE Step 5b: audit-report shipment_summary from API", {
    has_shipment_summary_key: "shipment_summary" in auditReport,
    shipment_summary: auditReport.shipment_summary ?? null,
    shipment_summary_type: auditReport.shipment_summary === undefined ? "undefined" : typeof auditReport.shipment_summary,
  });
  snap("LIVE Step 5c: preference-origin API", preferenceOrigin.preference_analysis ?? {});

  // --- Live path step 6: engine on invoice client holds ---
  const engineLive = runPreferentialOriginEngine(enrichedAfterRoundTrip);
  snap("LIVE Step 6: runPreferentialOriginEngine on client invoice", {
    declaration_corpus_len: collectDeclarationCorpus(enrichedAfterRoundTrip).length,
    authorised_exporter_detected: engineLive.authorised_exporter_detected,
    origin_declaration_found: engineLive.origin_declaration_found,
    line_statuses: engineLive.lines.map((l) => l.preferential_origin),
  });

  // --- Live path step 7: mapShipmentSummary precedence check ---
  const mappedShipment = mapShipmentSummaryLikeLive(enrichedAfterRoundTrip, auditReport);
  snap("LIVE Step 7: mapShipmentSummary result (audit ?? invoice)", {
    invoice_shipment_summary: enrichedAfterRoundTrip.shipment_summary ?? null,
    audit_shipment_summary: auditReport.shipment_summary ?? null,
    mapped_UI_shipmentSummary: mappedShipment,
  });

  // --- Live path step 8: full mapAuditReportToExportReport (api-client) ---
  const liveReport = mapAuditReportToExportReport(
    enrichedAfterRoundTrip,
    auditReport,
    "650330_FA26022525_CR0698891.PDF",
    { readiness, disposition, preferenceOrigin }
  );
  snap("LIVE Step 8: final ExportAuditReport UI object", {
    authorisedExporterDetected: liveReport.preferenceOrigin.authorisedExporterDetected,
    originDeclarationFound: liveReport.preferenceOrigin.originDeclarationFound,
    shipmentSummary: liveReport.shipmentSummary,
    mrnGross: liveReport.hsAggregationReport.mrnSummary.totalGrossWeight,
    mrnNet: liveReport.hsAggregationReport.mrnSummary.totalNetWeight,
    unknownLines: liveReport.preferenceOrigin.lineItems.filter(
      (l) => l.preferential_origin === "UNKNOWN"
    ).length,
    invoiceValue: liveReport.invoiceSummary.invoiceValue,
  });

  // --- Failure point analysis ---
  console.log("\n=== FIRST FAILURE POINT ANALYSIS ===");
  const checks: Array<{ field: string; step: string; ok: boolean; detail: string }> = [];

  if (pdfTextInServerAction.length === 0) {
    checks.push({
      field: "all enrichment",
      step: "Step 2 extractPdfText",
      ok: false,
      detail: "PDF text empty — enrichment cannot extract footer/shipment/declaration",
    });
  }
  if (!enrichedLive.shipment_summary?.package_count) {
    checks.push({
      field: "shipmentSummary",
      step: "Step 3 enrichInvoiceDocument",
      ok: false,
      detail: "invoice.shipment_summary still empty after enrichment",
    });
  }
  if (!engineLive.authorised_exporter_detected) {
    checks.push({
      field: "authorised_exporter_found",
      step: "Step 6 runPreferentialOriginEngine",
      ok: false,
      detail: `corpus len=${collectDeclarationCorpus(enrichedAfterRoundTrip).length}, auth#=${enrichedAfterRoundTrip.authorised_exporter_number}`,
    });
  }
  if (!engineLive.origin_declaration_found) {
    checks.push({
      field: "origin_declaration_found",
      step: "Step 6 runPreferentialOriginEngine",
      ok: false,
      detail: `origin_declaration_text len=${enrichedAfterRoundTrip.origin_declaration_text?.length ?? 0}`,
    });
  }
  if (auditReport.shipment_summary !== undefined && mappedShipment.packageCount == null) {
    checks.push({
      field: "shipmentSummary UI",
      step: "Step 7 mapShipmentSummary",
      ok: false,
      detail: "audit.shipment_summary present but empty — overrides enriched invoice.shipment_summary",
    });
  }
  if (liveReport.preferenceOrigin.authorisedExporterDetected === false) {
    checks.push({
      field: "authorised_exporter_found UI",
      step: "Step 8 mapPreferenceOrigin",
      ok: false,
      detail: `api=${preferenceOrigin.preference_analysis?.authorised_exporter_found}, engine=${engineLive.authorised_exporter_detected}`,
    });
  }

  for (const c of checks) {
    console.log(`[${c.ok ? "OK" : "FAIL"}] ${c.field} @ ${c.step}: ${c.detail}`);
  }
  if (checks.length === 0) {
    console.log("Live path trace shows all fields populated — UI mismatch may be stale build or different code path.");
  }
}

main().catch(console.error);
