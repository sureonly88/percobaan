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
  const { OTLPLogExporter }                     = await import("@opentelemetry/exporter-logs-otlp-http");
  const { PeriodicExportingMetricReader }       = await import("@opentelemetry/sdk-metrics");
  const { LoggerProvider, BatchLogRecordProcessor } = await import("@opentelemetry/sdk-logs");
  const { SeverityNumber }                          = await import("@opentelemetry/api-logs");
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

  // --- Log exporter: intercept console.* dan kirim ke SigNoz ---
  const logExporter = new OTLPLogExporter({
    url: `${endpoint}/v1/logs`,
  });

  const loggerProvider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor(logExporter)],
  });

  const otelLogger = loggerProvider.getLogger(serviceName, "1.0.0");

  const emitLog = (severity: number, severityText: string, args: unknown[]) => {
    const body = args
      .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
      .join(" ");
    otelLogger.emit({ severityNumber: severity, severityText, body, attributes: {} });
  };

  const orig = {
    log:   console.log.bind(console),
    info:  console.info.bind(console),
    warn:  console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  console.log   = (...a) => { emitLog(SeverityNumber.INFO,  "INFO",  a); orig.log(...a);   };
  console.info  = (...a) => { emitLog(SeverityNumber.INFO,  "INFO",  a); orig.info(...a);  };
  console.warn  = (...a) => { emitLog(SeverityNumber.WARN,  "WARN",  a); orig.warn(...a);  };
  console.error = (...a) => { emitLog(SeverityNumber.ERROR, "ERROR", a); orig.error(...a); };
  console.debug = (...a) => { emitLog(SeverityNumber.DEBUG, "DEBUG", a); orig.debug(...a); };
  // --- end log exporter ---

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
    Promise.all([sdk.shutdown(), loggerProvider.shutdown()])
      .then(() => orig.log("[OTEL] SDK shut down successfully"))
      .catch((err: unknown) => orig.error("[OTEL] SDK shutdown error", err));
  });

  console.log(`[OTEL] Tracing + Logs started → ${endpoint} (service: ${serviceName})`);
}
