"""Multilingual invoice field label dictionary for export invoice OCR extraction."""

from __future__ import annotations

import re
from typing import Literal

InvoiceFieldLabelGroup = Literal[
    "grossWeight",
    "netWeight",
    "packages",
    "pallets",
    "consigneeSection",
    "deliverySection",
    "originCountry",
    "preferentialOrigin",
]

MULTILINGUAL_FIELD_LABELS: dict[InvoiceFieldLabelGroup, tuple[str, ...]] = {
    "grossWeight": (
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
    ),
    "netWeight": (
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
    ),
    "packages": (
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
    ),
    "pallets": (
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
    ),
    "consigneeSection": (
        "Consignee",
        "Receiver",
        "Customer",
        "Buyer",
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
    ),
    "deliverySection": (
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
    ),
    "originCountry": (
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
    ),
    "preferentialOrigin": (
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
    ),
}


def _escape_regexp(value: str) -> str:
    return re.escape(value.strip())


def build_label_alternation(labels: tuple[str, ...]) -> str:
    return "|".join(
        sorted(
            (_escape_regexp(label) for label in labels if label.strip()),
            key=len,
            reverse=True,
        )
    )


def build_label_group_pattern(group: InvoiceFieldLabelGroup, flags: int = re.I) -> re.Pattern[str]:
    alternation = build_label_alternation(MULTILINGUAL_FIELD_LABELS[group])
    return re.compile(rf"\b(?:{alternation})\b", flags)


def build_section_header_pattern(group: InvoiceFieldLabelGroup, flags: int = re.I) -> re.Pattern[str]:
    alternation = build_label_alternation(MULTILINGUAL_FIELD_LABELS[group])
    return re.compile(rf"(?:{alternation})\s*(?:/\s*\w+)?\s*[:\-]?\s*", flags)


def build_labeled_value_pattern(group: InvoiceFieldLabelGroup, flags: int = re.I) -> re.Pattern[str]:
    alternation = build_label_alternation(MULTILINGUAL_FIELD_LABELS[group])
    return re.compile(rf"\b(?:{alternation})\b\s*:?\s*", flags)
