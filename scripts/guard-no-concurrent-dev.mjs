/**
 * Block `npm run build` while `npm run dev` is active.
 *
 * Running production build during dev corrupts .next:
 * HTML references /_next/static/css/app/layout.css → 404 → unstyled pages.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DEV_WEBPACK_CACHE = path.join(ROOT, ".next", "cache", "webpack");
const DEV_PORT = Number(process.env.PORT || 3000);

async function devServerResponding() {
  try {
    const res = await fetch(`http://127.0.0.1:${DEV_PORT}/`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok || res.status === 304;
  } catch {
    return false;
  }
}

const hasDevWebpackCache = fs.existsSync(DEV_WEBPACK_CACHE);
const devLive = await devServerResponding();

if (hasDevWebpackCache || devLive) {
  console.error("\n❌ Cannot run `npm run build` while the dev server is active.\n");
  if (devLive) {
    console.error(`   Dev server is responding on http://127.0.0.1:${DEV_PORT}`);
  }
  if (hasDevWebpackCache) {
    console.error("   .next/cache/webpack exists (dev cache is present).");
  }
  console.error("\n   Stop dev first (Ctrl+C in the dev terminal), then run build.");
  console.error("   After build, use `npm run dev:clean` — not plain `npm run dev` — if pages look unstyled.\n");
  process.exit(1);
}
