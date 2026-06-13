/**
 * Pre-build CSS pipeline verification.
 * Fails fast if Tailwind/PostCSS is misconfigured BEFORE next build runs.
 *
 * Run: node scripts/verify-css-setup.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const errors = [];

function read(filePath) {
  const full = path.join(ROOT, filePath);
  if (!fs.existsSync(full)) {
    errors.push(`Missing required file: ${filePath}`);
    return null;
  }
  return fs.readFileSync(full, "utf8");
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

// --- 1. postcss.config.js must exist and register tailwindcss ---
const postcssConfigPath = path.join(ROOT, "postcss.config.js");
assert(fs.existsSync(postcssConfigPath), "postcss.config.js is missing. Tailwind will NOT compile without it.");

if (fs.existsSync(postcssConfigPath)) {
  const postcssConfig = fs.readFileSync(postcssConfigPath, "utf8");
  assert(
    /tailwindcss/.test(postcssConfig),
    "postcss.config.js must register the tailwindcss plugin."
  );
  assert(/autoprefixer/.test(postcssConfig), "postcss.config.js must register autoprefixer.");
}

// Reject postcss.config.mjs-only setups (fragile on Windows / some CI loaders)
const mjsOnly =
  fs.existsSync(path.join(ROOT, "postcss.config.mjs")) &&
  !fs.existsSync(postcssConfigPath);
assert(!mjsOnly, "Only postcss.config.mjs found. Use postcss.config.js (CommonJS) as the canonical config.");

// --- 2. globals.css must contain @tailwind directives ---
const globalsCss = read("src/app/globals.css");
if (globalsCss) {
  assert(/@tailwind\s+base/.test(globalsCss), "src/app/globals.css must include @tailwind base;");
  assert(/@tailwind\s+components/.test(globalsCss), "src/app/globals.css must include @tailwind components;");
  assert(/@tailwind\s+utilities/.test(globalsCss), "src/app/globals.css must include @tailwind utilities;");
}

// --- 3. root layout must import globals.css ---
const rootLayout = read("src/app/layout.tsx");
if (rootLayout) {
  assert(
    /import\s+["']\.\/globals\.css["']/.test(rootLayout),
    'src/app/layout.tsx must import "./globals.css" — this is the only CSS entry point.'
  );
}

// --- 4. tailwind.config must exist ---
assert(
  fs.existsSync(path.join(ROOT, "tailwind.config.ts")) ||
    fs.existsSync(path.join(ROOT, "tailwind.config.js")),
  "tailwind.config.ts (or .js) is missing."
);

// --- 5. PostCSS smoke test: compile globals.css and reject raw @tailwind output ---
if (errors.length === 0 && globalsCss) {
  try {
    const tailwindConfigPath = fs.existsSync(path.join(ROOT, "tailwind.config.ts"))
      ? path.join(ROOT, "tailwind.config.ts")
      : path.join(ROOT, "tailwind.config.js");

    const result = await postcss([
      tailwindcss({ config: tailwindConfigPath }),
      autoprefixer(),
    ]).process(globalsCss, { from: path.join(ROOT, "src/app/globals.css") });

    assert(
      !/@tailwind\s+(base|components|utilities)/.test(result.css),
      "PostCSS smoke test FAILED: @tailwind directives were not compiled. Check postcss.config.js."
    );
    assert(
      result.css.includes("tailwindcss") || result.css.includes("box-sizing"),
      "PostCSS smoke test FAILED: output does not look like processed Tailwind CSS."
    );
  } catch (err) {
    errors.push(`PostCSS smoke test threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (errors.length > 0) {
  console.error("\n❌ CSS setup verification failed:\n");
  for (const err of errors) {
    console.error(`  • ${err}`);
  }
  console.error("\nSee docs/css-stability-guide.md\n");
  process.exit(1);
}

console.log("✅ CSS setup verification passed (PostCSS + Tailwind + root layout import).");
