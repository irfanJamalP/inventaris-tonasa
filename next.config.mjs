/** @type {import('next').NextConfig} */
const nextConfig = process.env.NEXT_PUBLIC_PORTFOLIO_DEMO === 'true'
  ? { output: 'export', trailingSlash: true }
  : {};

export default nextConfig;
