/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
    // One compile worker, and the memory-reducing mode that pairs with it:
    // together these keep `next build` inside the memory a small host has.
    cpus: 1,
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true,
  },
  webpack: (config) => {
    // CopilotKit's generative-UI entry imports maps support that this app does
    // not use. Alias it away instead of shipping a WebGL mapping library.
    config.resolve.alias = {
      ...config.resolve.alias,
      "maplibre-gl": false,
    };
    return config;
  },
};

export default nextConfig;
