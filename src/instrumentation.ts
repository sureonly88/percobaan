/**
 * OpenTelemetry instrumentation for SigNoz APM
 *
 * Next.js loads this file automatically when `instrumentationHook: true`
 * is set in next.config.js. It runs once in the Node.js runtime at startup.
 *
 * Required env vars (set in .env or docker/deployment env):
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — e.g. http://signoz-host:4318
 *   OTEL_SERVICE_NAME             — e.g. pedami-payment
 *   OTEL_SERVICE_VERSION          — optional, e.g. 1.0.0
 *   OTEL_ENVIRONMENT              — optional, e.g. production
 */
export async function register() {
  console.log(`[OTEL] register() called, NEXT_RUNTIME=${process.env.NEXT_RUNTIME}`);

  // Skip edge runtime only; allow undefined (nodejs default in dev)
  if (process.env.NEXT_RUNTIME === "edge") return;

  const endpoint    = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const serviceName = process.env.OTEL_SERVICE_NAME ?? "pedami-payment";

  console.log(`[OTEL] endpoint=${endpoint}, service=${serviceName}`);

  if (!endpoint) {
    console.warn("[OTEL] No OTEL_EXPORTER_OTLP_ENDPOINT set, skipping.");
    return;
  }

  const { NodeSDK }                             = await import("@opentelemetry/sdk-node");
  const { getNodeAutoInstrumentations }         = await import("@opentelemetry/auto-instrumentations-node");
  const { OTLPTraceExporter }                   = await import("@opentelemetry/exporter-trace-otlp-http");
  const { OTLPMetricExporter }                  = await import("@opentelemetry/exporter-metrics-otlp-http");
  const { PeriodicExportingMetricReader }       = await import("@opentelemetry/sdk-metrics");
  const { resourceFromAttributes }              = await import("@opentelemetry/resources");
  const { SEMRESATTRS_SERVICE_NAME,
          SEMRESATTRS_SERVICE_VERSION,
          SEMRESATTRS_DEPLOYMENT_ENVIRONMENT }  = await import("@opentelemetry/semantic-conventions");

  const resource = resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]:            serviceName,
    [SEMRESATTRS_SERVICE_VERSION]:         process.env.OTEL_SERVICE_VERSION  ?? "1.0.0",
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:  process.env.OTEL_ENVIRONMENT      ?? "development",
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${endpoint}/v1/metrics`,
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 30_000, // push metrics every 30s
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Reduce noise — skip fs and DNS auto-tracing
        "@opentelemetry/instrumentation-fs":  { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
        // HTTP instrumentation captures all fetch/axios/http calls
        "@opentelemetry/instrumentation-http": {
          enabled: true,
          // Ignore Next.js internal health-check paths
          ignoreIncomingRequestHook: (req) => {
            const url = req.url ?? "";
            return url.startsWith("/_next/") || url === "/favicon.ico";
          },
        },
      }),
    ],
  });

  sdk.start();

  // Graceful shutdown
  process.on("SIGTERM", () => {
    sdk.shutdown()
      .then(() => console.log("[OTEL] SDK shut down successfully"))
      .catch((err: unknown) => console.error("[OTEL] SDK shutdown error", err));
  });

  console.log(`[OTEL] Tracing started → ${endpoint} (service: ${serviceName})`);
}
