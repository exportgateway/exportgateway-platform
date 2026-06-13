import type { NormalizedInvoice } from "@/lib/export-auditor/api-types";
import { enrichInvoiceShipmentData } from "@/lib/export-auditor/shipment-summary-extractor";
import { enrichItemHsCodesFromOcr } from "@/lib/export-auditor/tabular-hs-extractor";
import {
  applyParserOcrCrosscheck,
  PARSER_MAPPING_FAILURE,
} from "@/lib/export-auditor/parser-ocr-crosscheck";
import { enrichPreferentialLineMarkersFromPdf } from "@/lib/export-auditor/pdf-preferential-line-enrichment";
import {
  extractAuthorisedExporterNumber,
  extractOriginDeclarationBlock,
} from "@/lib/export-auditor/preferential-origin-engine";
import { resolveDestinationCountry } from "@/lib/export-auditor/destination-country";
import { mergeDocumentText } from "@/lib/export-auditor/pdf-text-extract";
import { appendProvenance } from "@/lib/export-auditor/extraction-provenance";
import {
  detectMultilingualPreferentialOrigin,
  extractMultilingualOriginCountry,
} from "@/lib/export-auditor/multilingual-field-extractor";

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
  const corpus = mergeDocumentText(pdfText, buildFullDocumentCorpus(invoice));
  let enriched: NormalizedInvoice = {
    ...invoice,
    ocr_text: corpus || invoice.ocr_text,
  };

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
  if (labelledOrigin.country_code && enriched.items?.length) {
    enriched = {
      ...enriched,
      items: enriched.items.map((item) =>
        item.country_of_origin?.trim()
          ? item
          : {
              ...item,
              country_of_origin: labelledOrigin.country ?? labelledOrigin.country_code ?? "",
            }
      ),
    };
  }

  const authorisedExporterNumber = extractAuthorisedExporterNumber(corpus);
  if (authorisedExporterNumber) {
    enriched = { ...enriched, authorised_exporter_number: authorisedExporterNumber };
    enriched = appendProvenance(enriched, {
      field: "authorised_exporter_number",
      value: authorisedExporterNumber,
      source: "preferential_origin_engine",
    });
  }

  enriched = enrichPreferentialLineMarkersFromPdf(enriched, pdfText);

  const mappingFailurePreview = applyParserOcrCrosscheck(enriched);
  const hadParserMappingFailure = mappingFailurePreview.signals.includes(PARSER_MAPPING_FAILURE);

  enriched = enrichInvoiceShipmentData(enriched);
  enriched = resolveDestinationCountry(enriched);
  enriched = enrichItemHsCodesFromOcr(enriched);

  const crosscheck = applyParserOcrCrosscheck(enriched);
  enriched = crosscheck.invoice;

  if (hadParserMappingFailure || crosscheck.signals.includes(PARSER_MAPPING_FAILURE)) {
    enriched = {
      ...enriched,
      document_flags: {
        ...enriched.document_flags,
        [PARSER_MAPPING_FAILURE]: true,
      },
    };
  }

  return enriched;
}
