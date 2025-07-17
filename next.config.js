/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true, // Required for static export
  },
  // Add these optimizations for Cloudflare Pages
  experimental: {
    optimizePackageImports: ['react-markdown', 'remark-gfm', 'uuid'],
    optimizeServerReact: true,
  },
  // Enable proper source maps for debugging
  productionBrowserSourceMaps: true,
  // Configure the base path if needed
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
};

module.exports = nextConfig;

