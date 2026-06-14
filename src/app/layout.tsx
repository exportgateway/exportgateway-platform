import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { siteConfig } from "@/lib/constants";
import { CookieConsent } from "@/components/consent/CookieConsent";
import {
  OrganizationJsonLd,
  SoftwareApplicationJsonLd,
  WebSiteJsonLd,
} from "@/components/seo/JsonLd";
import { IS_PRELAUNCH, PRELAUNCH_ROBOTS } from "@/config/prelaunch";
import { absoluteUrl } from "@/lib/seo";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
  preload: true,
});

const productionMetadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  description: siteConfig.description,
  keywords: [
    "international trade",
    "customs compliance",
    "freight logistics",
    "export documentation",
    "HS code classification",
    "trade automation",
    "freight calculator",
    "intrastat ai auditor",
    "export auditor",
  ],
  authors: [{ name: siteConfig.name, url: siteConfig.url }],
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: siteConfig.url,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    siteName: siteConfig.name,
    images: [
      { url: absoluteUrl("/opengraph-image"), width: 1200, height: 630, alt: siteConfig.name },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    images: [absoluteUrl("/opengraph-image")],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.name}`,
  },
  ...(IS_PRELAUNCH
    ? {
        robots: PRELAUNCH_ROBOTS,
      }
    : productionMetadata),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        {!IS_PRELAUNCH && (
          <>
            <OrganizationJsonLd />
            <WebSiteJsonLd />
            <SoftwareApplicationJsonLd />
          </>
        )}
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
