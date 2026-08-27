import { describe, expect, test } from 'vitest';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';

const TEST_K = Number(process.env['CLOUDPDF_TEST_SHARDS'] ?? '1');

const STUB_ENTRY = new URL('./_helpers/stub-worker-entry.cjs', import.meta.url);
const SECRET = 'metrics-test-secret';

describe('/metrics', () => {
  // Topology-literal (exact slot count / same-worker eviction): the
  // CLOUDPDF_TEST_SHARDS leg tests K-behavior, not single-host mechanics.
  test.skipIf(TEST_K > 1)(
    'enabled: unauthenticated scrape returns our metric families',
    async () => {
      const bundle = await buildAppForTesting({
        licenseGate: createValidTestLicenseGate(),
        verifier: { mode: 'hs256', secret: SECRET },
        workerEntry: STUB_ENTRY,
        poolSize: 1,
        metrics: true,
      });
      try {
        await bundle.app.inject({ method: 'GET', url: '/healthz' }); // seed the histogram
        const res = await bundle.app.inject({ method: 'GET', url: '/metrics' });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/plain');
        expect(res.body).toContain('cloudpdf_http_request_duration_seconds');
        expect(res.body).toContain('route="/healthz"'); // route PATTERN labels, seeded above
        expect(res.body).toContain('cloudpdf_worker_pool_slots 1');
        expect(res.body).toContain('cloudpdf_license_access{access=');
        expect(res.body).toContain('process_cpu_user_seconds_total'); // default process metrics
      } finally {
        await bundle.shutdown();
      }
    },
  );

  test('disabled (default): /metrics is not public and not routed', async () => {
    const bundle = await buildAppForTesting({
      licenseGate: createValidTestLicenseGate(),
      verifier: { mode: 'hs256', secret: SECRET },
      workerEntry: STUB_ENTRY,
      poolSize: 1,
    });
    try {
      const res = await bundle.app.inject({ method: 'GET', url: '/metrics' });
      expect(res.statusCode).toBe(401); // auth wall — no metrics surface exists
    } finally {
      await bundle.shutdown();
    }
  });
});
