import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kqa/ui", "@kqa/db", "@kqa/auth", "@kqa/ai"],
};

export default nextConfig;
