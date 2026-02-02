import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ['@excalidraw/excalidraw'],
  // Force local tracing to avoid issues with parent workspace lockfiles
  outputFileTracingRoot: process.cwd(),
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'react': path.resolve(process.cwd(), 'node_modules/react'),
      'react-dom': path.resolve(process.cwd(), 'node_modules/react-dom'),
    };
    return config;
  },
};

export default nextConfig;
