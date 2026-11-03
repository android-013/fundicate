import type { NextConfig } from "next";
const config: NextConfig = {
  cleanDistDir: false, // scripts/build.mjs cleans and prepares the output synchronously.
  poweredByHeader: false,
  // Use a small Webpack worker pool for the development machine and Windows sandbox.
  experimental: {
    webpackBuildWorker: false,
    cpus: 1,
    staticGenerationMaxConcurrency: 1,
  },
  serverExternalPackages: ["pg"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
