import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  createSqliteDb,
  CustomHmacCdnSigner,
  defaultWorkerEntryUrl,
  FsObjectStore,
  migrate,
  signDevToken,
  sqliteMigrations,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '@cloudpdf/server';
import { buildAppForTesting } from '../../server/src/app/buildApp';
import { createValidTestLicenseGate } from '../../server/src/licensing/testing';
import {
  decodePageKey,
  defineServerModule,
  EngineError,
  EngineErrorCode,
  type ModuleResponse,
  type RawPageRenderService,
} from '../src/index';

/**
 * Modules written with the kit, mounted in a real server with the native
 * engine: each request reaches the document through the engine's document
 * API, as the caller with exactly their permissions, and as the module with
 * what `requires.document` lists.
 */

const json = (value: unknown): ModuleResponse => ({
  type: 'application/json',
  body: JSON.stringify(value),
});

/** Acts only as the person using it. */
const review = defineServerModule({
  id: 'review',
  permissions: { approve: { level: 'document', label: 'Approve documents' } },
  setup(host) {
    host.docRoute({
      method: 'POST',
      path: 'approve',
      permission: 'approve',
      async handler(req) {
        const doc = await req.document();
        const { pages } = await doc.pages.list();
        const page = doc.page(pages[0]!.ref);
        await page.annotations.create({
          subtype: 'square',
          box: { x: 20, y: 20, width: 120, height: 40 },
        });
        const { annotations } = await page.annotations.list();
        return json({ annotations: annotations.length });
      },
    });
  },
});

/** Reads text its askers may only look at. */
const reader = defineServerModule({
  id: 'reader',
  permissions: { ask: { level: 'document', label: 'Ask about the document' } },
  requires: { document: ['doc.text.copy'] },
  setup(host) {
    host.docRoute({
      method: 'GET',
      path: 'text/:as',
      permission: 'ask',
      async handler(req) {
        const doc =
          req.params['as'] === 'module' ? await req.module.document() : await req.document();
        const { pages } = await doc.pages.list();
        const { text } = await doc.page(pages[0]!.ref).text.get();
        return json({ chars: text.length });
      },
    });
  },
});

/** Draws pages its viewers may not render. */
const frames = defineServerModule({
  id: 'frames',
  permissions: { view: { level: 'document', label: 'See protected pages' } },
  requires: { document: ['doc.render'] },
  config: { WIDTH: { description: 'Frame width in pixels', default: '320' } },
  setup(host, config) {
    host.docRoute({
      method: 'GET',
      path: 'pages/:page/:as',
      permission: 'view',
      async handler(req) {
        const ref = decodePageKey(req.params['page']!);
        if (!ref) throw new EngineError(EngineErrorCode.InvalidArg, 'not a page key');
        const viewport = { kind: 'width', width: Number(config.WIDTH) } as const;
        if (req.params['as'] === 'caller') {
          // The caller's handle is the cloud engine's as any client has it: no raw pixels.
          const doc = await req.document();
          await (doc.page(ref).render as RawPageRenderService).raw({ viewport });
        }
        const doc = await req.module.document();
        const pixels = await doc.page(ref).render.raw({ viewport });
        return json({
          width: pixels.width,
          bytes: pixels.data.byteLength,
          transform: [pixels.transform.width, pixels.transform.height],
        });
      },
    });
  },
});

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE = resolve(here, '../../../examples/engine-runtime-demo/public/sample.pdf');
const SECRET = 'server-modules-kit-secret';
const API_TOKEN = 'server-modules-kit-root-token';
const TENANT = 'kit-tenant';
const DOC = 'kit-doc';
const LAYER = 'default';

let bundle: AppBundle;
let db: Kysely<DbSchema>;
let baseUrl: string;
let roots: string[] = [];

