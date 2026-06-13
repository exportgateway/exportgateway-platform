import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/constants";

export const runtime = "edge";
export const alt = `${siteConfig.name} — ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0ea5e9 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            opacity: 0.85,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          exportgateway.eu
        </div>
        <div style={{ fontSize: 72, fontWeight: 800, marginTop: 24, lineHeight: 1.1 }}>
          {siteConfig.name}
        </div>
        <div style={{ fontSize: 36, marginTop: 16, opacity: 0.9, maxWidth: 900 }}>
          {siteConfig.tagline}
        </div>
        <div style={{ fontSize: 22, marginTop: 40, opacity: 0.75 }}>
          Customs intelligence · Freight pricing · Intrastat allocation
        </div>
      </div>
    ),
    { ...size }
  );
}
