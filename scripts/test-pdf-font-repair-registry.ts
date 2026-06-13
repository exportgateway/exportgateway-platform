/**
 * Validation dataset for Balkan PDF font-repair registry.
 * Run: npm run test:pdf-font-repair-registry
 */
import fs from "fs";
import {
  BALKAN_PLACE_DICTIONARY,
  corruptTextForTest,
  findControlCharacters,
  repairPdfFontText,
  SUPPLIER_ENCODING_PROFILES,
} from "../src/lib/export-auditor/pdf-font-repair-registry";
import { extractPdfText } from "../src/lib/export-auditor/pdf-text-extract";

const PDF_A0054 = "C:\\CURSOR\\export-auditor\\test_invoice_v1\\A0054-2026(1).pdf";

/** Test corruption map — one control byte per diacritic for round-trip validation. */
const TEST_BYTE_MAP: Record<number, string> = {
  0x01: "č",
  0x02: "ć",
  0x03: "đ",
  0x04: "š",
  0x05: "ž",
};

const VALIDATION_PLACES = {
  Slovenian: ["Črnomelj", "Škofja Loka", "Žalec", "Bučevci"],
  Croatian: ["Čakovec", "Križevci", "Varaždin", "Đakovo"],
  Serbian: ["Aranđelovac", "Ćuprija", "Niš", "Kruševac", "Krevački"],
  Bosnian: ["Živinice", "Široki Brijeg", "Čitluk"],
} as const;

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function assertNoControls(text: string, label: string) {
  const controls = findControlCharacters(text);
  assert(controls.length === 0, `${label}: no control characters (${controls.length} found)`);
}

async function main() {
  console.log("PDF FONT REPAIR REGISTRY — validation dataset\n");

  console.log("Dictionary round-trip (corrupt → repair)");
  for (const [region, places] of Object.entries(VALIDATION_PLACES)) {
    console.log(`\n${region}:`);
    for (const place of places) {
      const corrupted = corruptTextForTest(place, TEST_BYTE_MAP);
      assert(/[\u0001-\u0005]/.test(corrupted), `${place}: corruption applied`);

      const { text: repaired } = repairPdfFontText(`Shipping to ${corrupted}, RS`, {
        pdfSource: "test-fixture",
        supplier: "Test Supplier d.o.o.",
      });
      assertNoControls(repaired, place);
      assert(
        repaired.toLowerCase().includes(place.toLowerCase()),
        `${place}: repaired text contains expected place name (got: ${JSON.stringify(repaired)})`
      );
    }
  }

  console.log("\nSafety — clean Unicode unchanged");
  const clean = "Noršinska ulica 27, 9000 Murska Sobota, Slovenija";
  const cleanResult = repairPdfFontText(clean);
  assert(cleanResult.text === clean, "clean Unicode text unchanged");
  assert(!cleanResult.repaired, "clean text not marked repaired");

  console.log("\nRegistry structure");
  assert(SUPPLIER_ENCODING_PROFILES.length >= 2, "supplier profiles registered");
  assert(BALKAN_PLACE_DICTIONARY.length >= 15, "place dictionary populated");

  console.log("\nTRANSPAK-style encoding (A0054 pattern)");
  const transpakCorpus =
    "Transpak d.o.o.\nDELIVERY ADDRESS:\nKr\u0002eva\u0001ki put 26\n34300 Aran\u0003elovac Serbia\nBu\u0001e\u0001ovci";
  const transpak = repairPdfFontText(transpakCorpus, {
    pdfSource: "A0054-2026",
    supplier: "Transpak d.o.o.",
  });
  assertNoControls(transpak.text, "TRANSPAK corpus");
  assert(transpak.text.includes("Krevački"), "Krevački repaired");
  assert(transpak.text.includes("Aranđelovac"), "Aranđelovac repaired");
  assert(transpak.text.includes("Bučevci"), "Bučevci repaired");
  assert(transpak.diagnostics.profileId === "transpak-si", "TRANSPAK profile matched");

  console.log("\nLearning mode — unknown byte flagged");
  const unknownCorpus = "City: Test\u000fville";
  const unknown = repairPdfFontText(unknownCorpus, { pdfSource: "unknown-font.pdf" });
  assert(
    unknown.diagnostics.unknownEncodingRecords.length > 0 ||
      unknown.diagnostics.unknownControlBytes.length > 0,
    "unknown control byte recorded"
  );

  if (fs.existsSync(PDF_A0054)) {
    console.log("\nA0054/2026 live PDF");
    const buf = fs.readFileSync(PDF_A0054);
    const pdfText = await extractPdfText(buf, { pdfSource: "A0054-2026(1).pdf" });
    assertNoControls(pdfText, "A0054 PDF text");
    assert(pdfText.includes("Krevački"), "A0054 Krevački");
    assert(pdfText.includes("Aranđelovac"), "A0054 Aranđelovac");
  } else {
    console.log("\nA0054/2026 live PDF — skipped (file not found)");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
