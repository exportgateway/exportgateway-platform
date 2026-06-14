import type { MetadataRoute } from "next";
import { IS_PRELAUNCH } from "@/config/prelaunch";
import { siteConfig } from "@/lib/constants";

export default function robots(): MetadataRoute.Robots {
  if (IS_PRELAUNCH) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/launch-readiness", "/seo-status"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
