# Declaration Preparation Certification

Invoice **6124746** (MAXX GROUP.pdf) — customs declarant export hardening.

## Before (unsafe)

| Issue | Impact |
|---|---|
| Non-preferential exception propagated by style prefix / section scan | Positions 1–2 incorrectly marked **NO** when only `2AA089S26JER002` is listed |
| Aggregation key `HS + COO + Preferential` | Same HS/pref split into multiple rows per country (BG vs PT) |
| Value column included `EUR` suffix | Duplicate currency when Currency column exists |
| No Unit Of Measure column | Quantities without visible UOM |
| Net weight showed `0` when unknown | Misleading declarant data |

### Example — incorrect preferential split (before)

```
61099090 | PT | NO  → positions 1, 2, 6 merged
61099090 | PT | YES → remaining PT lines
```

Positions 1 and 2 (style `2AA065C99JER005`) were wrongly excluded from preferential origin.

## After (declaration-ready)

| Rule | Implementation |
|---|---|
| Non-preferential exception | **Exact style code only** — list-line parsing, no prefix/HS/COO propagation |
| Aggregation key | **`HS_CODE + PREFERENTIAL_ORIGIN`** — COO merged in Country column |
| Export columns | HS Code, Description, Country Of Origin, Preferential Origin, Quantity, Unit Of Measure, Net Weight (KG), Value, Currency, Source Positions |
| Value format | Locale numeric only (`620,80`) — Currency in separate column |
| UOM | Dedicated column, default **PCS** |
| Net weight | Blank when unknown — never `0` |

### Aggregation key

```typescript
// src/lib/export-auditor/hs-aggregation-engine.ts
buildAggregationKey(item) => `${item.hs_code}|${item.preferential_origin}`
```

### MAXX GROUP 6124746 — verified results

| Check | Result |
|---|---|
| Position 1 | Preferential **YES** |
| Position 2 | Preferential **YES** |
| Position 6 (`2AA089S26JER002`) | Preferential **NO** only |
| `61099090` YES | One aggregated row (countries: BG, PT, …) |
| `61099090` NO | Separate row — position 6 only |
| Value column | `432,00` (no EUR text) |
| Currency column | `EUR` |
| UOM column | `PCS` (default) |

### Example export row (after)

| HS Code | Description | Country Of Origin | Preferential Origin | Quantity | Unit Of Measure | Net Weight (KG) | Value | Currency | Source Positions |
|---|---|---|---|---:|---|---|---:|---|---|
| 61099090 | … | BG, PT | YES | 42 | PCS | | 4.079,20 | EUR | 1,2,3,… |
| 61099090 | … | PT | NO | 3 | PCS | | 432,00 | EUR | 6 |

## Certification gate

`validateDeclarationExportCertification()` fails when:

- Non-preferential exception applied to wrong style
- Rows with different preferential status share positions
- Value column contains currency text
- Missing UOM
- Position reconciliation failure

## Regression tests

```bash
npm run test:declaration-preparation-certification
npm run test:declaration-preparation
npm run test:maxx-group-real-pdf
npm run test:golden-customs-workflow
```

All must pass for declaration-ready certification.
