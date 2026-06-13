/**
 * Post-build CSS verification.
 * Fails if Next.js produced CSS without Tailwind compilation.
 *
 * Run after: next build
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const errors = [];
const MIN_PROCESSED_CSS_BYTES = 15_000;
const RAW_TAILWIND = /@tailwind\s+(base|components|utilities)/;
const TAILWIND_BANNER = /tailwindcss v\d/;
const UTILITY_CLASS = /\.flex[\s\{,:]/;

function walkCssFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkCssFiles(full, files);
    else if (entry.name.endsWith(".css")) files.push(full);
  }
  return files;
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

// --- 1. Built CSS files must exist ---
const cssDir = path.join(ROOT, ".next", "static", "css");
const cssFiles = walkCssFiles(cssDir);

assert(cssFiles.length > 0, `.next/static/css has no CSS files. Did next build run?`);

// --- 2. Every built CSS chunk must be processed (no raw @tailwind) ---
let largestCss = { path: "", size: 0, content: "" };

for (const file of cssFiles) {
  const content = fs.readFileSync(file, "utf8");
  const size = Buffer.byteLength(content, "utf8");
  const rel = path.relative(ROOT, file);

  assert(!RAW_TAILWIND.test(content), `${rel} contains unprocessed @tailwind directives — Tailwind did not run.`);

  if (size > largestCss.size) {
    largestCss = { path: rel, size, content };
  }
}

// --- 3. Main CSS bundle must be substantial and contain Tailwind output ---
if (largestCss.path) {
  assert(
    largestCss.size >= MIN_PROCESSED_CSS_BYTES,
    `Largest CSS bundle (${largestCss.path}, ${largestCss.size} bytes) is too small. ` +
      `Expected ≥ ${MIN_PROCESSED_CSS_BYTES} bytes when Tailwind utilities are compiled. ` +
      `Broken builds are typically ~4 KB with raw @tailwind directives.`
  );
  assert(
    TAILWIND_BANNER.test(largestCss.content),
    `${largestCss.path} is missing the Tailwind CSS banner comment — compilation may have failed.`
  );
  assert(
    UTILITY_CLASS.test(largestCss.content),
    `${largestCss.path} is missing compiled utility classes (e.g. .flex) — Tailwind content scan may be broken.`
  );
}

// --- 4. Homepage prerender must link a stylesheet ---
const indexHtmlPath = path.join(ROOT, ".next", "server", "app", "index.html");
if (fs.existsSync(indexHtmlPath)) {
  const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
  assert(
    /rel="stylesheet"/.test(indexHtml),
    "Homepage prerender (.next/server/app/index.html) has no stylesheet link."
  );

  const hrefMatch = indexHtml.match(/href="(\/_next\/static\/css\/[^"]+\.css)"/);
  if (hrefMatch) {
    // URL /_next/static/css/… maps to filesystem .next/static/css/…
    const fsRelative = hrefMatch[1].replace(/^\/_next\//, ".next/").replace(/\//g, path.sep);
    const cssPath = path.join(ROOT, fsRelative);
    assert(fs.existsSync(cssPath), `Homepage references missing CSS file: ${hrefMatch[1]} (expected at ${fsRelative})`);
    if (fs.existsSync(cssPath)) {
      const linkedCss = fs.readFileSync(cssPath, "utf8");
      assert(!RAW_TAILWIND.test(linkedCss), `Homepage CSS (${hrefMatch[1]}) contains raw @tailwind directives.`);
    }
  } else {
    errors.push("Homepage prerender has no /_next/static/css/ stylesheet href.");
  }
} else {
  errors.push("Homepage prerender not found at .next/server/app/index.html — cannot verify stylesheet.");
}

if (errors.length > 0) {
  console.error("\n❌ CSS build verification failed:\n");
  for (const err of errors) {
    console.error(`  • ${err}`);
  }
  console.error("\nRoot cause: PostCSS/Tailwind did not process globals.css during build.");
  console.error("See docs/css-root-cause-analysis.md\n");
  process.exit(1);
}

console.log(
  `✅ CSS build verification passed (${cssFiles.length} file(s), largest: ${largestCss.path}, ${largestCss.size} bytes).`
);
console.warn(
  "\n⚠️  If `npm run dev` is running, stop it and run `npm run dev` again after this build."
);
console.warn(
  "   Otherwise the dev server may serve layout.css 404 and unstyled pages (stale .next cache).\n"
);
