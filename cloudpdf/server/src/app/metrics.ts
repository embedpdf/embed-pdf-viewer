import type { FastifyInstance } from 'fastify';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

import type { EngineCounters } from './engine-counters';
import type { LicenseGate } from '../licensing/LicenseRuntime';
import type { CgroupMemory } from '../runtime/cgroup-memory';
import type { EnginePool } from '../runtime/EnginePool';
import type { LaneStats, SchedulingLane } from '../runtime/SchedulingEnginePool';
import type { CrashJournal } from '../services/CrashJournal';

export interface MetricsOptions {
  pool?: EnginePool | undefined;
  licenseGate: LicenseGate;
  /** Host mode: total engine-host restarts since boot. */
  engineRestarts?: () => number;
  /** Host mode with db: active quarantine count. */
  crashJournal?: CrashJournal;
  /** Host mode: latest child memory heartbeat (protocol v3). */
  engineMemory?: () => { rssBytes: number; heapUsedBytes: number; ageMs: number } | null;
  /** C5 flip instruments (monotonic totals via collect, like restarts). */
  counters?: EngineCounters;
  /** Pod-level working set/limit; provided only when a cgroup is readable. */
  cgroup?: () => CgroupMemory | null;
  /** C1 per-lane admission state. */
  scheduling?: () => Record<SchedulingLane, LaneStats>;
  /** C1 queue-wait observation sink: metrics installs the histogram
   *  observer into this ref; the scheduler calls through it. */
  queueWaitObserver?: { current: ((lane: SchedulingLane, waitMs: number) => void) | null };
  /** C2: completed planned recycles by reason. */
  engineRecycles?: () => Record<string, number>;
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
  if (opts.engineRestarts) {
    const engineRestarts = opts.engineRestarts;
    new Counter({
      name: 'cloudpdf_engine_host_restarts_total',
      help: 'Engine-host respawns since boot (host isolation mode)',
      registers: [register],
      collect() {
        this.reset();
        this.inc(engineRestarts());
      },
    });
  }
  if (opts.engineMemory) {
    const engineMemory = opts.engineMemory;
    new Gauge({
      name: 'cloudpdf_engine_host_rss_bytes',
      help: 'Engine-host child RSS from the protocol-v3 memory heartbeat',
      registers: [register],
      collect() {
        this.set(engineMemory()?.rssBytes ?? 0);
      },
    });
    new Gauge({
      name: 'cloudpdf_engine_host_heap_used_bytes',
      help: 'Engine-host child V8 heapUsed from the memory heartbeat',
      registers: [register],
      collect() {
        this.set(engineMemory()?.heapUsedBytes ?? 0);
      },
    });
    new Gauge({
      name: 'cloudpdf_engine_host_memory_age_seconds',
      help: 'Age of the newest heartbeat for the CURRENT host generation; -1 = no reading yet (booting or respawning) — distinguishes missing from zero RSS',
      registers: [register],
      collect() {
        const m = engineMemory();
        this.set(m ? m.ageMs / 1000 : -1);
      },
    });
  }
  if (opts.counters) {
    const counters = opts.counters;
    new Counter({
      name: 'cloudpdf_layer_write_conflicts_total',
      help: 'Cross-replica layer write races (one per fence-conflict rebase) — the docAffinity flip instrument',
      registers: [register],
      collect() {
        this.reset();
        this.inc(counters.layerWriteConflicts);
      },
    });
    new Counter({
      name: 'cloudpdf_engine_doc_opens_total',
      help: 'COMPLETED engine document opens (base + layer sessions) — cold-open work; sheds and failures are not counted',
      registers: [register],
      collect() {
        this.reset();
        this.inc(counters.docOpens);
      },
    });
  }
  if (opts.cgroup) {
    const cgroup = opts.cgroup;
    new Gauge({
      name: 'cloudpdf_container_memory_working_set_bytes',
      help: "This container's cgroup working set (usage minus reclaimable file cache, kubelet's formula)",
      registers: [register],
      collect() {
        this.set(cgroup()?.workingSetBytes ?? 0);
      },
    });
    new Gauge({
      name: 'cloudpdf_container_memory_limit_bytes',
      help: "This container's cgroup memory limit (0 = unlimited/unknown)",
      registers: [register],
      collect() {
        this.set(cgroup()?.limitBytes ?? 0);
      },
    });
  }
  if (opts.engineRecycles) {
    const engineRecycles = opts.engineRecycles;
    new Counter({
      name: 'cloudpdf_engine_recycles_total',
      help: 'Completed planned engine recycles (rehearsed crashes: no journal strike, no backoff)',
      labelNames: ['reason'],
      registers: [register],
      collect() {
        this.reset();
        for (const [reason, n] of Object.entries(engineRecycles())) this.inc({ reason }, n);
      },
    });
  }
  if (opts.scheduling) {
    const scheduling = opts.scheduling;
    const lanes = ['interactive', 'background'] as const;
    const laneGauge = (name: string, help: string, pick: (s: LaneStats) => number): void => {
      new Gauge({
        name,
        help,
        labelNames: ['lane'],
        registers: [register],
        collect() {
          const stats = scheduling();
          for (const lane of lanes) this.set({ lane }, pick(stats[lane]));
        },
      });
    };
    laneGauge(
      'cloudpdf_engine_queue_depth',
      'Jobs waiting for engine admission',
      (s) => s.queueDepth,
    );
    laneGauge(
      'cloudpdf_engine_lane_in_flight',
      'Dispatched engine jobs per lane',
      (s) => s.inFlight,
    );
    new Counter({
      name: 'cloudpdf_engine_sheds_total',
      help: 'Jobs shed by admission control (queue full, wait timeout, or disabled lane)',
      labelNames: ['lane'],
      registers: [register],
      collect() {
        this.reset();
        const stats = scheduling();
        for (const lane of lanes) this.inc({ lane }, stats[lane].shedsTotal);
      },
    });
    const queueWait = new Histogram({
      name: 'cloudpdf_engine_queue_wait_seconds',
      help: 'Queue wait before dispatch, per DISPATCHED job that waited (sheds/aborts excluded)',
      labelNames: ['lane'],
      buckets: [0.005, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 15],
      registers: [register],
    });
    if (opts.queueWaitObserver) {
      opts.queueWaitObserver.current = (lane, waitMs) => {
        queueWait.observe({ lane }, waitMs / 1000);
      };
    }
  }
  if (opts.crashJournal) {
    const journal = opts.crashJournal;
    new Gauge({
      name: 'cloudpdf_quarantined_documents',
      help: 'Documents currently quarantined by the engine crash journal',
      registers: [register],
      async collect() {
        this.set(await journal.activeQuarantineCount());
      },
    });
  }

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
