/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure proper image domains for Cloudinary
  images: {
    domains: ['res.cloudinary.com'],
  },
}

module.exports = nextConfig

