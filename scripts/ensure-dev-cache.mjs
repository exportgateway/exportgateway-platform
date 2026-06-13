/**
 * Detects a corrupted or production-stale .next cache before `next dev`.
 *
 * Common causes:
 * - `npm run build` while `npm run dev` is still running (most frequent)
 * - Interrupted build leaving partial .next
 * - Dev server left running for hours after a production build overwrote static/css
 *
 * Symptom: HTML links /_next/static/css/app/layout.css → 404, unstyled pages.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const NEXT_DIR = path.join(ROOT, ".next");

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function walkCssFiles(dir, files = []) {
  if (!exists(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkCssFiles(full, files);
    else if (entry.name.endsWith(".css")) files.push(full);
  }
  return files;
}

function isCorruptedDevCache() {
  if (!exists(NEXT_DIR)) return { corrupt: false };

  const hasServerDir = exists(path.join(NEXT_DIR, "server"));
  const hasPageJs = exists(path.join(NEXT_DIR, "server", "app", "page.js"));
  const hasDevCache = exists(path.join(NEXT_DIR, "cache", "webpack"));
  const hasBuildId = exists(path.join(NEXT_DIR, "BUILD_ID"));
  const devLayoutCss = path.join(NEXT_DIR, "static", "css", "app", "layout.css");
  const hasDevLayoutCss = exists(devLayoutCss);

  const cssFiles = walkCssFiles(path.join(NEXT_DIR, "static", "css"));
  const hasProductionHashCss = cssFiles.some((f) =>
    /[\\/][a-f0-9]{8,}\.css$/i.test(f)
  );

  // Stale production build — dev must compile its own cache (fixes layout.css 404)
  if (hasBuildId) {
    return {
      corrupt: true,
      reason: "production BUILD_ID present — run dev on a fresh cache, not after `npm run build`",
    };
  }

  // Dev server running + production CSS chunks, but dev layout.css missing → layout.css 404
  if (hasDevCache && hasProductionHashCss && !hasDevLayoutCss) {
    return {
      corrupt: true,
      reason:
        "production CSS chunks in .next/static/css but dev layout.css missing — stop dev, delete .next, restart",
    };
  }

  // Partial .next after interrupted build or concurrent build+dev
  if (hasServerDir && !hasPageJs && hasDevCache) {
    return {
      corrupt: true,
      reason: "partial .next (server without app/page.js) with webpack dev cache",
    };
  }

  // Production static artifacts mixed with broken dev server output
  const hasStatic = exists(path.join(NEXT_DIR, "static"));
  if (hasStatic && hasServerDir && !hasPageJs) {
    return {
      corrupt: true,
      reason: "static + server dirs without compiled app/page.js",
    };
  }

  // Missing chunk files referenced by stale webpack runtime (Cannot find module './331.js')
  const chunksDir = path.join(NEXT_DIR, "server", "chunks");
  if (hasDevCache && exists(chunksDir)) {
    try {
      const chunkCount = fs.readdirSync(chunksDir).filter((f) => f.endsWith(".js")).length;
      if (chunkCount === 0 && hasServerDir) {
        return { corrupt: true, reason: "empty server/chunks with active dev cache" };
      }
    } catch {
      /* ignore */
    }
  }

  return { corrupt: false };
}

const result = isCorruptedDevCache();

if (result.corrupt) {
  console.warn("⚠️  Stale or corrupted .next cache — removing for clean dev start.");
  console.warn(`   Cause: ${result.reason}`);
  console.warn("   Do not run `npm run build` while `npm run dev` is active.");
  console.warn("   After any production build: stop dev → restart `npm run dev`.");
  fs.rmSync(NEXT_DIR, { recursive: true, force: true });
}
