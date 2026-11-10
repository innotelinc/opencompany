/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
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
