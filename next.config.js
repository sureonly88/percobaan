/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for optimized Docker/Dokploy deployment.
  // Bundles only the files actually used — reduces image size significantly.
  output: "standalone",

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
