import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { API_VERSION, parseApiVersion } from '@embedpdf/engine-core/wire';
import type { AppBundle } from '../src/index';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';

const STUB_ENTRY = new URL('./_helpers/stub-worker-entry.cjs', import.meta.url);
const ORIGIN = 'https://acme.example';
const { major, minor } = parseApiVersion(API_VERSION)!;

let bundle: AppBundle;

beforeAll(async () => {
  bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: 'api-version-secret' },
    workerEntry: STUB_ENTRY,
    poolSize: 1,
    corsOrigins: [ORIGIN],
  });
});

afterAll(async () => {
  await bundle?.shutdown();
});

const get = (url: string, headers: Record<string, string> = {}) =>
  bundle.app.inject({ method: 'GET', url, headers });

/**
 * Every response says which version the server is; a request that says which
 * version its client speaks is answered within the server's major and refused
 * outside it (`docs/conventions/api-evolution.md`).
 */
describe('version headers', () => {
  test('every response names the server version, refusals included', async () => {
    for (const res of [
      await get('/healthz'),
      await get('/v1/docs/some-doc/head'),
      await get('/v1/no-such-route'),
    ]) {
      expect(res.headers['embedpdf-server-version']).toBe(API_VERSION);
    }
  });

  test('a request without a version, or with one of the same major, is answered', async () => {
    for (const sent of [undefined, API_VERSION, `${major}.${minor + 7}`, `${major}.0`]) {
      const res = await get('/healthz', sent === undefined ? {} : { 'EmbedPDF-Version': sent });
      expect(res.statusCode).toBe(200);
    }
  });

  test('another major, or a version that is not <major>.<minor>, is refused', async () => {
    for (const sent of [`${major + 1}.0`, `${major - 1}.9`, '3', '3.0.1', 'latest']) {
      const res = await get('/healthz', { 'EmbedPDF-Version': sent });
      expect(res.statusCode).toBe(400);
      expect(res.headers['embedpdf-server-version']).toBe(API_VERSION);
      const { error } = res.json() as { error: { code: string; message: string } };
      expect(error.code).toBe('InvalidArg');
      expect(error.message).toContain(sent);
      expect(error.message).toContain(API_VERSION);
    }
  });

  test('a browser may send the version and read the server version and engine value', async () => {
    const preflight = await bundle.app.inject({
      method: 'OPTIONS',
      url: '/v1/docs/some-doc/head',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization,embedpdf-version',
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-headers']).toContain('embedpdf-version');

    const res = await get('/healthz', { origin: ORIGIN, 'EmbedPDF-Version': API_VERSION });
    const exposed = String(res.headers['access-control-expose-headers']).split(/,\s*/);
    expect(exposed).toContain('embedpdf-server-version');
    expect(exposed).toContain('embedpdf-engine');
  });
});
