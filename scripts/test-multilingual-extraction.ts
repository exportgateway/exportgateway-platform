/**
 * Multilingual invoice field extraction coverage — all 14 supported language groups.
 * Run: npm run test:multilingual-extraction
 */

import {
  extractMultilingualDeliveryAddress,
  extractMultilingualOriginCountry,
  extractMultilingualShipmentMetrics,
  detectMultilingualPreferentialOrigin,
} from "../src/lib/export-auditor/multilingual-field-extractor";
import { SUPPORTED_INVOICE_LANGUAGE_GROUPS } from "../src/lib/export-auditor/multilingual-invoice-labels";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

interface LanguageFixture {
  language: (typeof SUPPORTED_INVOICE_LANGUAGE_GROUPS)[number];
  corpus: string;
  expect: {
    gross: number;
    net: number;
    packages: number;
    pallets?: number;
    consigneeCompany: string;
    originCountryCode: string;
    preferential: boolean;
  };
}

const FIXTURES: LanguageFixture[] = [
  {
    language: "Slovenian",
    corpus: `
Prejemnik:
ACME d.o.o.
Ljubljana SI-1000
Bruto teža: 1200 kg
Neto teža: 950 kg
Koli: 12
Palete: 2
Država izvora: Slovenia
Izjava o preferencialnem poreklu
`,
    expect: { gross: 1200, net: 950, packages: 12, pallets: 2, consigneeCompany: "ACME d.o.o.", originCountryCode: "SI", preferential: true },
  },
  {
    language: "Croatian",
    corpus: `
Primatelj:
Hrvatska tvrtka d.o.o.
Zagreb HR-10000
Bruto Masa: 800 kg
Neto Teža: 640 kg
Paketi: 8
Palete: 1
Zemlja porijekla: Croatia
Preferencijalno porijeklo
`,
    expect: { gross: 800, net: 640, packages: 8, pallets: 1, consigneeCompany: "Hrvatska tvrtka d.o.o.", originCountryCode: "HR", preferential: true },
  },
  {
    language: "Serbian",
    corpus: `
Primalac:
Serbian Trade d.o.o.
Beograd RS-11000
Bruto Masa: 540 kg
Neto teža: 500 kg
Kosov: 6
Paleta: 1
Zemlja porekla: Serbia
Deklaracija o poreklu
`,
    expect: { gross: 540, net: 500, packages: 6, pallets: 1, consigneeCompany: "Serbian Trade d.o.o.", originCountryCode: "RS", preferential: true },
  },
  {
    language: "Bosnian",
    corpus: `
Kupac:
Bosna Export d.o.o.
Sarajevo BA-71000
Bruto teža: 330 kg
Neto teža: 300 kg
Koli: 3
Zemlja porekla: Bosnia and Herzegovina
Preferencijalno porijeklo
`,
    expect: { gross: 330, net: 300, packages: 3, consigneeCompany: "Bosna Export d.o.o.", originCountryCode: "BA", preferential: true },
  },
  {
    language: "English",
    corpus: `
Consignee:
Global Imports Ltd
London SW1A 1AA
United Kingdom
Gross Weight: 2100 kg
Net Weight: 1980 kg
Packages: 42
Pallets: 3
Country of Origin: Germany
Preferential Origin
`,
    expect: { gross: 2100, net: 1980, packages: 42, pallets: 3, consigneeCompany: "Global Imports Ltd", originCountryCode: "DE", preferential: true },
  },
  {
    language: "German",
    corpus: `
Empfänger:
Muster GmbH
Berlin DE-10115
Bruttogewicht: 760 kg
Nettogewicht: 720 kg
Stück: 15
Paletten: 2
Ursprungsland: Germany
Ursprungserklärung
`,
    expect: { gross: 760, net: 720, packages: 15, pallets: 2, consigneeCompany: "Muster GmbH", originCountryCode: "DE", preferential: true },
  },
  {
    language: "Italian",
    corpus: `
Destinatario:
Italia SRL
Milano IT-20121
Peso Lordo: 450 kg
Peso Netto: 420 kg
Numero colli: 9
Palete: 1
Paese di origine: Italy
EUR.1
`,
    expect: { gross: 450, net: 420, packages: 9, pallets: 1, consigneeCompany: "Italia SRL", originCountryCode: "IT", preferential: true },
  },
  {
    language: "French",
    corpus: `
Destinataire:
Société France SA
Paris FR-75001
Poids Brut: 980 kg
Poids Net: 910 kg
Nombre de colis: 20
Palets: 2
Pays d'origine: France
Préférence tarifaire
`,
    expect: { gross: 980, net: 910, packages: 20, pallets: 2, consigneeCompany: "Société France SA", originCountryCode: "FR", preferential: true },
  },
  {
    language: "Spanish",
    corpus: `
Cliente:
Comercial España SL
Madrid ES-28001
Peso bruto: 670 kg
Peso neto: 630 kg
Número de bultos: 11
Palets: 1
País de origen: Spain
`,
    expect: { gross: 670, net: 630, packages: 11, pallets: 1, consigneeCompany: "Comercial España SL", originCountryCode: "ES", preferential: false },
  },
  {
    language: "Romanian",
    corpus: `
Destinatar:
RomExport SRL
București RO-010001
Greutate bruta: 890 kg
Greutate neta: 850 kg
Nr. colete: 18
Nr. paleti: 2
Țara de origine: Romania
Declarație de origine
`,
    expect: { gross: 890, net: 850, packages: 18, pallets: 2, consigneeCompany: "RomExport SRL", originCountryCode: "RO", preferential: true },
  },
  {
    language: "Czech",
    corpus: `
Adresát:
Czech Trade s.r.o.
Praha CZ-11000
Hrubá hmotnost: 410 kg
Čistá hmotnost: 390 kg
Počet balení: 7
Počet paliet: 1
Země původu: Czech Republic
`,
    expect: { gross: 410, net: 390, packages: 7, pallets: 1, consigneeCompany: "Czech Trade s.r.o.", originCountryCode: "CZ", preferential: false },
  },
  {
    language: "Slovak",
    corpus: `
Odberateľ:
Slovak Export s.r.o.
Bratislava SK-81101
Hrubá váha: 520 kg
Čistá váha: 490 kg
Počet balíkov: 10
Počet paliet: 1
Krajina pôvodu: Slovakia
`,
    expect: { gross: 520, net: 490, packages: 10, pallets: 1, consigneeCompany: "Slovak Export s.r.o.", originCountryCode: "SK", preferential: false },
  },
  {
    language: "Polish",
    corpus: `
Odbiorca:
Polska Sp. z o.o.
Warszawa PL-00-001
Waga Brutto: 600 kg
Waga Netto: 570 kg
Liczba opakowań: 14
Liczba palet: 2
Kraj pochodzenia: Poland
`,
    expect: { gross: 600, net: 570, packages: 14, pallets: 2, consigneeCompany: "Polska Sp. z o.o.", originCountryCode: "PL", preferential: false },
  },
  {
    language: "Hungarian",
    corpus: `
Címzett:
Magyar Kereskedelmi Kft
Budapest HU-1051
Bruttó súly: 710 kg
Nettó súly: 680 kg
Csomagok száma: 16
Palete: 1
Származási ország: Hungary
`,
    expect: { gross: 710, net: 680, packages: 16, pallets: 1, consigneeCompany: "Magyar Kereskedelmi Kft", originCountryCode: "HU", preferential: false },
  },
];

