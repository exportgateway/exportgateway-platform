import type { MetadataRoute } from "next";
import { IS_PRELAUNCH } from "@/config/prelaunch";
import { siteConfig } from "@/lib/constants";

export default function sitemap(): MetadataRoute.Sitemap {
  if (IS_PRELAUNCH) {
    return [];
  }

  const routes = [
    "",
    "/platform",
    "/platform/export-auditor",
    "/platform/customs",
    "/platform/freight",
    "/intrastat-ai",
    "/early-access",
    "/pricing",
    "/faq",
    "/contact",
    "/security",
    "/privacy",
    "/terms",
    "/disclaimer",
    "/cookies",
  ];

  return routes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" || route === "/platform" ? 1 : 0.8,
  }));
}
