import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { enrichInvoiceShipmentData } from "@/lib/export-auditor/shipment-summary-extractor";
import { runMultiPassCustomsExtraction } from "@/lib/export-auditor/multi-pass-extraction";
import { recoverLineValuesFromCorpus } from "@/lib/export-auditor/line-value-recovery-engine";
import { deduplicateCommercialLineItems } from "@/lib/export-auditor/commercial-line-deduplication";
import {
  applyParserOcrCrosscheck,
  PARSER_MAPPING_FAILURE,
} from "@/lib/export-auditor/parser-ocr-crosscheck";
import { enrichPreferentialLineMarkersFromPdf } from "@/lib/export-auditor/pdf-preferential-line-enrichment";
import {
  detectAuthorisedExporter,
} from "@/lib/export-auditor/authorised-exporter-detection-engine";
import {
  extractOriginDeclarationBlock,
} from "@/lib/export-auditor/preferential-origin-engine";
import { resolveDestinationCountry } from "@/lib/export-auditor/destination-country";
import {
  applyWithPositionLock,
  lockCommercialPositions,
} from "@/lib/export-auditor/position-lock-engine";
import { mergeDocumentText } from "@/lib/export-auditor/pdf-text-extract";
import { normalizeMultipageOcrCorpus } from "@/lib/export-auditor/corpus-normalize";
import { appendProvenance } from "@/lib/export-auditor/extraction-provenance";
import {
  detectMultilingualPreferentialOrigin,
  extractMultilingualOriginCountry,
} from "@/lib/export-auditor/multilingual-field-extractor";
import {
  enrichEnglishInvoiceFieldsFromOcr,
  isValidConsigneeText,
  TABLE_RECONSTRUCTION_REJECTED,
} from "@/lib/export-auditor/english-invoice-field-extractor";
import { validateAndCorrectInvoiceTotal } from "@/lib/export-auditor/invoice-total-validation";
import { resolveInvoiceValue } from "@/lib/export-auditor/parse-locale-number";
import {
  attachParserInputSnapshot,
  recordParserRecovery,
  serializeRecoveryValue,
} from "@/lib/export-auditor/parser-recovery-provenance";
import {
  enableForensicTraceForInvoice,
  logAfterEnglishRecovery,
  logAfterTotalValidation,
  logBeforeEnrich,
} from "@/lib/export-auditor/as2026-forensic-trace";
import { normalizeInvoiceCommercialDescriptions } from "@/lib/export-auditor/commercial-description-normalizer";
import { enrichInvoicePackagingData } from "@/lib/export-auditor/packaging-extraction-engine";
import {
  attachTraceabilityAuditToInvoice,
  buildPositionTraceabilityAudit,
} from "@/lib/export-auditor/position-traceability-audit";

function buildFullDocumentCorpus(invoice: NormalizedInvoice): string {
  const parts: string[] = [];

  if (invoice.ocr_text?.trim()) parts.push(invoice.ocr_text.trim());

  const keys = [
    "vat_article",
    "origin_declaration_text",
    "exporter",
    "consignee",
    "incoterms",
    "invoice_number",
    "footer_text",
    "shipment_notes",
    "packing_info",
    "delivery_notes",
  ] as const;

  for (const key of keys) {
    const value = invoice[key];
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  }

  for (const value of Object.values(invoice.document_flags ?? {})) {
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  }

  return parts.join("\n");
}

/**
 * Post-OCR document enrichment — merges PDF text, shipment summary, origin declaration,
 * and authorised exporter metadata without changing upstream OCR API behaviour.
 */
