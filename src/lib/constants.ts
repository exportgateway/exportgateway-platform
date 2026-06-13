import { legalEntity } from "@/lib/legal";

export const navLinks = [
  { label: "Platform", href: "/platform" },
  { label: "Pricing", href: "/pricing" },
  { label: "Roadmap", href: "/#roadmap" },
  { label: "FAQ", href: "/faq" },
  { label: "Security", href: "/security" },
];

export const footerLinks = {
  product: [
    { label: "Platform Hub", href: "/platform" },
    { label: "Export Auditor", href: "/platform/export-auditor" },
    { label: "Customs Intelligence", href: "/platform/customs" },
    { label: "Freight Calculator", href: "/platform/freight" },
    { label: "Intrastat Allocation", href: "/platform/intrastat" },
    { label: "Pricing", href: "/pricing" },
    { label: "Roadmap", href: "/#roadmap" },
  ],
  company: [
    { label: "Early Access", href: "/early-access" },
    { label: "Contact", href: "/contact" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms & Conditions", href: "/terms" },
  ],
  legal: [
    { label: "Customs Disclaimer", href: "/disclaimer" },
    { label: "Security", href: "/security" },
    { label: "Cookie Policy", href: "/cookies" },
    { label: "FAQ", href: "/faq" },
  ],
};

export const siteConfig = {
  name: "ExportGateway",
  tagline: "The Trade Operating System",
  description:
    "ExportGateway connects customs intelligence, freight pricing, export documentation, and AI trade assistance — the central platform for exporters, freight forwarders, and customs professionals.",
  url: legalEntity.platformUrl,
  email: legalEntity.email,
  supportEmail: legalEntity.supportEmail,
  wizardUrl: process.env.NEXT_PUBLIC_WIZARD_URL || "https://export-compliance-wizard.onrender.com",
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_WIZARD_URL || "https://export-compliance-wizard.onrender.com",
};

export const pricingPlans = [
  {
    id: "free",
    name: "Free",
    price: "€0",
    period: "",
    description: "Small exporters shipping 1–5 times per month.",
    features: [
      "Compliance Wizard",
      "CN / HS Classification",
      "VAT Calculator",
      "Freight Calculator",
      "Intrastat Allocation",
      "Export Auditor (basic)",
      "OCR invoice validation",
      "Missing export field detection",
      "Export readiness check",
    ],
    limits: [
      "Up to 5 OCR documents per month",
      "Up to 10 pages per document",
    ],
    cta: "Start Free",
    href: "/platform",
    highlighted: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "€49",
    period: "/month",
    description: "Regular exporters shipping weekly or daily.",
    features: [
      "Everything in Free, plus:",
      "Unlimited Compliance Wizard usage",
      "Export Auditor Pro",
      "Preference Origin Analysis",
      "EUR.1 eligibility analysis",
      "Customs Disposition Generator",
      "Rule-based validation engine",
      "Batch document processing",
      "Packing List OCR",
      "Export compliance reports",
      "Historical audit history",
      "Priority support",
    ],
    limits: [
      "Up to 300 OCR documents per month",
      "Up to 100 pages per document",
      "Rule-based engine only — no AI validation or AI customs reasoning",
    ],
    cta: "Join Early Access",
    href: "/early-access?plan=pro",
    highlighted: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "€190",
    period: "/month",
    description:
      "Designed for customs brokers, freight forwarders and high-volume export operations.",
    features: [
      "Everything in Pro, plus:",
      "AI Validation Layer",
      "AI Customs Reasoning",
      "AI Tariff Wizard",
      "AI Declaration Review",
      "Mixed-Origin Intelligence",
      "Advanced Origin Allocation",
      "Customs Risk Detection",
      "Multi-Invoice Intelligence",
      "MRN Preparation Workspace",
      "HS Code Aggregation",
      "Team Accounts",
      "API Access",
      "Dedicated support",
    ],
    limits: [
      "Up to 2,000 OCR documents per month",
      "Fair usage: 20,000 pages per month",
      "AI validation included",
      "Large multi-page invoices supported",
    ],
    cta: "Contact Sales",
    href: "/contact?plan=enterprise",
    highlighted: false,
  },
];

export const faqItems = [
  {
    question: "What is ExportGateway?",
    answer:
      "ExportGateway is a trade operating system for exporters, freight forwarders, and customs professionals. It connects AI-powered CN classification backed by historical customs declarations, EU freight pricing, Intrastat allocation, and export documentation in one platform.",
  },
  {
    question: "How does customs classification work?",
    answer:
      "You describe your product in any supported EU language. OpenAI extracts structured attributes, which feed a taxonomy and lexicon engine. The system searches EU CN8 nomenclature and injects candidates from 62,000+ indexed export declarations and 17,000+ import records, returning ranked CN suggestions with confidence scores and historical evidence.",
  },
  {
    question: "How is freight pricing calculated?",
    answer:
      "The Freight Calculator combines Mapbox road routing, fuel and toll modelling, loading meter utilisation, and historical lane intelligence from 7,849 verified shipments across 23 EU corridors. An ML model blends route distance with corridor data to produce indicative EU road freight estimates — not binding carrier quotes.",
  },
  {
    question: "Is my data secure?",
    answer:
      "We use encrypted data storage, encrypted connections, GDPR-aligned processing, access controls, and audit logging for classification runs. See our Security page for full details. ExportGateway is operated by Stilo d.o.o. in Ljubljana, Slovenia.",
  },
  {
    question: "Can I join before launch?",
    answer:
      "Yes. Join Early Access to get notified when the ExportGateway Dashboard, Pro features (€49/month), and full platform launch go live.",
  },
];

export const dashboardModules = [
  {
    id: "freight-calculator",
    title: "Freight Calculator",
    description: "Compare freight rates across EU road lanes",
    icon: "Calculator",
    href: "/dashboard/freight-calculator",
    color: "from-blue-500 to-cyan-500",
    status: "beta" as const,
  },
  {
    id: "customs-wizard",
    title: "Customs Wizard",
    description: "Classify goods and validate compliance requirements",
    icon: "Shield",
    href: "/dashboard/customs-wizard",
    color: "from-violet-500 to-purple-500",
    status: "live" as const,
  },
  {
    id: "export-documents",
    title: "Export Documents",
    description: "Create and manage export documentation",
    icon: "FileText",
    href: "/dashboard/export-documents",
    color: "from-emerald-500 to-teal-500",
    status: "beta" as const,
  },
  {
    id: "saved-projects",
    title: "Saved Projects",
    description: "Access your saved shipments and workflows",
    icon: "FolderOpen",
    href: "/dashboard/saved-projects",
    color: "from-amber-500 to-orange-500",
    status: "in-development" as const,
  },
  {
    id: "account-settings",
    title: "Account Settings",
    description: "Manage profile, billing, and team access",
    icon: "Settings",
    href: "/dashboard/account-settings",
    color: "from-slate-500 to-gray-500",
    status: "in-development" as const,
  },
];
