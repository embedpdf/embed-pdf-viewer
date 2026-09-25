/**
 * `engine.destroy()` closes every document the cloud engine opened, as the
 * local engine's does: their calls fail with `DocNotOpen` and their event
 * streams stop.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { cloudEngine, EngineError, EngineErrorCode } from '../src/index';
import {
  buildDbSeededFixture,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  tenantToken,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const here = dirname(fileURLToPath(import.meta.url));
const samplePath = resolve(
  here,
  '..',
  '..',
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'sample.pdf',
);
const TENANT_ID = 'cloud-destroy-tenant';

let fx: DbSeededFixture | undefined;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-destroy-secret' });
  await seedDocumentFromBytes(fx, TENANT_ID, 'destroy-a', samplePath, 8);
  await seedDocumentFromBytes(fx, TENANT_ID, 'destroy-b', samplePath, 8);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

describe('cloud engine.destroy()', () => {
  test('closes the documents it opened, listening or not', async () => {
    if (!fx) throw new Error('fixture not initialised');
    const engine = cloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
    const a = await engine.open({ kind: 'id', id: 'destroy-a' });
    const b = await engine.open({ kind: 'id', id: 'destroy-b' });
    const stop = a.events.subscribe(() => {}); // opens a's event stream
    expect((await a.pages.list()).pageCount).toBe(8);

    await engine.destroy();

    for (const doc of [a, b]) {
      const error = await doc.pages.list().then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(EngineError.is(error, EngineErrorCode.DocNotOpen)).toBe(true);
    }
    stop();
    const reopen = await engine.open({ kind: 'id', id: 'destroy-a' }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(EngineError.is(reopen, EngineErrorCode.RuntimeUnavailable)).toBe(true);
  });

  test('a document closed before destroy stays closed, once', async () => {
    if (!fx) throw new Error('fixture not initialised');
    const engine = cloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
    const doc = await engine.open({ kind: 'id', id: 'destroy-a' });
    await doc.close();
    await engine.destroy();
    await doc.close(); // idempotent
  });
});