export function enrichInvoiceDocument(
  invoice: NormalizedInvoice,
  pdfText?: string | null
): NormalizedInvoice {
  enableForensicTraceForInvoice(invoice);
  logBeforeEnrich(invoice, pdfText?.length ?? undefined);

  const rawCorpus = mergeDocumentText(pdfText, buildFullDocumentCorpus(invoice));
  const corpus = normalizeMultipageOcrCorpus(rawCorpus);
  let enriched: NormalizedInvoice = attachParserInputSnapshot({
    ...invoice,
    ocr_text: corpus || invoice.ocr_text,
    ocr_metadata: {
      ...invoice.ocr_metadata,
      ...(pdfText?.trim() && !invoice.ocr_metadata?.extracted_pdf_text
        ? { extracted_pdf_text: pdfText.trim() }
        : {}),
    },
  });

  if (!enriched.origin_declaration_text?.trim()) {
    const declaration = extractOriginDeclarationBlock(corpus);
    if (declaration) {
      enriched = {
        ...enriched,
        origin_declaration_text: declaration,
      };
      enriched = appendProvenance(enriched, {
        field: "origin_declaration_text",
        value: declaration.slice(0, 80),
        source: "preferential_origin_engine",
      });
    } else if (detectMultilingualPreferentialOrigin(corpus)) {
      enriched = appendProvenance(enriched, {
        field: "preferential_origin_indicator",
        value: "multilingual_label_detected",
        source: "multilingual_field_extractor",
      });
    }
  }

  const labelledOrigin = extractMultilingualOriginCountry(corpus);
  if (labelledOrigin.country_code && (enriched.items?.length ?? 0) === 1) {
    enriched = {
      ...enriched,
      items: (enriched.items ?? []).map((item) =>
        item.country_of_origin?.trim()
          ? item
          : {
              ...item,
              country_of_origin: labelledOrigin.country ?? labelledOrigin.country_code ?? "",
            }
      ),
    };
  }

  const authDetection = detectAuthorisedExporter(corpus, enriched);
  if (authDetection.detected && authDetection.authorisation_number) {
    enriched = {
      ...enriched,
      authorised_exporter_number: authDetection.authorisation_number,
      document_flags: {
        ...enriched.document_flags,
        authorisation_number: authDetection.authorisation_number,
        authorised_exporter_confidence: authDetection.confidence,
        ...(authDetection.authorisation_country
          ? { authorisation_country: authDetection.authorisation_country }
          : {}),
        ...(authDetection.detection_rule
          ? { authorised_exporter_detection_rule: authDetection.detection_rule }
          : {}),
        ...(authDetection.country_match != null
          ? { authorised_exporter_country_match: authDetection.country_match }
          : {}),
      },
    };
    enriched = appendProvenance(enriched, {
      field: "authorised_exporter_number",
      value: authDetection.authorisation_number,
      source: "authorised_exporter_detection_engine",
    });
  }

  enriched = enrichPreferentialLineMarkersFromPdf(enriched, pdfText);
  const beforeEnglish = enriched;
  enriched = enrichEnglishInvoiceFieldsFromOcr(enriched);
  logAfterEnglishRecovery(beforeEnglish, enriched, enriched.ocr_text?.trim() ?? corpus);

  const corpusForTotal = enriched.ocr_text?.trim() ?? corpus;
  const totalResult = validateAndCorrectInvoiceTotal(enriched, corpusForTotal);
  enriched = totalResult.invoice;
  logAfterTotalValidation(beforeEnglish, totalResult, corpusForTotal);

  const mappingFailurePreview = applyParserOcrCrosscheck(enriched);
  const hadParserMappingFailure = mappingFailurePreview.signals.includes(PARSER_MAPPING_FAILURE);

  enriched = enrichInvoiceShipmentData(enriched);
  enriched = enrichInvoicePackagingData(enriched);
  enriched = resolveDestinationCountry(enriched);

  const parserDestination = enriched.parser_input_snapshot?.country_code ?? enriched.parser_input_snapshot?.country;
  const finalDestination = enriched.country_code ?? enriched.country;
  if (
    finalDestination &&
    parserDestination !== finalDestination &&
    !enriched.parser_recovery_provenance?.some((entry) => entry.field === "destination_country")
  ) {
    enriched = recordParserRecovery(enriched, {
      field: "destination_country",
      original_value: serializeRecoveryValue(parserDestination),
      recovered_value: serializeRecoveryValue(finalDestination) ?? String(finalDestination),
      recovery_source: "OCR_DESTINATION_RECOVERY",
    });
  }

  const ocrItemsBeforeRecovery = [...(enriched.items ?? [])];
  if (enriched.document_flags?.[TABLE_RECONSTRUCTION_REJECTED] !== true) {
    enriched = recoverLineValuesFromCorpus(enriched);
  }
  const preRecoveryItems = [...(enriched.items ?? [])];
  enriched = deduplicateCommercialLineItems(enriched).invoice;
  enriched = lockCommercialPositions(enriched);

  const multiPass = applyWithPositionLock(enriched, "multi_pass_extraction", (input) =>
    runMultiPassCustomsExtraction(input)
  );
  enriched = multiPass.invoice;

  const crosscheck = applyParserOcrCrosscheck(enriched);
  enriched = crosscheck.invoice;

  if (hadParserMappingFailure || crosscheck.signals.includes(PARSER_MAPPING_FAILURE)) {
    const recovered =
      Boolean(enriched.invoice_number?.trim()) &&
      Boolean(enriched.exporter?.trim()) &&
      isValidConsigneeText(enriched.consignee) &&
      resolveInvoiceValue(enriched) > 0 &&
      (enriched.items?.length ?? 0) > 0;
    if (!recovered) {
      enriched = {
        ...enriched,
        document_flags: {
          ...enriched.document_flags,
          [PARSER_MAPPING_FAILURE]: true,
        },
      };
    }
  }

  enriched = {
    ...enriched,
    items: normalizeInvoiceCommercialDescriptions(enriched.items ?? []),
  };
  const traceAudit = buildPositionTraceabilityAudit(enriched, {
    ocrItems: ocrItemsBeforeRecovery,
    preRecoveryItems,
  });
  enriched = attachTraceabilityAuditToInvoice(enriched, traceAudit);

  return enriched;
}
