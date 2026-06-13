/**
 * CANONICAL PostCSS configuration for ExportGateway.
 *
 * DO NOT DELETE OR RENAME without updating scripts/verify-css-setup.mjs.
 * DO NOT replace with postcss.config.mjs — use this CommonJS file only.
 *
 * Without this file, Next.js uses autoprefixer-only defaults and ships raw
 * @tailwind directives that browsers ignore (unstyled HTML).
 */
/** @type {import('postcss-load-config').Config} */
module.exports = {
  plugins: {
    tailwindcss: { config: "./tailwind.config.ts" },
    autoprefixer: {},
  },
};
