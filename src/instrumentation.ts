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

  // NEXT_RUNTIME diganti konstanta saat build, sehingga import di bawah dibuang dari
  // bundel edge (middleware). Undefined tetap dianggap nodejs (dev).
  if (process.env.NEXT_RUNTIME !== "edge") {
    const { registerNodeOtel } = await import("./instrumentation-node");
    await registerNodeOtel();
  }
}
