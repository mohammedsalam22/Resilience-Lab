import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained .next/standalone server so the Docker gateway image
  // (README §9) stays small and runs without installing node_modules.
  output: "standalone",
};

export default nextConfig;
