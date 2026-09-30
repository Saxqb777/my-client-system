import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  reactStrictMode: true,
  // Transcript files go through server actions (default limit 1 MB). Vercel caps request bodies at 4.5 MB anyway.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default nextConfig;