console.log(`Multilingual extraction — ${FIXTURES.length} language groups\n`);

for (const fixture of FIXTURES) {
  console.log(fixture.language);
  const metrics = extractMultilingualShipmentMetrics(fixture.corpus);
  const address = extractMultilingualDeliveryAddress(fixture.corpus);
  const origin = extractMultilingualOriginCountry(fixture.corpus);
  const preferential = detectMultilingualPreferentialOrigin(fixture.corpus);

  assert(metrics.gross_weight_total === fixture.expect.gross, `${fixture.language} gross weight`);
  assert(metrics.net_weight_total === fixture.expect.net, `${fixture.language} net weight`);
  assert(metrics.package_count === fixture.expect.packages, `${fixture.language} package count`);
  if (fixture.expect.pallets != null) {
    assert(metrics.pallet_count === fixture.expect.pallets, `${fixture.language} pallet count`);
  }
  assert(
    address.company?.includes(fixture.expect.consigneeCompany.split(" ")[0]) ?? false,
    `${fixture.language} consignee company`
  );
  assert(
    origin.country_code === fixture.expect.originCountryCode,
    `${fixture.language} origin country (${origin.country_code})`
  );
  assert(
    preferential === fixture.expect.preferential,
    `${fixture.language} preferential indicator`
  );
  console.log("");
}

assert(
  FIXTURES.length === SUPPORTED_INVOICE_LANGUAGE_GROUPS.length,
  `fixture count matches supported groups (${FIXTURES.length}/${SUPPORTED_INVOICE_LANGUAGE_GROUPS.length})`
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
