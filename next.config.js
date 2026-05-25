/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for optimized Docker/Dokploy deployment.
  // Bundles only the files actually used — reduces image size significantly.
  output: "standalone",

  // Hilangkan header `X-Powered-By: Next.js` agar fingerprint framework
  // tidak diumbar ke attacker (OWASP A05 — Security Misconfiguration).
  poweredByHeader: false,

  // Hardening header HTTP global (OWASP A05).
  // Catatan: CSP sengaja sederhana karena UI memakai inline-style/script Next.js;
  //   jika dirilis ke publik, pertimbangkan CSP nonce/strict via middleware.
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    const baseHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
    ];
    if (isProd) {
      baseHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }
    return [
      {
        source: "/:path*",
        headers: baseHeaders,
      },
    ];
  },

  // Enable OpenTelemetry instrumentation (src/instrumentation.ts)
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: [
      "@opentelemetry/sdk-node",
      "@opentelemetry/auto-instrumentations-node",
      "@opentelemetry/exporter-trace-otlp-http",
      "@opentelemetry/exporter-metrics-otlp-http",
      "@opentelemetry/resources",
      "@opentelemetry/semantic-conventions",
      "@opentelemetry/sdk-trace-base",
      "@opentelemetry/sdk-trace-node",
      "@opentelemetry/sdk-metrics",
      "@opentelemetry/api-logs",
      "@opentelemetry/sdk-logs",
      "@opentelemetry/exporter-logs-otlp-http",
    ],
  },

  webpack(config) {
    // Externalize ALL @opentelemetry/* packages so webpack uses Node.js
    // native require() instead of bundling them — avoids gRPC/stream errors.
    const prev = config.externals || [];
    config.externals = [
      ...(Array.isArray(prev) ? prev : [prev]),
      function ({ request }, callback) {
        if (request && request.startsWith("@opentelemetry/")) {
          return callback(null, "commonjs " + request);
        }
        callback();
      },
    ];
    return config;
  },
};

module.exports = nextConfig;
