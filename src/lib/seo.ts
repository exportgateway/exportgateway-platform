import type { Metadata } from "next";
import { siteConfig } from "@/lib/constants";
import { IS_PRELAUNCH, PRELAUNCH_ROBOTS } from "@/config/prelaunch";

const OG_IMAGE_PATH = "/opengraph-image";

export function absoluteUrl(path: string): string {
  const base = siteConfig.url.replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function buildPageMetadata({
  title,
  description,
  path,
  noIndex = false,
}: {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
}): Metadata {
  if (IS_PRELAUNCH) {
    return {
      title,
      robots: PRELAUNCH_ROBOTS,
    };
  }

  const url = absoluteUrl(path);
  const ogImage = absoluteUrl(OG_IMAGE_PATH);
  const blockIndex = noIndex;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: siteConfig.name,
      type: "website",
      locale: "en_GB",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${siteConfig.name} — ${siteConfig.tagline}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    robots: blockIndex ? { index: false, follow: false } : { index: true, follow: true },
  };
}
