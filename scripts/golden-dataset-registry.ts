/**
 * Golden invoice registry — source definitions for bootstrap.
 * Add entries here, then run: npm run golden-dataset:bootstrap
 */

import type { NormalizedInvoice } from "../src/lib/export-auditor/api-types";

export interface GoldenRegistryEntry {
  id: string;
  label: string;
  fileName?: string;
  pdfText?: string;
  /** Path relative to repo root, or inline invoice payload */
  fixturePath?: string;
  inline?: NormalizedInvoice;
  allowedAnomalies?: string[];
  notes?: string;
}

export const GOLDEN_INVOICE_REGISTRY: GoldenRegistryEntry[] = [
  {
    id: "rn-46-pet-pan",
    label: "RN-46 PET PAN IVECO EUROCARGO — single vehicle line",
    fileName: "RN-46.pdf",
    fixturePath: "golden-invoices/rn-46-pet-pan/invoice-source.json",
    notes: "Single commercial vehicle — HS must not explode from chassis/engine corpus",
  },
  {
    id: "inv-220726",
    label: "INV/220726 → Kosovo (customer), China COO, freight line",
    fileName: "INV_220726.pdf",
    fixturePath: "golden-invoices/inv-220726/invoice-source.json",
    notes: "Shipping SI must not override Kosovo customer; China→CN; 01/20/2026 US date; CUSTOMS_REVIEW",
  },
  {
    id: "fa26022525",
    label: "Robot Coupe FA26022525 → Kosovo",
    fileName: "650330_FA26022525_CR0698891.PDF",
    fixturePath: "scripts/fixtures/fa26022525-ocr.json",
    notes: "European number parsing, HS 8438809900, EXW Kosovo",
  },
  {
    id: "denkirs-2026-156",
    label: "DENKIRS 2026-156 → Serbia",
    fileName: "Invoice_156.pdf",
    fixturePath: "scripts/fixtures/denkirs-2026-156-ocr-live.json",
    pdfText: "-- 1 of 2 --\n\n\n\n-- 2 of 2 --",
    allowedAnomalies: ["PHYSICAL_WEIGHT_CONTRADICTION"],
    notes: "Live OCR payload — no shipment weights in OCR",
  },
  {
    id: "unior-2602002968",
    label: "UNIOR 2602002968 → Iceland",
    fileName: "2602002968.pdf",
    fixturePath: "scripts/fixtures/2602002968-ocr.json",
    notes: "Mixed preferential origin, SI auth exporter, 38 lines",
  },
  {
    id: "transpak-a0054-2026",
    label: "TRANSPAK A0054/2026 → Serbia",
    fileName: "A0054-2026.pdf",
    fixturePath: "scripts/fixtures/a0054-2026-ocr.json",
    notes: "Mixed SI/CN origin, pallet weights in footer",
  },
  {
    id: "elcar-70399",
    label: "EL-CAR 70399 → Kosovo",
    fileName: "70399.pdf",
    inline: {
      invoice_number: "70399",
      invoice_date: "2026-01-15",
      exporter: "S.C. EL-CAR S.R.L",
      consignee: "PROFI KOSOVA SH. P. K\nPrishtina\nKosovo",
      country: "Kosovo",
      country_code: "XK",
      incoterms: "CPT",
      currency: "EUR",
      total_value: "2595.25",
      ocr_text: `
Invoice No. 70399
S.C. EL-CAR S.R.L
PROFI KOSOVA SH. P. K
Prishtina
Kosovo
Incoterms: CPT
Total invoice value: 2.595,25 EUR

Pos. HS Code UM Qty Unit price Amount
1 731210810080 M 1225 1.17 1433.30
2 731210810080 M 1000 0.93 930.00

Number of packages Net weight Gross weight
Nr. de colete Greut. neta Greut. bruta
1 770 850
`,
      items: [
        {
          description: "Steel wire products line 1",
          quantity: "1225",
          unit_price: "1.17",
          line_total: "1433.30",
          hs_code: "731210810080",
        },
        {
          description: "Steel wire products line 2",
          quantity: "1000",
          unit_price: "0.93",
          line_total: "930.00",
          hs_code: "731210810080",
        },
      ],
    },
  },
  {
    id: "pgp-2600246",
    label: "PGP 26/00246 → Serbia",
    fileName: "26-00246.pdf",
    inline: {
      invoice_number: "26/00246",
      invoice_date: "2026-02-05",
      exporter: "PGP INDE, d.o.o., Tržič, Slovenija",
      consignee: "GEPARD, Produzeče za proizvodnju sportske i namenske obuće\nNovi Sad\nSerbia",
      country: "Serbia",
      country_code: "RS",
      incoterms: "EXW place: Tržič",
      currency: "EUR",
      total_value: "4932.93",
      ocr_text: `
Invoice No.: 26/00246
PGP INDE, d.o.o., Tržič
GEPARD, Novi Sad, Serbia
PACKING: 35 CARTONS (1 PALLETE)
BTTO: 538 KG
NTTO: 500 KG
EXW place: Tržič
Total: 4.932,93 EUR
`,
      packing_info: "PACKING: 35 CARTONS (1 PALLETE)\nBTTO: 538 KG\nNTTO: 500 KG",
      origin_declaration_text: `The exporter of products covered by this document
(customs authorisation No SI/239/10)
declares that, except where otherwise clearly indicated,
these products are of EU preferential origin`,
      items: [
        {
          description: "Footwear",
          hs_code: "64062010",
          quantity: "100",
          unit_price: "49.3293",
          line_total: "4932.93",
          country_of_origin: "SI",
        },
      ],
    },
  },
  {
    id: "as2026-1069",
    label: "Apecs AS2026-1069 → Serbia",
    fileName: "AS2026-1069.pdf",
    inline: {
      ocr_text: `Buyer:
Z.T.R. "Braca Maric"
Apecs.S d.o.o.
Grška ulica 13, 1000 Ljubljana
VAT number: SI49796712
Invoice Number: AS2026-1069
Recipient:
Dragiše Mišovića 169, 32000 Čačak
Srbija
Date: 21.05.2026
Total invoice amount: 21,790.30 EUR
Amount to be paid: 21,790.30 EUR
Pos Description Barcode Quantity MU Price Amount
1 Industrial valve 88001234 50 pcs 120.00 6000.00
2 Steel flange 88005678 100 pcs 85.50 8550.00
3 Gasket set 88009901 24 pcs 31.68 760.30
`,
      items: [],
      incoterms: "DAP",
      shipment_summary: {
        package_count: 1,
        gross_weight_total: 10,
        gross_weight_unit: "kg",
        net_weight_total: null,
        net_weight_unit: null,
        package_type: "COLLI",
        pallet_dimensions: null,
        pallet_count: null,
      },
    },
    notes: "English OCR recovery — parser mapping failure regression",
  },
  {
    id: "henn-001",
    label: "HENN AT/920/038 → Serbia",
    fileName: "henn.pdf",
    inline: {
      invoice_number: "HENN-001",
      exporter: "HENN GmbH",
      consignee: "Buyer RS",
      country: "Serbia",
      country_code: "RS",
      incoterms: "DAP",
      currency: "EUR",
      total_value_numeric: 12000,
      origin_declaration_text:
        "The exporter of the products covered by this document (customs authorization No. AT/920/038) declares that, except where otherwise clearly indicated, these products are of preferential origin.",
      authorised_exporter_number: "AT/920/038",
      items: [
        {
          position_number: 1,
          description: "Part A",
          quantity: 1,
          line_total: 6000,
          country_of_origin: "AT",
          hs_code: "84818073",
        },
        {
          position_number: 2,
          description: "Part B",
          quantity: 1,
          line_total: 6000,
          country_of_origin: "AT",
          hs_code: "84819000",
        },
      ],
      shipment_summary: {
        package_count: 1,
        gross_weight_total: 100,
        gross_weight_unit: "kg",
        net_weight_total: 90,
        net_weight_unit: "kg",
        package_type: "COLLI",
        pallet_dimensions: null,
        pallet_count: null,
      },
    },
  },
  {
    id: "hafele-hf001",
    label: "Häfele position-specific origin → BA",
    fileName: "HF-001.pdf",
    inline: {
      invoice_number: "HF-001",
      exporter: "Häfele",
      consignee: "Buyer BA",
      country: "Bosnia and Herzegovina",
      country_code: "BA",
      currency: "EUR",
      total_value_numeric: 5000,
      incoterms: "DAP",
      vat_article: "Positions 5, 6, 8, 11, 12 and 16 are of preferential origin.",
      items: Array.from({ length: 17 }, (_, i) => ({
        position_number: i + 1,
        description: `Item ${i + 1}`,
        quantity: 1,
        line_total: 100,
        country_of_origin: i + 1 <= 8 ? "DE" : "CN",
        hs_code: "83024200",
      })),
      shipment_summary: {
        package_count: 2,
        gross_weight_total: 120,
        gross_weight_unit: "kg",
        net_weight_total: 100,
        net_weight_unit: "kg",
        package_type: "COLLI",
        pallet_dimensions: null,
        pallet_count: null,
      },
    },
    allowedAnomalies: ["ORIGIN_DECLARATION_CONTRADICTION"],
    notes: "Only positions 5,6,8,11,12,16 preferential YES",
  },
  {
    id: "klintek-weight",
    label: "Klintek unit-weight misuse",
    fileName: "klintek.pdf",
    inline: {
      ocr_text: "Gross Weight: 1574 kg",
      items: [
        {
          position_number: 1,
          description: "A",
          quantity: 40,
          line_total: 100,
          net_weight: 200,
          country_of_origin: "DE",
          hs_code: "84818073",
        },
        {
          position_number: 2,
          description: "B",
          quantity: 30,
          line_total: 100,
          net_weight: 300,
          country_of_origin: "DE",
          hs_code: "84819000",
        },
      ],
      exporter: "Klintek GmbH",
      consignee: "Buyer RS",
      country: "Serbia",
      country_code: "RS",
      incoterms: "DAP",
      currency: "EUR",
      total_value_numeric: 5000,
      invoice_number: "KLINTEK-001",
      shipment_summary: {
        package_count: 10,
        gross_weight_total: 1574,
        gross_weight_unit: "kg",
        gross_weight_source: "DOCUMENT",
        net_weight_total: 11060,
        net_weight_unit: "kg",
        net_weight_source: "CALCULATED",
        package_type: "PALLET",
        pallet_dimensions: null,
        pallet_count: 5,
      },
    },
    allowedAnomalies: ["PHYSICAL_WEIGHT_CONTRADICTION"],
    notes: "Gross 1574 authoritative; stale net 11060 cleared",
  },
  {
    id: "reni-26-381-000014",
    label: "RENI 26-381-000014 → Serbia",
    fileName: "reni.pdf",
    inline: {
      invoice_number: "26-381-000014",
      exporter: "RENI d.o.o.",
      consignee: "Buyer GmbH",
      country: "Serbia",
      country_code: "RS",
      incoterms: "DAP",
      currency: "EUR",
      total_value_numeric: 12372.78,
      vat_article: "EUR.1 enclosed except positions 3 and 8",
      shipment_summary: {
        package_count: 1,
        package_type: "COLLI",
        gross_weight_total: 120,
        gross_weight_unit: "kg",
        net_weight_total: null,
        net_weight_unit: null,
        pallet_dimensions: "80x62x62 cm",
        pallet_count: null,
      },
      items: [
        { description: "Valve A", hs_code: "84818073", quantity: 13, line_total: 1200.5, country_of_origin: "DE", net_weight: 12.5 },
        { description: "Valve B", hs_code: "84818073", quantity: 13, line_total: 1180.2, country_of_origin: "DE", net_weight: 12.486 },
        { description: "Seal A", hs_code: "84819000", quantity: 13, line_total: 890.1, country_of_origin: "DE", net_weight: 8.2 },
        { description: "Seal B", hs_code: "84819000", quantity: 13, line_total: 910.4, country_of_origin: "DE", net_weight: 8.1 },
        { description: "Bolt CN", hs_code: "73072390", quantity: 26, line_total: 2100, country_of_origin: "CN", net_weight: 18.5 },
        { description: "Bolt IT", hs_code: "73072390", quantity: 26, line_total: 2050, country_of_origin: "IT", net_weight: 18.2 },
        { description: "Bracket A", hs_code: "73269098", quantity: 13, line_total: 760, country_of_origin: "DE", net_weight: 6.1 },
        { description: "Bracket B", hs_code: "73269098", quantity: 13, line_total: 740, country_of_origin: "CN", net_weight: 6.05 },
        { description: "Rubber gasket", hs_code: "40169300", quantity: 32, line_total: 1420, country_of_origin: "DE", net_weight: 15.81 },
        { description: "Stroški izvoza", quantity: 1, line_total: 120, country_of_origin: "SI" },
      ],
    },
    allowedAnomalies: ["ORIGIN_DECLARATION_CONTRADICTION"],
    notes: "EUR.1 except positions 3 and 8 — mixed origin",
  },
  {
    id: "gomline-i26-0515",
    label: "GOMLINE I26.0515 destination regression",
    fileName: "I26.0515.pdf",
    inline: {
      invoice_number: "I26.0515",
      invoice_date: "2026-01-15",
      exporter: "gomLINE d.o.o., Cesta v Gorice 42, 1000 Ljubljana, Slovenija",
      consignee: "GOMLINE 81 d.o.o.\nJEGRIČKA 9\n21000 NOVI SAD\nSERBIA",
      country: "Slovenia",
      country_code: "SI",
      incoterms: "DAP NOVI SAD",
      currency: "EUR",
      total_value: "4771.55",
      items: [
        {
          description: "Goods line 1",
          hs_code: "38121000",
          quantity: "1",
          unit_price: "4771.55",
          line_total: "4771.55",
          country_of_origin: "",
        },
      ],
    },
    allowedAnomalies: ["DESTINATION_COUNTRY_CONTRADICTION"],
    notes: "Header SI vs consignee Serbia — destination resolution regression",
  },
  {
    id: "wizard-hs-wiz001",
    label: "Wizard HS only — no invoice HS",
    fileName: "WIZ-001.pdf",
    inline: {
      invoice_number: "WIZ-001",
      exporter: "EU Maker d.o.o.",
      consignee: "Buyer RS",
      country: "Serbia",
      country_code: "RS",
      incoterms: "DAP",
      currency: "EUR",
      total_value_numeric: 2500,
      items: [
        {
          position_number: 1,
          description: "Aluminium article",
          quantity: 1,
          line_total: 2500,
          wizard_hs_code: "76169990",
          wizard_confidence: 89,
          country_of_origin: "DE",
        },
      ],
      shipment_summary: {
        package_count: 1,
        gross_weight_total: 10,
        gross_weight_unit: "kg",
        net_weight_total: null,
        net_weight_unit: null,
        package_type: "COLLI",
        pallet_dimensions: null,
        pallet_count: null,
      },
    },
    notes: "HS Wizard GENERATED path — customs ready without invoice HS",
  },
  {
    id: "complete-no-coo",
    label: "Complete invoice without COO",
    fileName: "CMP-001.pdf",
    inline: {
      invoice_number: "CMP-001",
      exporter: "Exporter GmbH",
      consignee: "Buyer RS",
      country: "Serbia",
      country_code: "RS",
      total_value_numeric: 3200,
      incoterms: "DAP",
      currency: "EUR",
      items: [
        { position_number: 1, description: "Part", quantity: 2, line_total: 1600, hs_code: "84818073" },
        { position_number: 2, description: "Part B", quantity: 1, line_total: 1600, hs_code: "84819000" },
      ],
      shipment_summary: {
        package_count: 1,
        gross_weight_total: 120,
        gross_weight_unit: "kg",
        net_weight_total: null,
        net_weight_unit: null,
        package_type: "COLLI",
        pallet_dimensions: null,
        pallet_count: null,
      },
    },
    notes: "Completeness calibration — missing COO should not collapse score",
  },
  {
    id: "gw-001",
    label: "Golden workflow complete invoice → Serbia",
    fileName: "gw-001.pdf",
    inline: {
      invoice_number: "GW-001",
      exporter: "EU Maker d.o.o.",
      consignee: "Buyer RS",
      country: "Serbia",
      country_code: "RS",
      incoterms: "DAP",
      currency: "EUR",
      total_value: "2500.00",
      vat_article: "VAT exempt export under Article 146 Directive 2006/112/EC",
      items: [
        {
          position_number: 1,
          description: "Part",
          quantity: 1,
          line_total: "2500.00",
          hs_code: "84818073",
          country_of_origin: "DE",
          net_weight: 5,
        },
      ],
      shipment_summary: {
        package_count: 1,
        gross_weight_total: 10,
        gross_weight_unit: "kg",
        net_weight_total: 8,
        net_weight_unit: "kg",
        package_type: "COLLI",
        pallet_dimensions: null,
        pallet_count: null,
      },
    },
    notes: "Reference CUSTOMS_READY + declaration ready invoice",
  },
  {
    id: "mix-001",
    label: "Mixed EU/CN origin without declaration",
    fileName: "mixed-origin.pdf",
    inline: {
      invoice_number: "MIX-001",
      exporter: "EU Supplier GmbH",
      consignee: "Importer d.o.o.",
      country: "Serbia",
      country_code: "RS",
      incoterms: "DAP",
      currency: "EUR",
      total_value: "2500.00",
      items: [
        {
          position_number: 1,
          description: "EU component",
          quantity: 10,
          line_total: "1500.00",
          hs_code: "84713000",
          country_of_origin: "DE",
        },
        {
          position_number: 2,
          description: "CN component",
          quantity: 5,
          line_total: "1000.00",
          hs_code: "84713000",
          country_of_origin: "CN",
        },
      ],
      shipment_summary: {
        package_count: 2,
        package_type: "COLLI",
        gross_weight_total: 120,
        gross_weight_unit: "kg",
        net_weight_total: null,
        net_weight_unit: null,
        pallet_dimensions: null,
        pallet_count: null,
      },
    },
  },
  {
    id: "pro-2026-01",
    label: "Proforma with VAT exemption wording",
    fileName: "proforma.pdf",
    inline: {
      invoice_number: "PRO-2026-01",
      exporter: "Exporter d.o.o.",
      consignee: "Buyer BA",
      country: "Bosnia and Herzegovina",
      country_code: "BA",
      incoterms: "DAP",
      currency: "EUR",
      total_value: "890.00",
      vat_article: "Proforma invoice — not subject to VAT",
      items: [
        {
          position_number: 1,
          description: "Sample goods",
          quantity: 1,
          line_total: "890.00",
          hs_code: "39269097",
          country_of_origin: "SI",
        },
      ],
      shipment_summary: {
        package_count: 1,
        gross_weight_total: 5,
        gross_weight_unit: "kg",
        net_weight_total: 4,
        net_weight_unit: "kg",
        package_type: "COLLI",
        pallet_dimensions: null,
        pallet_count: null,
      },
    },
  },
  {
    id: "hs-verified-73072980",
    label: "HS verified — invoice matches wizard",
    fileName: "hs-verified.pdf",
    inline: {
      invoice_number: "HS-VERIFIED",
      exporter: "EU Maker d.o.o.",
      consignee: "Buyer RS",
      country: "Serbia",
      country_code: "RS",
      incoterms: "DAP",
      currency: "EUR",
      total_value: "2500.00",
      items: [
        {
          position_number: 1,
          description: "Steel tube",
          quantity: 1,
          line_total: "2500.00",
          hs_code: "73072980",
          wizard_hs_code: "73072980",
          wizard_confidence: 92,
          country_of_origin: "DE",
          net_weight: 5,
        },
      ],
      shipment_summary: {
        package_count: 1,
        gross_weight_total: 10,
        gross_weight_unit: "kg",
        net_weight_total: 8,
        net_weight_unit: "kg",
        package_type: "COLLI",
        pallet_dimensions: null,
        pallet_count: null,
      },
    },
  },
  {
    id: "hs-discrepancy-94",
    label: "HS discrepancy high confidence → CUSTOMS_REVIEW",
    fileName: "hs-discrepancy.pdf",
    inline: {
      invoice_number: "HS-DISC",
      exporter: "EU Maker d.o.o.",
      consignee: "Buyer RS",
      country: "Serbia",
      country_code: "RS",
      incoterms: "DAP",
      currency: "EUR",
      total_value: "2500.00",
      items: [
        {
          position_number: 1,
          description: "Plastic part",
          quantity: 1,
          line_total: "2500.00",
          hs_code: "39269097",
          wizard_hs_code: "84818081",
          wizard_confidence: 94,
          country_of_origin: "DE",
          net_weight: 5,
        },
      ],
      shipment_summary: {
        package_count: 1,
        gross_weight_total: 10,
        gross_weight_unit: "kg",
        net_weight_total: 8,
        net_weight_unit: "kg",
        package_type: "COLLI",
        pallet_dimensions: null,
        pallet_count: null,
      },
    },
    allowedAnomalies: ["HS_CLASSIFICATION_DISCREPANCY"],
    notes: "High-confidence HS mismatch — expect CUSTOMS_REVIEW",
  },
  {
    id: "low-value-declared",
    label: "Low value PEM declaration ≤ €6000",
    fileName: "low-value.pdf",
    inline: {
      invoice_number: "LOW-6000",
      exporter: "SI Exporter d.o.o.",
      consignee: "RS Buyer",
      country: "Serbia",
      country_code: "RS",
      incoterms: "DAP",
      currency: "EUR",
      total_value_numeric: 4500,
      origin_declaration_text:
        "The exporter of the products covered by this document declares that these products are of preferential origin.",
      items: [
        {
          position_number: 1,
          description: "Goods",
          quantity: 1,
          line_total: 4500,
          hs_code: "84818073",
          country_of_origin: "SI",
        },
      ],
      shipment_summary: {
        package_count: 1,
        gross_weight_total: 20,
        gross_weight_unit: "kg",
        net_weight_total: 18,
        net_weight_unit: "kg",
        package_type: "COLLI",
        pallet_dimensions: null,
        pallet_count: null,
      },
    },
  },
  {
    id: "high-value-unverified",
    label: "High value declaration without auth → UNVERIFIED",
    fileName: "high-value.pdf",
    inline: {
      invoice_number: "HIGH-6000",
      exporter: "SI Exporter d.o.o.",
      consignee: "RS Buyer",
      country: "Serbia",
      country_code: "RS",
      incoterms: "DAP",
      currency: "EUR",
      total_value_numeric: 12000,
      origin_declaration_text:
        "The exporter of the products covered by this document declares that these products are of preferential origin.",
      items: [
        {
          position_number: 1,
          description: "Goods",
          quantity: 1,
          line_total: 12000,
          hs_code: "84818073",
          country_of_origin: "SI",
        },
      ],
      shipment_summary: {
        package_count: 1,
        gross_weight_total: 50,
        gross_weight_unit: "kg",
        net_weight_total: 45,
        net_weight_unit: "kg",
        package_type: "COLLI",
        pallet_dimensions: null,
        pallet_count: null,
      },
    },
  },
  {
    id: "weight-hierarchy-ref",
    label: "Weight hierarchy — document net authoritative",
    fileName: "weight-ref.pdf",
    inline: {
      invoice_number: "WT-REF",
      exporter: "Weigh GmbH",
      consignee: "Buyer RS",
      country: "Serbia",
      country_code: "RS",
      incoterms: "DAP",
      currency: "EUR",
      total_value_numeric: 1000,
      items: [
        { position_number: 1, description: "A", quantity: 1, line_total: 1000, hs_code: "84818073", net_weight: 80, country_of_origin: "DE" },
      ],
      shipment_summary: {
        package_count: 1,
        gross_weight_total: 120,
        gross_weight_unit: "kg",
        net_weight_total: 100,
        net_weight_unit: "kg",
        net_weight_source: "DOCUMENT",
        package_type: "COLLI",
        pallet_dimensions: null,
        pallet_count: null,
      },
    },
  },
];
