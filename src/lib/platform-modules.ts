export type ModuleStatus = "live" | "beta" | "in-development" | "coming-soon";

export type PillarId = "customs" | "freight" | "documents" | "ai";

export interface PlatformModule {
  id: string;
  name: string;
  pillar: PillarId;
  status: ModuleStatus;
  description: string;
  limitation?: string;
  href?: string;
}

export const pillarMeta: Record<
  PillarId,
  { title: string; tagline: string; description: string; icon: string; gradient: string; accent: string }
> = {
  customs: {
    title: "Customs Intelligence",
    tagline: "Classify with confidence. Prove with history.",
    description:
      "AI-powered CN and HS classification backed by EU nomenclature, a 40-family product taxonomy, and proprietary AES historical customs declaration evidence.",
    icon: "Shield",
    gradient: "from-blue-600 to-indigo-600",
    accent: "blue",
  },
  freight: {
    title: "Freight Intelligence",
    tagline: "Price lanes with data, not guesswork.",
    description:
      "EU road freight intelligence from historical lane pricing, corridor fuel modelling, Mapbox routing, and machine learning — unified in one platform.",
    icon: "Truck",
    gradient: "from-blue-500 to-cyan-500",
    accent: "cyan",
  },
  documents: {
    title: "Document Intelligence",
    tagline: "From checklist to compliant documents.",
    description:
      "Route-aware export document requirements, compliance PDF reports, and — at launch — generated commercial invoices and packing lists.",
    icon: "FileText",
    gradient: "from-emerald-500 to-teal-500",
    accent: "emerald",
  },
  ai: {
    title: "AI Trade Assistant",
    tagline: "AI that understands trade — not a generic chatbot.",
    description:
      "Structured product understanding in 13+ EU languages today. Conversational customs, freight, and trade guidance on the platform roadmap.",
    icon: "Bot",
    gradient: "from-violet-500 to-purple-500",
    accent: "violet",
  },
};

