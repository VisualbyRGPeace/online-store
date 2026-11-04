import type { NextConfig } from "next";

// The custom domain serves from the root, so CI sets an empty base path.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export", // static HTML/JS/CSS only: no server, no proxy, no Server Actions
  basePath,
  trailingSlash: true,
  images: { unoptimized: true }, // the image optimizer needs a server
};

export default nextConfig;
