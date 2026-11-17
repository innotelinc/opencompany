/**
 * The deployment host builds this image in a container that is tight on memory, so
 * the Dockerfile sets OPENCOMPANY_BUILD_SINGLE_CPU. A host with headroom builds at
 * full speed; the container trades build time for a peak that fits.
 */
const singleWorker = process.env.OPENCOMPANY_BUILD_SINGLE_CPU === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
    ...(singleWorker ? { cpus: 1, webpackBuildWorker: false } : {}),
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