export const platformModules: PlatformModule[] = [
  // Customs Intelligence
  {
    id: "cn-classification",
    name: "CN Classification",
    pillar: "customs",
    status: "live",
    description: "EU CN8 nomenclature search with confidence scoring and disambiguation.",
    href: "https://export-compliance-wizard.onrender.com",
  },
  {
    id: "hs-classification",
    name: "HS Classification",
    pillar: "customs",
    status: "live",
    description: "Harmonized System codes derived from the same classification engine as CN.",
  },
  {
    id: "historical-evidence",
    name: "Historical Customs Evidence",
    pillar: "customs",
    status: "live",
    description: "80,000+ AES export and import declarations inform CN candidate ranking.",
  },
  {
    id: "compliance-guidance",
    name: "Compliance Guidance",
    pillar: "customs",
    status: "beta",
    description: "Route, incoterm, and mode-based document and regulatory guidance.",
    limitation: "General requirements only — verify with your customs broker for specific goods.",
  },
  {
    id: "taric-assistance",
    name: "TARIC Assistance",
    pillar: "customs",
    status: "in-development",
    description: "Live TARIC duty rates, measures, and preferential origin rules.",
    limitation: "Currently uses illustrative sample duty data in the Compliance Wizard.",
  },
  // Freight Intelligence — all Beta until public deployment
  {
    id: "historical-freight",
    name: "Historical Freight Pricing",
    pillar: "freight",
    status: "beta",
    description: "200+ EU road lane records from real shipment history.",
    limitation: "Beta — not yet publicly deployed. SI-centric lane coverage expanding.",
  },
  {
    id: "lane-intelligence",
    name: "Lane Intelligence",
    pillar: "freight",
    status: "beta",
    description: "Similarity matching across distance, weight, pallets, and loading meters.",
    limitation: "Beta — limited to documented EU corridors until public launch.",
  },
  {
    id: "route-cost",
    name: "Route Cost Estimation",
    pillar: "freight",
    status: "beta",
    description: "Mapbox driving routes with haversine fallback for distance calculation.",
    limitation: "Beta — Compliance Wizard transport step uses sample logic until integration.",
  },
  {
    id: "fuel-toll",
    name: "Fuel / Toll Modelling",
    pillar: "freight",
    status: "beta",
    description: "Corridor fuel price adjustment for dynamic FTL rate calculation.",
    limitation: "Beta — fuel data for SI, DE, AT, IT, HR, HU corridors.",
  },
  {
    id: "freight-calculator",
    name: "Freight Calculator",
    pillar: "freight",
    status: "beta",
    description: "FTL and LTL price estimation with commercial markup tiers.",
    limitation: "Beta — API available internally; public deployment pending.",
  },
  {
    id: "ai-price-rec",
    name: "AI Price Recommendations",
    pillar: "freight",
    status: "beta",
    description: "XGBoost ML model blended with historical CSV matches for LTL pricing.",
    limitation: "Beta — ML recommendations, not conversational AI guidance.",
  },
  // Document Intelligence
  {
    id: "export-documents",
    name: "Export Documents",
    pillar: "documents",
    status: "beta",
    description: "Required and optional document checklist by route and incoterm.",
    limitation: "Checklist only — document generation templates in development.",
  },
  {
    id: "compliance-reports",
    name: "Compliance Reports",
    pillar: "documents",
    status: "live",
    description: "Branded PDF compliance summary with classification, duties, VAT, and transport.",
    href: "https://export-compliance-wizard.onrender.com",
  },
  {
    id: "pdf-generation",
    name: "PDF Generation",
    pillar: "documents",
    status: "live",
    description: "Download compliance reports directly from the Compliance Wizard.",
    href: "https://export-compliance-wizard.onrender.com",
  },
  {
    id: "commercial-invoices",
    name: "Commercial Invoices",
    pillar: "documents",
    status: "coming-soon",
    description: "Auto-filled commercial invoice templates from classified shipment data.",
  },
  {
    id: "packing-lists",
    name: "Packing Lists",
    pillar: "documents",
    status: "coming-soon",
    description: "Structured packing list generation aligned with export standards.",
  },
  // AI Trade Assistant
  {
    id: "product-understanding",
    name: "Product Understanding",
    pillar: "ai",
    status: "live",
    description: "OpenAI structured extraction — language, material, gender, product family.",
  },
  {
    id: "customs-guidance",
    name: "Customs Guidance",
    pillar: "ai",
    status: "beta",
    description: "Taxonomy auto-answer and interactive disambiguation questions.",
    limitation: "Structured guidance — not yet a conversational assistant.",
  },
  {
    id: "invoice-analysis",
    name: "Invoice Analysis",
    pillar: "ai",
    status: "in-development",
    description: "Upload commercial invoices for AI line-item extraction and classification.",
    limitation: "Invoice phrase matching exists in engine; OCR upload pipeline in development.",
  },
  {
    id: "trade-guidance",
    name: "Trade Guidance",
    pillar: "ai",
    status: "in-development",
    description: "Natural language answers to trade regulation and workflow questions.",
  },
  {
    id: "freight-guidance",
    name: "Freight Guidance",
    pillar: "ai",
    status: "coming-soon",
    description: "Conversational freight recommendations integrated with Freight Intelligence.",
  },
];

export const modulesByPillar = (pillar: PillarId) =>
  platformModules.filter((m) => m.pillar === pillar);

export const verifiedMetrics = [
  { value: "62,000+", label: "Export declarations", detail: "Analysed for CN ranking" },
  { value: "17,000+", label: "Import records", detail: "Indexed customs evidence" },
  { value: "7,800+", label: "Freight shipments", detail: "Historical lane intelligence" },
  { value: "11", label: "EU countries", detail: "Freight corridor coverage" },
  { value: "13+", label: "EU languages", detail: "Multilingual product understanding" },
  { value: "40+", label: "Product taxonomy families", detail: "Classification rules" },
];

export const whyExportGateway = [
  {
    title: "Classification with proof",
    description:
      "Unlike tariff lookup tools, ExportGateway injects 62,000+ export declarations and 17,000+ import records into CN ranking — backed by historical evidence, not just text matching.",
    icon: "Shield",
  },
  {
    title: "One trade operating system",
    description:
      "Customs, freight, documents, and AI share the same product understanding and shipment context — replacing fragmented spreadsheets and point tools.",
    icon: "Globe",
  },
  {
    title: "Built for EU exporters",
    description:
      "EU CN8 nomenclature, standard VAT rates, intra-EU route logic, and multilingual input optimised for Slovenian, German, Croatian, and Central European trade.",
    icon: "Package",
  },
  {
    title: "Honest by design",
    description:
      "Every module is status-labelled. Beta and in-development features show their limitations — because trust matters more than hype in customs compliance.",
    icon: "Lock",
  },
];

