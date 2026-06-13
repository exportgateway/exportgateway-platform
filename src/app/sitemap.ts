import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/constants";



export default function sitemap(): MetadataRoute.Sitemap {

  const routes = [

    "",

    "/platform",

    "/platform/export-auditor",

    "/platform/customs",

    "/platform/freight",

    "/platform/intrastat",

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

