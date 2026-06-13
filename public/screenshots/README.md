# Platform Screenshots

Screenshot assets for marketing and product previews.

## Generate

1. Start the dev server: `npm run dev`
2. Install Playwright (one-time): `npm install -D playwright && npx playwright install chromium`
3. Capture: `npm run screenshots`

Output files:

| File | Source |
|------|--------|
| `platform-hub.png` | `/platform` dashboard |
| `freight-calculator.png` | `/platform/freight` empty state |
| `intrastat-allocation.png` | `/platform/intrastat` empty state |
| `customs-wizard.png` | `/platform/customs` embed |

Set `SCREENSHOT_BASE_URL` to override the default `http://localhost:3000`.