export const workflowSteps = [
  { step: 1, pillar: "ai" as PillarId, title: "Describe your product", status: "live" as ModuleStatus, description: "Enter a product description in any supported EU language." },
  { step: 2, pillar: "ai" as PillarId, title: "AI identifies the product", status: "live" as ModuleStatus, description: "OpenAI extracts material, type, gender, and taxonomy families." },
  { step: 3, pillar: "customs" as PillarId, title: "CN / HS codes suggested", status: "live" as ModuleStatus, description: "Ranked suggestions with confidence scores and AES historical evidence." },
  { step: 4, pillar: "customs" as PillarId, title: "TARIC & compliance guidance", status: "in-development" as ModuleStatus, description: "Duty estimates and regulatory guidance for your route." },
  { step: 5, pillar: "freight" as PillarId, title: "Freight cost calculated", status: "beta" as ModuleStatus, description: "EU road pricing from historical lanes and ML models." },
  { step: 6, pillar: "documents" as PillarId, title: "Documents prepared", status: "beta" as ModuleStatus, description: "Checklist today; generated invoices and packing lists at launch." },
  { step: 7, pillar: "documents" as PillarId, title: "Export your shipment", status: "live" as ModuleStatus, description: "Download compliance PDF or request expert assistance." },
];

export type RoadmapCategory = "available-today" | "in-development" | "planned";

export interface RoadmapItem {
  name: string;
  pillar: PillarId;
  description: string;
}

export const roadmap: Record<RoadmapCategory, { label: string; description: string; items: RoadmapItem[] }> = {
  "available-today": {
    label: "Available Today",
    description: "Live modules you can use now via the Compliance Wizard and platform APIs.",
    items: [
      { name: "Compliance Wizard", pillar: "customs", description: "4-step export compliance estimation workflow" },
      { name: "CN / HS Classification", pillar: "customs", description: "AI-assisted EU nomenclature search" },
      { name: "Historical Customs Evidence", pillar: "customs", description: "AES declaration-backed CN ranking" },
      { name: "Product Understanding", pillar: "ai", description: "Multilingual OpenAI structured extraction" },
      { name: "Compliance PDF Reports", pillar: "documents", description: "Downloadable export compliance summary" },
      { name: "VAT Calculator", pillar: "customs", description: "EU standard VAT rate estimates" },
      { name: "Document Checklists", pillar: "documents", description: "Route and incoterm-based requirements" },
    ],
  },
  "in-development": {
    label: "In Development",
    description: "Active engineering — partial backend exists, public deployment pending.",
    items: [
      { name: "Live TARIC Integration", pillar: "customs", description: "Official duty rates and measures" },
      { name: "Freight Intelligence (Public)", pillar: "freight", description: "Full freight engine wired into wizard and dashboard" },
      { name: "Invoice Analysis", pillar: "ai", description: "Upload and OCR commercial invoices" },
      { name: "ExportGateway Dashboard", pillar: "customs", description: "Unified workspace with saved projects" },
      { name: "Trade Guidance Assistant", pillar: "ai", description: "Conversational customs and trade Q&A" },
      { name: "Early Access Platform", pillar: "customs", description: "User accounts and saved shipment workflows" },
    ],
  },
  planned: {
    label: "Planned",
    description: "On the platform roadmap for post-launch releases.",
    items: [
      { name: "Commercial Invoice Generation", pillar: "documents", description: "Auto-filled invoice templates" },
      { name: "Packing List Generation", pillar: "documents", description: "Structured packing list export" },
      { name: "Freight Guidance Assistant", pillar: "ai", description: "Conversational freight recommendations" },
      { name: "Enterprise API Portal", pillar: "customs", description: "API keys, documentation, and integrations" },
      { name: "Team Accounts & RBAC", pillar: "customs", description: "Multi-user organisations with role access" },
      { name: "Ocean & Air Freight Modules", pillar: "freight", description: "Multi-modal freight intelligence" },
    ],
  },
};

export const WIZARD_URL = process.env.NEXT_PUBLIC_WIZARD_URL ?? "https://export-compliance-wizard.onrender.com";
