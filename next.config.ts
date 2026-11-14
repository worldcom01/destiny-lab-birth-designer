import type { NextConfig } from "next";
import { BASE_PATH, LEGACY_REDIRECTS } from "./src/lib/site/routes";

/**
 * R5.10 — Birth Designer is served as the `/birth` zone of www.destiny-code.kr (Next.js multi-zones).
 * See src/lib/site/routes.ts for the route map and the legacy-link redirects.
 */
const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  async redirects() {
    return [...LEGACY_REDIRECTS];
  },
};

export default nextConfig;
