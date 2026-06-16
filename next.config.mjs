/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      '@anthropic-ai/sdk',
      '@resvg/resvg-js',
      '@react-pdf/renderer',
    ],
  },
}

export default nextConfig
