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
};

export default nextConfig;