beforeAll(async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'kit-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'kit-cache-'));
  roots = [storageRoot, cacheRoot];
  db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    apiAuthTokens: [API_TOKEN],
    modules: [review, reader, frames],
    moduleEnv: {},
    workerEntry: defaultWorkerEntryUrl,
    // As on the SaaS: a CDN in front, whose credentials /access hands out.
    cdnSigner: new CustomHmacCdnSigner({
      secret: 'kit-cdn-secret',
      cdnOrigin: 'https://cdn.kit.test',
      transport: 'query',
    }),
    poolSize: 1,
    db,
    objectStore: new FsObjectStore({ root: storageRoot }),
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 4 * 1024 * 1024,
  });
  const address = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  baseUrl = typeof address === 'string' ? address : `http://127.0.0.1:${address}`;

  const bytes = new Uint8Array(await readFile(SAMPLE));
  await new FsObjectStore({ root: storageRoot }).put(StorageKeys.basePdf(TENANT, DOC), bytes, {
    contentLength: bytes.byteLength,
  });
  await db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
  const now = Date.now();
  await db
    .insertInto('documents')
    .values({
      id: DOC,
      tenant_id: TENANT,
      state: 'ready',
      base_sha: createHash('sha256').update(bytes).digest('hex'),
      storage_size_bytes: bytes.byteLength,
      metadata_json: null,
      idempotency_key: null,
      failure_reason: null,
      created_at: now,
      updated_at: now,
      created_by: null,
    })
    .execute();
});

afterAll(async () => {
  await bundle?.shutdown();
  await db?.destroy();
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

function call(path: string, scope: string[] | 'api-token', method = 'GET'): Promise<Response> {
  const bearer =
    scope === 'api-token'
      ? API_TOKEN
      : signDevToken(SECRET, {
          sub: 'reviewer-1',
          tenant_id: TENANT,
          doc_id: DOC,
          layer_name: LAYER,
          scope,
          jti: `jti-${randomBytes(8).toString('hex')}`,
        });
  return fetch(`${baseUrl}/v1/docs/${DOC}/layers/${LAYER}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${bearer}` },
  });
}

describe('req.document() acts as the caller', () => {
  test('a change goes in with their permissions', async () => {
    const scope = ['doc.open', 'review.approve', 'doc.annotate.read', 'doc.annotate.modify'];
    const response = await call('review/approve', scope, 'POST');
    expect(response.status, await response.clone().text()).toBe(200);
    expect(((await response.json()) as { annotations: number }).annotations).toBeGreaterThan(0);
  });

  test("and is refused when it isn't theirs to make", async () => {
    const response = await call(
      'review/approve',
      ['doc.open', 'review.approve', 'doc.annotate.read'],
      'POST',
    );
    expect(response.status, await response.clone().text()).toBe(403);
  });

  test("the deployment's API token opens no session to act as", async () => {
    const response = await call('review/approve', 'api-token', 'POST');
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { message: string } }).error.message).toMatch(
      /deployment's API token/,
    );
  });
});

describe('req.module acts as the module, with what it requires', () => {
  const asker = ['doc.open', 'doc.text.select', 'reader.ask'];

  test('it reads text the caller may only look at', async () => {
    expect((await call('reader/text/caller', asker)).status).toBe(403);
    const response = await call('reader/text/module', asker);
    expect(response.status, await response.clone().text()).toBe(200);
    expect(((await response.json()) as { chars: number }).chars).toBeGreaterThan(0);
  });

  test('its pages draw raw pixels its viewer may not render', async () => {
    const manifest = await call('manifest', ['doc.open']);
    const { pages } = (await manifest.json()) as {
      pages: Array<{ page: { objectNumber: number } }>;
    };
    const page = `obj:${pages[0]!.page.objectNumber}`;
    const viewer = ['doc.open', 'frames.view'];

    const response = await call(`frames/pages/${page}/module`, viewer);
    expect(response.status, await response.clone().text()).toBe(200);
    const drawn = (await response.json()) as { width: number; bytes: number; transform: number[] };
    expect(drawn.width).toBe(320);
    expect(drawn.bytes % (320 * 4)).toBe(0); // whole rows of RGBA
    expect(drawn.transform[0]).toBe(320); // the pixels' map to the page comes with them

    // The caller's own handle has no raw pixels, whatever it holds.
    const asCaller = await call(`frames/pages/${page}/caller`, [...viewer, 'doc.render']);
    expect(asCaller.status).toBe(501);

    expect((await call('frames/pages/obj:999999/module', viewer)).status).toBe(404);
  });
});

describe('with a CDN in front', () => {
  test('the server offers it, and module handles read from the server itself', async () => {
    const head = (await (await call('head', ['doc.open'])).json()) as {
      access: { reasons: string[] };
    };
    expect(head.access.reasons).toContain('cdn');
    // Every test above opened handles on this server: each read reached the
    // server itself, since the in-process connection refuses any other host.
    const response = await call('reader/text/module', ['doc.open', 'reader.ask']);
    expect(response.status, await response.clone().text()).toBe(200);
  });
});
