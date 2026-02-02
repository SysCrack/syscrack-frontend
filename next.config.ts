import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ['@excalidraw/excalidraw'],
  // Force local tracing to avoid issues with parent workspace lockfiles
  outputFileTracingRoot: process.cwd(),

};

export default nextConfig;
