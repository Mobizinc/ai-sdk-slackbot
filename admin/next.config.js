/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  basePath: '/admin',
  assetPrefix: '/admin',
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
}

module.exports = nextConfig
