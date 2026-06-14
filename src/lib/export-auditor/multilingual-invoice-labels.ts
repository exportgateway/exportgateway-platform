/**
 * Multilingual invoice field label dictionary — all supported export invoice languages.
 * Used to build regex alternations for shipment, consignee, and origin extraction.
 */

export const SUPPORTED_INVOICE_LANGUAGE_GROUPS = [
  "Slovenian",
  "Croatian",
  "Serbian",
  "Bosnian",
  "English",
  "German",
  "Italian",
  "French",
  "Spanish",
  "Romanian",
  "Czech",
  "Slovak",
  "Polish",
  "Hungarian",
] as const;

export type InvoiceFieldLabelGroup =
  | "grossWeight"
  | "netWeight"
  | "packages"
  | "pallets"
  | "consigneeSection"
  | "deliverySection"
  | "originCountry"
  | "preferentialOrigin";

export const MULTILINGUAL_FIELD_LABELS: Record<InvoiceFieldLabelGroup, readonly string[]> = {
  grossWeight: [
    "Gross Weight",
    "Brutto Weight",
    "Bruttogewicht",
    "Peso Lordo",
    "Masa Bruto",
    "Bruto Teža",
    "Bruto Teza",
    "Bruto Masa",
    "Bruto teža",
    "Bruto teza",
    "Brutto",
    "Bruto",
    "BTTO",
    "Greutate Brută",
    "Greutate bruta",
    "Greut. bruta",
    "Waga Brutto",
    "Hrubá hmotnost",
    "Hmotnost hrubá",
    "Hrubá váha",
    "Bruttó súly",
    "Bruttó tömeg",
    "Poids Brut",
    "Peso bruto",
  ],
  netWeight: [
    "Net Weight",
    "Nett Weight",
    "Nettogewicht",
    "Peso Netto",
    "Neto Teža",
    "Neto teža",
    "Netto",
    "Neto",
    "NTTO",
    "Greutate Netă",
    "Greutate neta",
    "Greut. neta",
    "Waga Netto",
    "Čistá hmotnost",
    "Hmotnost čistá",
    "Čistá váha",
    "Nettó súly",
    "Nettó tömeg",
    "Poids Net",
    "Peso neto",
  ],
  packages: [
    "Packages",
    "Package Count",
    "Packages Qty",
    "Colli",
    "Collis",
    "Koli",
    "Kosov",
    "Paketi",
    "Stück",
    "Stuck",
    "Stk",
    "Nr de colete",
    "Nr. colete",
    "Počet balení",
    "Počet balíkov",
    "Počet kusov",
    "Liczba opakowań",
    "Csomagok száma",
    "Nombre de colis",
    "Número de bultos",
    "Numero colli",
    "Anzahl Packstücke",
    "Anzahl Pakete",
    "Skupaj število",
    "Število koli",
    "Number of packages",
  ],
  pallets: [
    "Pallets",
    "Pallet",
    "Palete",
    "Paleta",
    "Palets",
    "Paletten",
    "Pallete",
    "Nr. paleti",
    "Počet paliet",
    "Liczba palet",
  ],
  consigneeSection: [
    "Consignee",
    "Receiver",
    "Customer",
    "Customer Address",
    "Invoice Address",
    "Billing Address",
    "Bill To",
    "Buyer",
    "Recipient",
    "Importer",
    "Prejemnik",
    "Kupac",
    "Kupec",
    "Destinatar",
    "Primatelj",
    "Primalac",
    "Empfänger",
    "Destinatario",
    "Destinataire",
    "Cliente",
    "Client",
    "Odbiorca",
    "Adresat",
    "Adresát",
    "Címzett",
    "Odberateľ",
  ],
  deliverySection: [
    "Delivery Address",
    "Ship To",
    "Deliver To",
    "Shipping Address",
    "Naslov za dostavo",
    "Adresa dostave",
    "Adresa isporuke",
    "Lieferadresse",
    "Indirizzo di consegna",
    "Adresse de livraison",
    "Dirección de entrega",
    "Adresa de livrare",
    "Dodací adresa",
    "Dodacia adresa",
    "Adres dostawy",
    "Szállítási cím",
  ],
  originCountry: [
    "Country of Origin",
    "Origin",
    "COO",
    "Država izvora",
    "Zemlja porijekla",
    "Zemlja porekla",
    "Ursprungsland",
    "Paese di origine",
    "Pays d'origine",
    "País de origen",
    "Țara de origine",
    "Tara de origine",
    "Země původu",
    "Krajina pôvodu",
    "Kraj pochodzenia",
    "Származási ország",
  ],
  preferentialOrigin: [
    "Preferential Origin",
    "EU Preferential Origin",
    "Preferential origin",
    "Preferenčno poreklo",
    "Preferencijalno porijeklo",
    "Préférence tarifaire",
    "Ursprungserklärung",
    "EUR.1",
    "EUR1",
    "Long-term supplier declaration",
    "Izjava o preferencialnem poreklu",
    "Deklaracija o poreklu",
    "Declarație de origine",
    "Erklärung zum Ursprung",
  ],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build case-insensitive alternation regex source from label list. */
export function buildLabelAlternation(labels: readonly string[]): string {
  return labels
    .map((label) => escapeRegExp(label.trim()))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .join("|");
}

/** Regex matching any label in the group. Avoid \\b — it breaks on accented letters (e.g. Počet, Čistá). */
export function buildLabelGroupPattern(group: InvoiceFieldLabelGroup): RegExp {
  const alternation = buildLabelAlternation(MULTILINGUAL_FIELD_LABELS[group]);
  return new RegExp(`(?:${alternation})(?=\\s*:|[\\s\\n]|$)`, "i");
}

/** Section header: label followed by optional colon/dash. */
export function buildSectionHeaderPattern(group: InvoiceFieldLabelGroup): RegExp {
  const alternation = buildLabelAlternation(MULTILINGUAL_FIELD_LABELS[group]);
  return new RegExp(`(?:${alternation})\\s*(?:\\/\\s*\\w+)?\\s*[:\-]?\\s*`, "i");
}

export const CONSIGNEE_SECTION_LABELS = buildSectionHeaderPattern("consigneeSection");
export const DELIVERY_SECTION_LABELS = buildSectionHeaderPattern("deliverySection");
