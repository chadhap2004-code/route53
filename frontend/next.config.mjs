/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

const nextConfig = {
  reactStrictMode: true,
  // Cloudscape ships ESM + CSS imports inside node_modules; Next must compile them.
  transpilePackages: [
    "@cloudscape-design/components",
    "@cloudscape-design/component-toolkit",
    "@cloudscape-design/collection-hooks",
  ],
  // The browser only ever talks to this Next.js origin. /api/* is proxied server-side to FastAPI,
  // so the session cookie is first-party and no CORS preflight is needed.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
