export const legalEntity = {
  companyName: "Stilo d.o.o.",
  address: "Tesovnikova ulica 76A",
  city: "Ljubljana",
  postalCode: "1000",
  country: "Slovenia",
  countryCode: "SI",
  registrationNumber: "8712913000",
  vatId: "SI8712913000",
  email: "info@exportgateway.eu",
  supportEmail: "support@exportgateway.eu",
  privacyEmail: "info@exportgateway.eu",
  securityEmail: "info@exportgateway.eu",
  website: "https://exportgateway.eu",
  platformUrl: "https://exportgateway.eu",
  governingLaw: "Republic of Slovenia",
  courts: "competent courts in Ljubljana, Slovenia",
} as const;

export const customsDisclaimer = {
  title: "Customs & Trade Disclaimer",
  summary:
    "All outputs from ExportGateway are indicative estimates for planning purposes only and do not constitute legal, customs, or tax advice.",
  points: [
    "CN and HS code suggestions are generated using AI-assisted search, EU Combined Nomenclature data, and historical customs declaration evidence. They must be independently verified before use in customs declarations, commercial contracts, or regulatory filings.",
    "Customs duty rates, TARIC measures, and tariff data displayed on the platform may use illustrative sample data until live TARIC integration is publicly deployed. Do not rely on duty estimates for binding commercial decisions.",
    "VAT calculations use simplified models based on EU standard VAT rates. Reduced rates, exemptions, deferment schemes, and incoterm-specific rules are not fully applied.",
    "Freight price estimates — including all Freight Intelligence modules currently in Beta — are planning indicators derived from historical lane data, fuel models, and machine learning. They are not binding carrier quotes.",
    "Document checklists and compliance guidance provide general requirements based on route, incoterm, and transport mode. Actual requirements may vary by product, destination authority, preferential trade agreements, and regulatory changes.",
    "ExportGateway is operated by Stilo d.o.o. The platform does not replace licensed customs brokers, freight forwarders, or legal counsel. Users remain solely responsible for compliance with applicable customs, export control, and trade regulations.",
    "Historical customs evidence from AES declaration databases reflects past classification practices and does not guarantee future acceptance by customs authorities.",
  ],
};
