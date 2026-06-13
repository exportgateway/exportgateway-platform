/** Quick Mapbox connectivity check — run after adding .env.local */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const token =
  process.env.MAPBOX_ACCESS_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

if (!token) {
  console.error("❌ No Mapbox token in .env.local");
  process.exit(1);
}

const url =
  "https://api.mapbox.com/directions/v5/mapbox/driving/" +
  "14.5058,46.0569;11.582,48.1351" +
  "?geometries=geojson&access_token=" +
  token;

const res = await fetch(url);
const data = await res.json();

if (!res.ok) {
  console.error("❌ Mapbox Directions failed:", data.message || res.status);
  process.exit(1);
}

const coords = data.routes?.[0]?.geometry?.coordinates?.length ?? 0;
const km = Math.round((data.routes?.[0]?.distance ?? 0) / 1000);
console.log(`✅ Mapbox Directions OK — ${coords} geometry points, ${km} km (Ljubljana→Munich)`);
