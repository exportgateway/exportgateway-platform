# Golden Invoice Validation Dataset

Each subfolder contains:

| File | Purpose |
|------|---------|
| `invoice.pdf` | Source invoice PDF (replace placeholder with real file) |
| `validation-report.pdf` | Exported validation report PDF |
| `invoice-source.json` | OCR / normalized invoice payload |
| `expected-results.json` | Captured golden expectations |

## Commands

```bash
npm run golden-dataset:bootstrap   # Rebuild expected-results from current engine
npm run test:golden-dataset        # Compare actual vs expected, generate review
```

## Adding a new invoice

1. Add entry to `scripts/golden-dataset-registry.ts`
2. Run `npm run golden-dataset:bootstrap`
3. Review `expected-results.json` and adjust if needed
4. Drop real PDFs into `golden-invoices/{id}/`
