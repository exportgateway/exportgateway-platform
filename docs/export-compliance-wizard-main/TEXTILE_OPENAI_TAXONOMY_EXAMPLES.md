# Textile OpenAI → Taxonomy Integration — Before/After Examples

**Threshold:** `confidence > 0.85` → auto-answer disambiguation; below → ask user.  
**Detected attributes** are always returned when inferable (display only when present).

| # | Input | Before (state / questions) | After (confidence ≥ 0.85) |
|---|-------|---------------------------|---------------------------|
| 1 | `500 kos moške bombažne jeans hlače` | DISAMBIGUATE — textile construction | **SUGGEST** — auto: `textile_construction=woven`. Detected: Men, Cotton, Denim, Woven |
| 2 | `Moške jeans hlače` | DISAMBIGUATE — textile construction | **SUGGEST** — auto: woven. Detected: Men, Denim, Woven |
| 3 | `Ženske jeans hlače` | DISAMBIGUATE — textile construction | **SUGGEST** — auto: woven. Detected: Women, Denim, Woven |
| 4 | `Men's cotton trousers` | DISAMBIGUATE — textile construction | **SUGGEST** — auto: woven. Detected: Men, Cotton, Woven |
| 5 | `Women's polyester jacket` | DISAMBIGUATE — textile construction | **SUGGEST** — auto: woven. Detected: Women, Polyester, Woven |
| 6 | `500 pcs men's blue cotton jeans trousers` | DISAMBIGUATE — textile construction | **SUGGEST** — auto: woven. Detected: Men, Cotton, Denim, Woven |
| 7 | `Men's knitted polo shirt` | DISAMBIGUATE — textile construction | **SUGGEST** — auto: knitted. Detected: Men, Knitted |
| 8 | `Moška polo majica` | DISAMBIGUATE — textile construction | **SUGGEST** — auto: knitted. Detected: Men, Knitted |
| 9 | `Women's cotton t-shirt` | DISAMBIGUATE — textile construction | **SUGGEST** — auto: knitted. Detected: Women, Cotton, Knitted |
| 10 | `500 kos ženske bombažne majice` | DISAMBIGUATE — textile construction | **SUGGEST** — auto: knitted. Detected: Women, Cotton, Knitted |
| 11 | `Men's denim jacket` | DISAMBIGUATE — textile construction | **SUGGEST** — auto: woven. Detected: Men, Denim, Woven |
| 12 | `Damenjeans` (DE) | DISAMBIGUATE — textile construction | **SUGGEST** — auto: woven. Detected: Women, Denim, Woven |
| 13 | `Herrenjeans` (DE) | DISAMBIGUATE — textile construction | **SUGGEST** — auto: woven. Detected: Men, Denim, Woven |
| 14 | `Pantalones vaqueros hombre` (ES) | DISAMBIGUATE — textile + gender | **SUGGEST** — auto: woven, mens. Detected: Men, Denim, Woven |
| 15 | `Pantaloni in cotone da uomo` (IT) | DISAMBIGUATE — textile construction | **SUGGEST** — auto: woven. Detected: Men, Cotton, Woven |
| 16 | `trousers` (generic, no gender) | DISAMBIGUATE — textile + gender | **SUGGEST** if OpenAI fills gender; else DISAMBIGUATE — gender only |
| 17 | `Men's wool sweater` | DISAMBIGUATE — textile construction | **SUGGEST** — auto: knitted. Detected: Men, Wool, Knitted |
| 18 | `Linen shirt men's` | DISAMBIGUATE — textile construction | **SUGGEST** — auto: woven. Detected: Men, Linen, Woven |
| 19 | `500 kos moške hlače` (no fabric hint, conf 0.80) | DISAMBIGUATE — textile construction | **DISAMBIGUATE** — confidence below 0.85, user asked |
| 20 | `garment` (vague, conf 0.55) | DISAMBIGUATE — textile + gender | **DISAMBIGUATE** — low confidence, no auto-answer |

## Mapping rules (confidence > 0.85)

| OpenAI signal | Taxonomy answer | Display |
|---------------|-----------------|---------|
| `material: cotton` | — | Material: Cotton |
| `fabric: denim` / `jeans` in terms | `textile_construction=woven` | Fabric: Denim |
| `construction: woven` | `textile_construction=woven` | Construction: Woven |
| `construction: knitted` | `textile_construction=knitted` | Construction: Knitted |
| `gender: male` / men's families | `apparel_gender=mens` (when needed) | Gender: Men |

## Audit log field

When auto-answer applies, `disambiguation_json` in classification audit includes:

```json
{
  "auto_answered_questions": ["textile_construction"],
  "detected_attributes": {
    "gender": "Men",
    "material": "Cotton",
    "fabric": "Denim",
    "construction": "Woven"
  },
  "resolved_answers": { "textile_construction": "woven" }
}
```

Server logs: `auto_answered_questions=['textile_construction'] confidence=0.92 ...`
