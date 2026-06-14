function dexxonLineBlock(position: number, description: string): string {
  return `${position} ${description}\nCommodity code: 85235110\nCOO: CN\nQty 10 150.00`;
}

const dexxonLines = [
  "USB flash drive 64GB",
  "USB flash drive 128GB",
  "Memory card SD 32GB",
  "Memory card microSD 64GB",
  "External HDD enclosure",
  "USB-C hub adapter",
  "HDMI cable 2m",
  "Power adapter 5V",
  "Bluetooth dongle",
  "Screen cleaning kit",
].map((desc, i) => dexxonLineBlock(i + 1, desc));

export const DEXXON_261000177_SOURCE = {
  invoice_number: "261000177",
  exporter: "Dexxon Data Media GmbH",
  consignee: "Import DOO Beograd",
  country_code: "RS",
  country: "Serbia",
  currency: "EUR",
  total_value_numeric: 15000,
  incoterms: "DAP",
  items: Array.from({ length: 10 }, (_, i) => ({
    position_number: i + 1,
    description: dexxonLines[i].split("\n")[0].replace(/^\d+\s+/, ""),
    quantity: 10,
    line_total: 1500,
  })),
  ocr_text: [
    "Dexxon Data Media GmbH",
    "Invoice 261000177",
    "Consignee Import DOO Beograd",
    "Destination RS",
    "Incoterms DAP",
    "",
    ...dexxonLines,
    "",
    "Total invoice amount 15 000,00 EUR",
  ].join("\n"),
};
