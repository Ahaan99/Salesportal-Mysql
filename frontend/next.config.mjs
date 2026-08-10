/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Next.js 16 blocks cross-origin requests to /_next/* dev resources by
  // default. Without this, JS chunks served through a tunnel return blocked
  // stubs and the page never hydrates (framer-motion sections stay invisible).
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.app",
    "*.ngrok.io",
  ],
  experimental: {
    serverActions: {
      // Server Actions are protected by an Origin/Host CSRF check. When the
      // app is reached through a proxy, tunnel, or LAN IP, the browser's
      // Origin header differs from the Host the dev server sees internally
      // and Next.js rejects the POST with "Invalid Server Actions request".
      // List every front door the app is legitimately served from.
      allowedOrigins: [
        "localhost:3000",
        "127.0.0.1:3000",
        "*.trycloudflare.com",
        "*.ngrok-free.dev",
        "*.ngrok-free.app",
        "*.ngrok.app",
        "*.ngrok.io",
      ],
    },
  },
  async rewrites() {
    // Proxy browser calls to the Express backend through the Next.js
    // server itself. The browser only ever talks to its own origin,
    // so CORS / localhost-vs-127.0.0.1 / port mismatches can't break it.
    const backend = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:5000";
    return [
      {
        source: "/backend/:path*",
        destination: `${backend}/:path*`,
      },
    ];
  },
}

export default nextConfig
