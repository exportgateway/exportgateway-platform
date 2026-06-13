const html = await fetch("http://localhost:3000/").then((r) => r.text());
const links = [...html.matchAll(/href="(\/_next\/static\/css\/[^"]+)"/g)].map((m) => m[1]);
console.log("CSS links on homepage:", links.length ? links : "NONE");
for (const link of links) {
  const res = await fetch(`http://localhost:3000${link}`);
  const text = res.ok ? await res.text() : "";
  console.log({
    link,
    status: res.status,
    bytes: text.length,
    rawTailwind: /@tailwind\s+(base|components|utilities)/.test(text),
    hasFlex: /\.flex[\s\{,:]/.test(text),
    hasBtnPrimary: /\.btn-primary/.test(text),
  });
}
