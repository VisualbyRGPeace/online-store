import type { NextConfig } from "next";

// GitHub Pages serves static files under /online-store, so the base path is set in CI.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export", // static HTML/JS/CSS only: no server, no proxy, no Server Actions
  basePath,
  trailingSlash: true,
  images: { unoptimized: true }, // the image optimizer needs a server
};

export default nextConfig;
