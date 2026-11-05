import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["app.lvh.me"],
  transpilePackages: ["@kqa/ui", "@kqa/db", "@kqa/auth", "@kqa/ai"],
};

export default nextConfig;
