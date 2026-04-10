// Circuit Breaker — protects the app when external providers are down
// States: CLOSED (normal) → OPEN (blocked) → HALF_OPEN (testing)

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerConfig {
  failureThreshold: number;   // failures before opening
  resetTimeoutMs: number;     // how long to stay OPEN before trying HALF_OPEN
  halfOpenMaxAttempts: number; // test requests in HALF_OPEN before closing
}

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number;
  openedAt: number;
  halfOpenSuccesses: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,     // 30 seconds
  halfOpenMaxAttempts: 2,
};

const circuits = new Map<string, CircuitBreakerState>();
const configs = new Map<string, CircuitBreakerConfig>();

function getState(name: string): CircuitBreakerState {
  let state = circuits.get(name);
  if (!state) {
    state = {
      state: "CLOSED",
      failureCount: 0,
      lastFailureAt: 0,
      openedAt: 0,
      halfOpenSuccesses: 0,
    };
    circuits.set(name, state);
  }
  return state;
}

function getConfig(name: string): CircuitBreakerConfig {
  return configs.get(name) || DEFAULT_CONFIG;
}

export class CircuitOpenError extends Error {
  provider: string;
  retryAfterMs: number;

  constructor(provider: string, retryAfterMs: number) {
    super(`Provider ${provider} sedang gangguan. Coba lagi dalam ${Math.ceil(retryAfterMs / 1000)} detik.`);
    this.name = "CircuitOpenError";
    this.provider = provider;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Configure a circuit breaker for a specific provider.
 */
export function configureCircuitBreaker(name: string, config: Partial<CircuitBreakerConfig>): void {
  configs.set(name, { ...DEFAULT_CONFIG, ...config });
}

/**
 * Check if a request is allowed through the circuit breaker.
 * Throws CircuitOpenError if the circuit is OPEN.
 */
export function checkCircuit(name: string): void {
  const state = getState(name);
  const config = getConfig(name);
  const now = Date.now();

  if (state.state === "CLOSED") return;

  if (state.state === "OPEN") {
    const elapsed = now - state.openedAt;
    if (elapsed >= config.resetTimeoutMs) {
      // Transition to HALF_OPEN
      state.state = "HALF_OPEN";
      state.halfOpenSuccesses = 0;
      return;
    }
    throw new CircuitOpenError(name, config.resetTimeoutMs - elapsed);
  }

  // HALF_OPEN: allow through for testing
}

/**
 * Record a successful call — may close the circuit.
 */
export function recordSuccess(name: string): void {
  const state = getState(name);
  const config = getConfig(name);

  if (state.state === "HALF_OPEN") {
    state.halfOpenSuccesses++;
    if (state.halfOpenSuccesses >= config.halfOpenMaxAttempts) {
      // Circuit recovered
      state.state = "CLOSED";
      state.failureCount = 0;
      state.halfOpenSuccesses = 0;
    }
    return;
  }

  // In CLOSED state, reset failure count on success
  if (state.failureCount > 0) {
    state.failureCount = 0;
  }
}

/**
 * Record a failed call — may open the circuit.
 */
export function recordFailure(name: string): void {
  const state = getState(name);
  const config = getConfig(name);
  const now = Date.now();

  if (state.state === "HALF_OPEN") {
    // Failed during test → back to OPEN
    state.state = "OPEN";
    state.openedAt = now;
    state.halfOpenSuccesses = 0;
    return;
  }

  state.failureCount++;
  state.lastFailureAt = now;

  if (state.failureCount >= config.failureThreshold) {
    state.state = "OPEN";
    state.openedAt = now;
  }
}

/**
 * Get circuit breaker status (for monitoring/logging).
 */
export function getCircuitStatus(name: string): {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number;
} {
  const state = getState(name);
  return {
    state: state.state,
    failureCount: state.failureCount,
    lastFailureAt: state.lastFailureAt,
  };
}
