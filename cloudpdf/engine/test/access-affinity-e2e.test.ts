import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createCloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  tenantToken,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

/**
 * End-to-end against a REAL server: the doc-scoped access bootstrap
 * (`POST /v1/docs/:docId/access`) through the real client flow, with the
 * opt-in affinity header observed on the wire — closing the loop the
 * plan promised (real routes, real handler, real client code path; the
 * transport retry semantics have their own scripted-fetch suite).
 */

const here = dirname(fileURLToPath(import.meta.url));
const resources = resolve(here, '..', '..', '..', 'packages', 'engine', 'main', 'test', 'fixtures');
const TENANT_ID = 'access-e2e-tenant';
const DOC_ID = 'accesse2edoc';

describe('doc-scoped access + affinity header (real server)', () => {
  let fx: DbSeededFixture;
  beforeAll(async () => {
    fx = await buildDbSeededFixture();
    await seedDocumentFromBytes(fx, TENANT_ID, DOC_ID, resolve(resources, 'hello_world.pdf'), 1);
  });
  afterAll(async () => {
    await teardownDbSeededFixture(fx);
  });

  test('unlock rides the NEW path, carries X-CloudPDF-Doc, and succeeds', async () => {
    const seen: Array<{ url: string; doc: string | null }> = [];
    const capturingFetch: typeof globalThis.fetch = async (url, init) => {
      seen.push({
        url: String(url),
        doc: new Headers(init?.headers).get('x-cloudpdf-doc'),
      });
      return globalThis.fetch(url, init);
    };
    const engine = createCloudEngine({
      baseUrl: fx.baseUrl,
      token: tenantToken(fx, TENANT_ID),
      fetch: capturingFetch,
      docAffinityHeader: true,
    });
    const doc = await engine.open({ kind: 'id', id: DOC_ID });
    const unlocked = await doc.security.unlock({ mode: 'any' });
    // The seeded doc's probe state is 'unknown' (no security seed here) —
    // the meaningful assertions are the route, the header, and success.
    expect(unlocked.security.encryption).toBeDefined();

    const accessCall = seen.find((c) => c.url.endsWith('/access'));
    expect(accessCall).toBeDefined();
    // The NEW grammar: docId in the path, no legacy /v1/access.
    expect(accessCall!.url).toContain(`/v1/docs/${DOC_ID}/access`);
    // And the affinity key rides it — the session bootstrap pins to the
    // document's pod from the very first request.
    expect(accessCall!.doc).toBe(DOC_ID);
    // Every doc-scoped call in the flow carried the key.
    for (const c of seen) {
      if (c.url.includes(`/v1/docs/${DOC_ID}/`)) expect(c.doc).toBe(DOC_ID);
    }
    await doc.close();
    await engine.destroy?.();
  }, 30_000);
});
