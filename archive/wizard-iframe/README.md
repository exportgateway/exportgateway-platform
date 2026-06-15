# Legacy Wizard Iframe Embed

**Archived:** 2026-06-15  
**Replaced by:** `src/components/platform/classification/ClassificationWizard.tsx`

This folder preserves the iframe-based Export Classification Wizard embed removed from production at final cutover.

## Contents

| File | Purpose |
|------|---------|
| `WizardEmbed.tsx` | iframe shell, postMessage resize/plan sync |
| `native-classification-wizard.ts` | Phase 1.2 feature flag (obsolete) |

## Why archived

Production `/platform/customs` now uses the native React wizard calling `POST /classify/v2` on Render directly. The iframe introduced scroll/clipping regressions and split frontend deploy paths.

## WordPress / standalone

Render `GET /` wizard UI remains available for WordPress embeds and direct links — unchanged on backend.

## Do not import

These files are **not** part of the Next.js build. Reference only.
