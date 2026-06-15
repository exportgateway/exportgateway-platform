const inputs = [
  "Men's cotton jeans",
  "Hydraulic oil ISO VG46",
  "MAKITA BO5041SET",
  "SENSOR",
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

for (const q of inputs) {
  await delay(2500);
  const res = await fetch("https://export-compliance-wizard.onrender.com/classify/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_description: q, plan: "ENTERPRISE" }),
  });
  const d = await res.json();
  console.log(`\n=== ${q} (HTTP ${res.status}) ===`);
  if (!res.ok) {
    console.log(JSON.stringify({ error: d.detail ?? d }, null, 2));
    continue;
  }
  console.log(
    JSON.stringify(
      {
        recommended_cn_code: d.recommended_cn_code,
        confidence: d.confidence,
        research_source: d.research_source,
        from_cache: d.from_cache,
        declaration_count: d.historical_evidence?.declaration_count,
        evidence_strength: d.historical_evidence?.evidence_strength,
        manual_classification_recommended: d.manual_classification_recommended,
        commodity_description: d.commodity_description?.slice(0, 80),
      },
      null,
      2
    )
  );
}
