import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudEngine } from '@cloudpdf/engine';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildAppForTesting } from '../../server/src/app/buildApp';
import { createValidTestLicenseGate } from '../../server/src/licensing/testing';
import { decodePageKey, defineServerModule, EngineError, EngineErrorCode } from '../src/index';
import {
  launchTestServer,
  type TestDocument,
  type TestLicense,
  type TestServer,
} from '../src/test-server';
import { startTestServer } from '../src/testing';

/**
 * The test server a module author starts from `@cloudpdf/server-modules/testing`.
 * Here it runs on the server's test gate, so it needs no license key; the
 * public `startTestServer` runs it on a development key, checked last.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE = resolve(here, '../../../examples/engine-runtime-demo/public/sample.pdf');

/** Stamps a page as the caller, and says who asked, where, with which label. */
const stamp = defineServerModule({
  id: 'stamp',
  permissions: { add: { level: 'document', label: 'Stamp pages' } },
  config: { LABEL: { description: 'What the stamp says' } },
  setup(host, config) {
    host.docRoute({
      method: 'POST',
      path: 'pages/:page',
      permission: 'add',
      async handler(req) {
        const ref = decodePageKey(req.params['page']!);
        if (!ref) throw new EngineError(EngineErrorCode.InvalidArg, 'not a page key');
        const doc = await req.document();
        await doc.page(ref).annotations.create({
          subtype: 'square',
          box: { x: 20, y: 20, width: 120, height: 40 },
        });
        return {
          type: 'application/json',
          body: JSON.stringify({ label: config.LABEL, sub: req.session.sub, layer: req.layerName }),
        };
      },
    });
  },
});

/** The server's test gate, through its internal seam: no key needed. */
const testGate = (): Promise<TestLicense> =>
  Promise.resolve({
    build: (app) => buildAppForTesting({ ...app, licenseGate: createValidTestLicenseGate() }),
    close: async () => {},
  });

const STAMPER = ['doc.open', 'stamp.add', 'doc.annotate.read', 'doc.annotate.modify'];

describe('a test server', () => {
  let server: TestServer;
  let doc: TestDocument;

  beforeAll(async () => {
    server = await launchTestServer(
      { modules: [stamp], env: { CLOUDPDF_STAMP_LABEL: 'approved' } },
      testGate,
    );
    doc = await server.addDocument(await readFile(SAMPLE), { name: 'sample.pdf' });
  });

  afterAll(() => server?.close());

  test('listens on 127.0.0.1 and holds an uploaded document, ready', () => {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(doc.layerName).toBe('default');
    expect(doc.pages.length).toBeGreaterThan(0);
    expect(doc.pages.every((page) => decodePageKey(page) !== null)).toBe(true);
  });

  test("calls a module's route as a viewer holding exactly the scope", async () => {
    const response = await server.fetch(doc, `stamp/pages/${doc.pages[0]}`, {
      method: 'POST',
      scope: STAMPER,
      sub: 'reviewer-7',
    });
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toEqual({
      label: 'approved',
      sub: 'reviewer-7',
      layer: 'default',
    });

    const anonymous = await server.fetch(doc, `stamp/pages/${doc.pages[0]}`, {
      method: 'POST',
      scope: STAMPER,
    });
    expect(((await anonymous.json()) as { sub: string }).sub).toBe('test-user');
  });

  test('the server checks the scope: the permission, and what the caller may change', async () => {
    const path = `stamp/pages/${doc.pages[0]}`;
    const noPermission = STAMPER.filter((scope) => scope !== 'stamp.add');
    expect((await server.fetch(doc, path, { method: 'POST', scope: noPermission })).status).toBe(
      403,
    );
    const readOnly = STAMPER.filter((scope) => scope !== 'doc.annotate.modify');
    expect((await server.fetch(doc, path, { method: 'POST', scope: readOnly })).status).toBe(403);
  });

  test("the deployment's API token opens no document session", async () => {
    const response = await server.fetch(doc, `stamp/pages/${doc.pages[0]}`, {
      method: 'POST',
      token: server.apiToken,
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { message: string } }).error.message).toMatch(
      /deployment's API token/,
    );
  });

  test('token() opens the document on the cloud engine, to see what a module changed', async () => {
    await server.fetch(doc, `stamp/pages/${doc.pages[0]}`, { method: 'POST', scope: STAMPER });
    const engine = cloudEngine({ baseUrl: server.url, visitorStore: null, cdn: false });
    try {
      const opened = await engine.open({
        kind: 'id',
        id: doc.id,
        layerName: doc.layerName,
        token: () => server.token(doc, ['doc.open', 'doc.annotate.read']),
      });
      const { annotations } = await opened.page(decodePageKey(doc.pages[0]!)!).annotations.list();
      expect(annotations.some((annotation) => annotation.subtype === 'square')).toBe(true);
    } finally {
      await engine.destroy();
    }
  });

  test('another layer of the document', async () => {
    const review = { ...doc, layerName: 'review' };
    const response = await server.fetch(review, `stamp/pages/${doc.pages[0]}`, {
      method: 'POST',
      scope: STAMPER,
    });
    expect(response.status, await response.clone().text()).toBe(200);
    expect(((await response.json()) as { layer: string }).layer).toBe('review');
  });
});

describe('starting one', () => {
  test("its modules' settings come from env alone, and a missing one stops it", async () => {
    process.env['CLOUDPDF_STAMP_LABEL'] = 'from the shell';
    try {
      await expect(launchTestServer({ modules: [stamp] }, testGate)).rejects.toThrow(
        /CLOUDPDF_STAMP_LABEL/,
      );
    } finally {
      delete process.env['CLOUDPDF_STAMP_LABEL'];
    }
  });

  test('close() stops it, and closing again is a no-op', async () => {
    const server = await launchTestServer(
      { modules: [stamp], env: { CLOUDPDF_STAMP_LABEL: 'x' } },
      testGate,
    );
    expect((await fetch(`${server.url}/healthz`)).ok).toBe(true);
    await server.close();
    await expect(fetch(`${server.url}/healthz`)).rejects.toThrow();
    await server.close();
  });

  test('startTestServer needs a license key', async () => {
    await expect(startTestServer({ modules: [stamp], licenseKey: '' })).rejects.toThrow(
      /CLOUDPDF_LICENSE_KEY/,
    );
  });
});

// The public path, licensed like any deployment: runs where a development key is set.
describe.skipIf(!process.env['CLOUDPDF_LICENSE_KEY'])(
  'startTestServer, on a development key',
  () => {
    let server: TestServer;

    beforeAll(async () => {
      server = await startTestServer({
        modules: [stamp],
        env: { CLOUDPDF_STAMP_LABEL: 'licensed' },
      });
    });

    afterAll(() => server?.close());

    test('mounts the module in a real server', async () => {
      const doc = await server.addDocument(await readFile(SAMPLE));
      const response = await server.fetch(doc, `stamp/pages/${doc.pages[0]}`, {
        method: 'POST',
        scope: STAMPER,
      });
      expect(response.status, await response.clone().text()).toBe(200);
      expect(((await response.json()) as { label: string }).label).toBe('licensed');
    });
  },
);
