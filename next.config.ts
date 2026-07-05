import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/isa-web",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
