import type { NextConfig } from "next";

const isPrelaunch = process.env.NEXT_PUBLIC_PRELAUNCH === "true";
const officialDomain = process.env.NEXT_PUBLIC_OFFICIAL_DOMAIN?.replace(/\/$/, "");
const X_ROBOTS_TAG_VALUE = "noindex, nofollow, noarchive, nosnippet, noimageindex";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** pdf-parse / pdfjs-dist must run as Node externals — webpack bundling breaks PDF text extraction. */
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  /** Export Auditor uploads full invoice PDFs via Server Actions (backend allows up to 10 MB). */
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    if (!isPrelaunch) {
      return [];
    }
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: X_ROBOTS_TAG_VALUE,
          },
        ],
      },
    ];
  },
  async redirects() {
    /** When official domain launches, redirect Vercel preview URL to production. */
    if (isPrelaunch || !officialDomain) {
      return [];
    }
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "exportgateway.vercel.app" }],
        destination: `${officialDomain}/:path*`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
