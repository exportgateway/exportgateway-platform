import type { NextConfig } from "next";

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
};

export default nextConfig;
