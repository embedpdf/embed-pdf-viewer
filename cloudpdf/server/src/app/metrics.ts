import type { FastifyInstance } from 'fastify';
import { collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';

import type { LicenseGate } from '../licensing/LicenseRuntime';
import type { WorkerThreadPool } from '../runtime/WorkerThreadPool';

export interface MetricsOptions {
  pool?: WorkerThreadPool | undefined;
  licenseGate: LicenseGate;
}

/**
 * Minimal Prometheus surface, opt-in via `metrics: true`
 * (`CLOUDPDF_METRICS=1`). Deliberately small: default process metrics
 * (CPU, RSS, event loop lag), an HTTP duration histogram labelled by
 * ROUTE PATTERN (never the raw URL — docIds in label values would blow
 * up cardinality), worker-pool occupancy gauges, and the license access
 * level. The route is unauthenticated when enabled — expose it inside
 * the private network / cluster only, like every other /metrics.
 */
export function registerMetrics(app: FastifyInstance, opts: MetricsOptions): void {
  const register = new Registry();
  collectDefaultMetrics({ register });

  const httpDuration = new Histogram({
    name: 'cloudpdf_http_request_duration_seconds',
    help: 'HTTP request duration by route pattern, method, and status code',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
  });

  new Gauge({
    name: 'cloudpdf_worker_pool_slots',
    help: 'Worker threads in the PDFium pool',
    registers: [register],
    collect() {
      this.set(opts.pool ? opts.pool.stats().slots : 0);
    },
  });
  new Gauge({
    name: 'cloudpdf_worker_pool_resident_docs',
    help: 'Documents currently bound to pool slots',
    registers: [register],
    collect() {
      this.set(opts.pool ? opts.pool.stats().docs : 0);
    },
  });
  new Gauge({
    name: 'cloudpdf_worker_pool_in_flight_jobs',
    help: 'Worker jobs currently in flight across all slots',
    registers: [register],
    collect() {
      this.set(opts.pool ? opts.pool.stats().inFlight : 0);
    },
  });
  new Gauge({
    name: 'cloudpdf_license_access',
    help: '1 for the current license access level (label: access)',
    labelNames: ['access'],
    registers: [register],
    collect() {
      this.reset();
      this.set({ access: opts.licenseGate.getStatus().access }, 1);
    },
  });

  app.addHook('onResponse', async (request, reply) => {
    // Route pattern, not request.url: `/v1/docs/:docId/...` keeps the
    // label space bounded; unrouted requests (404s) collapse into one.
    const route = request.routeOptions?.url ?? 'unmatched';
    httpDuration.observe(
      { method: request.method, route, status_code: String(reply.statusCode) },
      reply.elapsedTime / 1000,
    );
  });

  app.get('/metrics', async (_req, reply) => {
    reply.header('content-type', register.contentType);
    return register.metrics();
  });
}
