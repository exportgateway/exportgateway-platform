# CSS Root Cause Analysis — ExportGateway Platform

> **Date:** June 9, 2026  
> **Status:** Root cause confirmed; permanent fix implemented in `scripts/verify-css-setup.mjs` and `scripts/verify-css-build.mjs`.

---

## Symptom

The site renders as **raw HTML**:

- Tailwind utility classes (`flex`, `grid`, `px-4`, etc.) have no effect
- Custom `@layer` components (`.btn-primary`, `.section-padding`) may also fail
- Inline SVG and text content still appear (HTML is served correctly)
- Layout collapses to unstyled browser defaults

This has recurred after major feature work (platform pages, redesigns, refactors).

---

## Exact Root Cause

**PostCSS is not processing `src/app/globals.css`, so Tailwind never runs.**

When the `tailwindcss` PostCSS plugin is missing or not loaded, Next.js still **builds successfully** and emits a CSS file — but that file contains **unprocessed source**:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
body { @apply bg-surface-light text-slate-900; }
/* ... raw @apply rules ... */
```

Browsers **do not understand** `@tailwind` or `@apply`. They silently ignore those rules. Only font injection from `next/font` and inline HTML remain visible.

### Proof (reproduced locally)

| Condition | Build result | CSS size | Contains `@tailwind base` | Site appearance |
|-----------|--------------|----------|---------------------------|-----------------|
| `postcss.config.js` present | ✅ Pass | ~42 KB | ❌ No | Styled |
| `postcss.config.js` **removed** | ✅ Pass | ~4 KB | ✅ **Yes** | **Unstyled** |

**The failure is silent.** `next build` exits 0 in both cases.

---

## Why It Reoccurs

### 1. Project was manually scaffolded (primary introduction)

The repo was created **without `create-next-app`**, which normally generates a working PostCSS + Tailwind chain automatically.

Initial state:

- `postcss.config.mjs` (ESM) — less reliably picked up on some Windows/Node/CI setups
- No `postcss.config.js` (CommonJS) — the format Next.js docs and tooling expect
- **No build-time validation** — broken CSS shipped undetected

This introduced the problem at **project inception** (June 2026 initial manual build).

### 2. Next.js default PostCSS does not include Tailwind

If no PostCSS config is found (deleted, renamed, wrong cwd), Next.js falls back to:

```
autoprefixer only
```

Tailwind is **never invoked**. This is by design in Next.js — it does not bundle Tailwind by default.

### 3. Major feature work triggers config drift

After large implementations (platform hub, new route trees, agent refactors), these often happen:

- `postcss.config.js` accidentally deleted or replaced with `.mjs`
- Multiple dev servers on different ports (stale process serving old/broken CSS)
- `.next` cache not cleared after config changes
- Assumption that new `layout.tsx` files need their own `globals.css` import (they must **not** — only root layout)

None of these cause a build error without guards.

### 4. Tailwind was in `devDependencies` only

On environments that run `npm install --omit=dev` before build, `tailwindcss` / `postcss` may be missing. Behavior varies; the silent-failure mode remains the core issue.

### 5. Not a nested-layout or App Router bug

Investigation confirmed:

- Only `src/app/layout.tsx` imports `./globals.css` — **correct**
- Nested layouts (`platform/`, `dashboard/`, `early-access/`) do not re-import CSS — **correct**
- No duplicate `app/` directory at repo root
- No competing CSS entry points

---

## What Is NOT the Cause

| Ruled out | Evidence |
|-----------|----------|
| Missing `globals.css` import in root layout | Import present; removing it would fail smoke test |
| Wrong Tailwind `content` paths | Build produces 42 KB CSS with utilities when PostCSS works |
| Turbopack vs Webpack | Both compile Tailwind when PostCSS config exists |
| Nested routes breaking CSS | Platform routes use root layout; CSS link present in HTML |
| `@tailwind` v4 mismatch | Project uses Tailwind 3.4.x with correct directives |

---

## How to Reproduce

```powershell
# 1. Remove PostCSS config
Remove-Item postcss.config.js

# 2. Clean and build — succeeds silently
Remove-Item -Recurse -Force .next
npm run build

# 3. Inspect CSS — broken
Get-Content .next\static\css\*.css -Raw | Select-String '@tailwind base'
# → Match found (BAD)

# 4. Run dev server and open http://localhost:3000
# → Unstyled HTML, SVG visible, no layout
```

**Reverse fix:**

```powershell
# Restore postcss.config.js (see repo) and rebuild
npm run build
# postbuild script now fails if @tailwind remains in output
```

---

## Timeline

| When | Event |
|------|-------|
| Initial scaffold | Manual Next.js setup; PostCSS config fragile (`.mjs` only) |
| First styling incident | User report: unstyled homepage; investigation started |
| Interim fix | Added `postcss.config.js`, removed `.mjs` |
| Platform feature work | Large route additions; issue reported again (stale server / config drift) |
| Permanent fix | `verify-css-setup.mjs` + `verify-css-build.mjs` wired into npm scripts |

No git commit history exists in this repo to pinpoint a single commit hash; the defect class was introduced at **manual project creation** and **reoccurs whenever PostCSS config is missing or bypassed**.

---

## Permanent Fix (Implemented)

See `docs/css-stability-guide.md`.

1. **`postcss.config.js`** — canonical CommonJS config with explicit `tailwind.config.ts` path
2. **`tailwindcss`, `postcss`, `autoprefixer` moved to `dependencies`**
3. **`predev` / `prebuild`** — run `scripts/verify-css-setup.mjs`
4. **`postbuild`** — run `scripts/verify-css-build.mjs`
5. **`npm run test:css`** — full setup + build + output verification

Build now **fails** if:

- `postcss.config.js` is missing
- `globals.css` loses `@tailwind` directives
- Root layout loses `import "./globals.css"`
- PostCSS smoke test outputs raw `@tailwind`
- Built CSS contains raw `@tailwind` or is too small (~4 KB)
- Homepage prerender lacks stylesheet or links broken CSS
