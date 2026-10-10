import type { MetadataRoute } from "next";
import { learnOrigin } from "@/lib/learn/queries";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/api/learn/media/"],
      disallow: [
        "/admin/",
        "/app/",
        "/api/admin/",
        "/learn/preview/",
        "/learn/start/",
      ],
    },
    sitemap: `${learnOrigin()}/sitemap.xml`,
  };
}
