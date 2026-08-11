import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Turbopack rooted in this app, not a parent lockfile directory.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
