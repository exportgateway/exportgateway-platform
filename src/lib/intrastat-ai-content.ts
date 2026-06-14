export const intrastatAiFaq = [
  {
    question: "What is Intrastat AI Auditor?",
    answer:
      "Intrastat AI Auditor is an upcoming ExportGateway module that uploads commercial invoices and ERP exports, extracts product and value data via OCR, validates Intrastat reporting requirements, suggests tariff codes, and prepares reporting files for statistical submission.",
  },
  {
    question: "How does AI automate Intrastat reporting?",
    answer:
      "Instead of manually re-keying invoice lines into Intrastat templates, the module uses OCR to capture line items, AI to classify products against CN/HS nomenclature, and a validation engine to flag missing mandatory fields before you generate XML or spreadsheet outputs.",
  },
  {
    question: "Will transport cost allocation be included?",
    answer:
      "Yes. Intrastat AI Auditor will include transport cost allocation — splitting freight between domestic and foreign portions of EU routes — integrated with the same invoice workflow rather than as a separate manual step.",
  },
  {
    question: "When will Intrastat AI Auditor be available?",
    answer:
      "The module is in active development. Join early access to receive launch updates and pilot access when the first release is ready.",
  },
  {
    question: "Is Intrastat AI Auditor included in Enterprise plans?",
    answer:
      "Intrastat AI Auditor is marked as Enterprise-ready on our pricing page. Full plan entitlements will be confirmed at launch — join early access for details.",
  },
];

export const intrastatAiFeatures = [
  {
    title: "OCR extraction",
    description:
      "Upload PDF invoices and ERP exports. AI extracts line items, values, weights, and product descriptions automatically.",
  },
  {
    title: "Tariff classification",
    description:
      "AI suggests CN/HS codes aligned with Intrastat nomenclature, with confidence scoring and review flags.",
  },
  {
    title: "Transport allocation",
    description:
      "Allocate freight costs across countries for accurate statistical value reporting on cross-border EU shipments.",
  },
  {
    title: "Intrastat report generation",
    description:
      "Prepare validated reporting files — including XML generation and ERP import formats — ready for submission workflows.",
  },
];

export const intrastatAiWorkflow = [
  "Upload invoices",
  "OCR extraction",
  "Tariff validation",
  "Missing data detection",
  "Transport cost allocation",
  "Intrastat report generation",
];
