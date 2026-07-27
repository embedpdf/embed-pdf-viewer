import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { snapViewportToPolicy } from '@embedpdf/engine-core/runtime';
import { createCloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'annotations.pdf',
);

const TENANT_ID = 'cloud-render-policy-tenant';
const DOC_ID = 'render-policy-doc';

let fx: DbSeededFixture | undefined;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-render-policy-secret' });
  await seedDocumentFromBytes(fx, TENANT_ID, DOC_ID, fixturePath, 1);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

describe('doc.render.policy (cloud)', () => {
  test('advertised lattice reaches the handle; snap conforms to it', async () => {
    const engine = createCloudEngine({
      baseUrl: fx!.baseUrl,
      token: docScopedToken(fx!, TENANT_ID, DOC_ID),
    });
    const doc = await engine.open({ kind: 'id', id: DOC_ID });
    try {
      expect(doc.render).toBeDefined();
      const policy = await doc.render!.policy();
      // The deployment default (SCALE-OUT §2.1b): a full-page WIDTH ladder
      // — the bounded quantity is output pixels, never zoom — with the
      // tiles block reserved-absent until WS2c, unenforced until the
      // client stack ships snap everywhere.
      expect(policy).toEqual({
        kind: 'lattice',
        fullPage: { widths: [320, 640, 1280, 2560] },
        maxRenderPixels: 32_000_000,
        formats: ['webp'],
        background: 'white',
        enforced: false,
      });

      // The ONE snap implementation conforms a scale-shaped request to
      // the canonical width axis using the page's width: 2x on a 612pt
      // page needs 1224px -> ladder 1280.
      const snapped = snapViewportToPolicy(policy, { kind: 'scale', scale: 2 }, { pageWidth: 612 });
      expect(snapped).toEqual({ kind: 'width', width: 1280 });

      // Policy reads are cached-access reads after the first call — no
      // extra handshake shape; calling again is cheap and identical.
      expect(await doc.render!.policy()).toEqual(policy);
    } finally {
      await doc.close();
    }
  });
});
