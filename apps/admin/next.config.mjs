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
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
