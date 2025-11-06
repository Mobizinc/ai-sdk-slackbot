/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/admin',
  assetPrefix: '/admin',
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
}

module.exports = nextConfig
