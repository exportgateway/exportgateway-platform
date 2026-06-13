/**
 * Capture platform screenshots for marketing assets.
 *
 * Prerequisites:
 *   1. npm run dev (or set SCREENSHOT_BASE_URL)
 *   2. npm install -D playwright && npx playwright install chromium
 *
 * Usage: node scripts/capture-screenshots.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "screenshots");
const BASE_URL = process.env.SCREENSHOT_BASE_URL || "http://localhost:3000";

const captures = [
  { name: "platform-hub", url: "/platform", selector: "[data-screenshot='platform-dashboard']", wait: 1500 },
  { name: "freight-calculator", url: "/platform/freight", selector: "[data-screenshot='freight-empty']", wait: 1000 },
  { name: "intrastat-allocation", url: "/platform/intrastat", selector: "[data-screenshot='intrastat-empty']", wait: 1000 },
  { name: "customs-wizard", url: "/platform/customs", selector: "[data-screenshot='customs-wizard']", wait: 3000 },
];

async function main() {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    console.error(
      "Playwright not installed. Run: npm install -D playwright && npx playwright install chromium"
    );
    console.error("Creating placeholder screenshot directory only.");
    fs.mkdirSync(OUT_DIR, { recursive: true });
    process.exit(0);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  for (const capture of captures) {
    const outPath = path.join(OUT_DIR, `${capture.name}.png`);
    try {
      await page.goto(`${BASE_URL}${capture.url}`, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(capture.wait);
      const element = await page.$(capture.selector);
      if (element) {
        await element.screenshot({ path: outPath });
      } else {
        await page.screenshot({ path: outPath, fullPage: false });
      }
      console.log(`✅ ${capture.name} → public/screenshots/${capture.name}.png`);
    } catch (err) {
      console.error(`❌ ${capture.name}:`, err instanceof Error ? err.message : err);
    }
  }

  await browser.close();
  console.log("\nScreenshots saved to public/screenshots/");
}

main();
