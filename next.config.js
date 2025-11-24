/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure proper image domains for Cloudinary
  images: {
    domains: ['res.cloudinary.com'],
  },
  // Improve dev server stability and HMR
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // Improve HMR stability - reduce file watching issues
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 1000, // Increased to 1 second to reduce rapid rebuilds
        ignored: ['**/node_modules', '**/.git', '**/.next', '**/.swc'],
      }
      // Better error handling for missing modules during HMR
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      }
      // Prevent HMR from breaking on missing chunks
      config.optimization = {
        ...config.optimization,
        removeAvailableModules: false,
        removeEmptyChunks: false,
      }
      // Ignore HMR errors for better stability
      config.ignoreWarnings = [
        { module: /node_modules/ },
        { file: /_next\/static/ },
      ]
    }
    return config
  },
  // Better error handling for dev server
  onDemandEntries: {
    // Period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 60 * 1000, // Increased to 60 seconds
    // Number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 5, // Increased buffer
  },
  // Improve build output
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
}

module.exports = nextConfig

