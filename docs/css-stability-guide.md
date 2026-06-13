# CSS Stability Guide — ExportGateway Platform

> How styles load, what must never change, and how to add pages safely.

---

## How Styles Load

```
src/app/layout.tsx
    └── import "./globals.css"
            └── @tailwind base / components / utilities
            └── @layer components (.btn-primary, .section-padding, …)

postcss.config.js  (REQUIRED)
    └── tailwindcss  → reads tailwind.config.ts, scans ./src/**/*
    └── autoprefixer

next build / next dev
    └── PostCSS processes globals.css
    └── Emits .next/static/css/*.css (42 KB+ when healthy)
    └── HTML links: <link rel="stylesheet" href="/_next/static/css/….css">
```

**Single entry point:** Only `src/app/layout.tsx` imports global CSS. Nested layouts (`platform/`, `dashboard/`) must **not** import `globals.css` again.

---

## Files You Must Not Break

| File | Role | If broken |
|------|------|-----------|
| `postcss.config.js` | Registers Tailwind PostCSS plugin | Raw `@tailwind` in output → unstyled site |
| `src/app/globals.css` | Tailwind directives + shared classes | No utilities or components |
| `src/app/layout.tsx` | `import "./globals.css"` | CSS never loaded |
| `tailwind.config.ts` | Content paths, theme extensions | Build fails on `@apply` or missing utilities |

### Do not

- Delete or rename `postcss.config.js`
- Replace it with only `postcss.config.mjs`
- Add a second global CSS entry without team review
- Move `tailwindcss` back to optional dev-only install paths without CI checks
- Import `globals.css` in nested layouts (causes duplication, not the unstyled bug)

---

## Automated Guards

| Script | When | What it checks |
|--------|------|----------------|
| `scripts/verify-css-setup.mjs` | `predev`, `prebuild`, `npm run verify:css` | Config files, layout import, PostCSS smoke test |
| `scripts/verify-css-build.mjs` | `postbuild`, after build | No raw `@tailwind`, CSS size, utilities, homepage stylesheet |
| `npm run test:css` | Manual / CI | Full setup + build + output chain |

If any check fails, **fix CSS config before merging**. Do not bypass with `--no-verify`.

---

## Adding New Pages Safely

1. Create pages under `src/app/…/page.tsx` — no CSS import needed
2. Use Tailwind classes normally in components under `src/components/`
3. New directories under `src/` are already covered by `tailwind.config.ts`:

   ```ts
   content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"]
   ```

4. Run `npm run dev` — `predev` catches config regressions immediately
5. Run `npm run build` before PR — `postbuild` validates compiled CSS

### Nested layouts

```tsx
// ✅ OK — wrap content only
export default function PlatformLayout({ children }) {
  return <MarketingLayout>{children}</MarketingLayout>;
}

// ❌ NEVER — do not re-import globals.css in nested layouts
import "../globals.css";
```

---

## If Styles Disappear Locally

1. **Stop all dev servers** (multiple `next dev` on ports 3000/3001 cause confusion)
2. Run `npm run verify:css` — read the error
3. Confirm `postcss.config.js` exists
4. Delete `.next` and restart: `Remove-Item -Recurse .next; npm run dev`
5. Hard-refresh browser (Ctrl+Shift+R)

---

## CI Recommendation

Add to pipeline:

```bash
npm ci
npm run test:css
```

This runs setup verification, production build, and output validation in one command.

---

## Quick Reference

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Raw HTML, SVG OK | PostCSS config missing | Restore `postcss.config.js` |
| Build passes, site broken | Same — silent failure | Run `npm run verify:css:build` |
| Only some routes broken | Unlikely CSS pipeline; check component errors | Browser console |
| After agent refactor | Config file deleted | `git checkout postcss.config.js` |
| Stale styling | Old dev server / `.next` cache | Kill servers, delete `.next` |

See also: `docs/css-root-cause-analysis.md`
