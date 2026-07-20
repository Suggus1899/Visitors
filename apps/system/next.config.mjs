/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: [
    '@logmaster/ui',
    '@logmaster/auth',
    '@logmaster/api',
    '@logmaster/types',
    '@logmaster/utils',
    '@logmaster/config',
  ],
  // Images served by the backend (photo blobs) are remote — allow same-origin
  // via the API rewrite so <img src="/api/v1/visitors/.../photo" /> works.
  images: {
    remotePatterns: [],
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
