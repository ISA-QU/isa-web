import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/qugpa",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
