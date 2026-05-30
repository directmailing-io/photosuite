/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [],
  },
  // Native Node-Module, die nicht von Webpack gebundelt werden sollen.
  // @resvg/resvg-js hat eine native .node-Binary, die nur in Node-Runtime funktioniert.
  experimental: {
    serverComponentsExternalPackages: ["@resvg/resvg-js"],
  },
};

module.exports = nextConfig;
