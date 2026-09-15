import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Both loopback hostnames are used by the local preview.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
