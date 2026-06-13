import type { ModuleStatus } from "@/lib/platform-modules";

export type PlatformToolId = "customs" | "export-auditor" | "freight" | "intrastat";

export interface PlatformTool {
  id: PlatformToolId;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  status: ModuleStatus;
  href: string;
  features: string[];
  limitations?: string[];
  icon: "Shield" | "FileSearch" | "Truck" | "Globe";
  gradient: string;
  /** Featured flagship tool on platform hub */
  featured?: boolean;
}

export const platformTools: PlatformTool[] = [
  {
    id: "export-auditor",
    name: "Export Auditor",
    shortName: "Export Auditor",
    tagline: "Upload an invoice. Get a full export compliance audit in seconds.",
    description:
      "Upload an export invoice and receive a complete export compliance audit within seconds — OCR extraction, HS/tariff detection, export readiness validation, EUR.1 preference analysis, and customs disposition generation.",
    status: "live",
    href: "/platform/export-auditor",
    icon: "FileSearch",
    gradient: "from-violet-600 to-purple-600",
    featured: true,
    features: [
      "OCR document extraction from PDF and scanned images",
      "Invoice data extraction (exporter, consignee, value, incoterms)",
      "HS / tariff code detection on line items",
      "Export readiness validation with READY / WARNING / ERROR status",
      "EUR.1 and preference origin analysis",
      "Customs disposition and audit report generation",
    ],
    limitations: [
      "Live OCR extraction and export readiness via ExportGateway API",
      "Audit outputs are indicative — verify before customs filing",
      "Supports commercial, proforma, and export invoices",
    ],
  },
  {
    id: "customs",
    name: "Export Compliance Wizard",
    shortName: "Customs Intelligence",
    tagline: "Classify with confidence. Prove with history.",
    description:
      "AI-powered CN/HS classification, document checklists, duty and VAT estimates, and compliance PDF reports — backed by EU nomenclature and 80,000+ historical customs declarations.",
    status: "live",
    href: "/platform/customs",
    icon: "Shield",
    gradient: "from-blue-600 to-indigo-600",
    features: [
      "Multilingual product understanding (13+ EU languages)",
      "CN8 suggestions with confidence scoring and disambiguation",
      "AES historical customs evidence in ranking",
      "Document checklist by route, incoterm, and transport mode",
      "Indicative duties, VAT, and landed cost estimates",
      "Downloadable compliance PDF and expert assistance request",
    ],
    limitations: [
      "Duty rates use illustrative sample data — not live TARIC",
      "Transport step uses sample logic — use Freight Calculator for ML pricing",
      "All outputs are indicative — verify before customs filing",
    ],
  },
  {
    id: "freight",
    name: "Freight Calculator",
    shortName: "Freight Intelligence",
    tagline: "Price EU road lanes with data, not guesswork.",
    description:
      "Estimate EU road freight for FTL and LTL shipments using Mapbox routing, historical lane data, corridor fuel modelling, and an XGBoost price model.",
    status: "live",
    href: "/platform/freight",
    icon: "Truck",
    gradient: "from-blue-500 to-cyan-500",
    features: [
      "FTL fuel-adjusted dynamic rates by corridor country",
      "LTL blend of historical CSV matches and ML prediction",
      "Mapbox road distance with haversine fallback",
      "Price range and confidence score",
      "Commercial markup tiers applied automatically",
    ],
    limitations: [
      "EU road freight only — not ocean or air",
      "Historical lane data is SI-centric (~200 corridors)",
      "Estimates only — not a carrier booking platform",
    ],
  },
  {
    id: "intrastat",
    name: "Intrastat Allocation",
    shortName: "Intrastat Intelligence",
    tagline: "Split freight cost by country driven.",
    description:
      "Allocate total freight cost between domestic and foreign portions of an EU road route for Intrastat reporting — powered by Mapbox routing and country sampling.",
    status: "live",
    href: "/platform/intrastat",
    icon: "Globe",
    gradient: "from-emerald-500 to-teal-500",
    features: [
      "Address-based or coordinate-based route input",
      "Mapbox driving route with country breakdown",
      "Domestic vs. foreign km and cost split",
      "Route segment data for map visualisation",
      "Supports any EU domestic country alias",
    ],
    limitations: [
      "Requires Mapbox on the backend — unavailable if token missing",
      "Country allocation uses route sampling — approximate at borders",
      "For planning and reporting support — verify with your broker",
    ],
  },
];

export function getPlatformTool(id: PlatformToolId): PlatformTool {
  const tool = platformTools.find((t) => t.id === id);
  if (!tool) throw new Error(`Unknown platform tool: ${id}`);
  return tool;
}
