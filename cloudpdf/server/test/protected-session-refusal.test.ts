import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import {
  createSqliteDb,
  FsObjectStore,
  migrate,
  signDevToken,
  sqliteMigrations,
  StaticKmsKeyring,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '../src/index';
import { encodeSearchToken } from '@embedpdf/engine-core/wire';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';

/**
 * The guarantee screenshot protection rests on: a session without
 * `doc.render`, `doc.text.copy`, `doc.download` and `doc.print` gets none of
 * the page's pixels, none of its text and none of the document's bytes from
 * any route. Every document route the server mounts is classified below; a
 * new route joins the table or fails this test.
 *
 * What a protected session still gets, on purpose: annotations and form
 * fields with their appearance images (people's markup, drawn in the overlay
 * above the frames), glyph boxes without characters, search hit rectangles,
 * and what opening and following a document needs.
 */

type Category =
  /** The page's pixels or text, or the document's bytes: refused. */
  | 'page'
  /** Annotations and form fields, with their appearance images: the overlay. */
  | 'overlay'
  /** Opening and following the document: access, manifests, events, positions. */
  | 'session'
  /** Changes: their own write permissions decide. */
  | 'write';

/** First match wins. Patterns are written against the route with `/v1/docs/:docId` cut off. */
const RULES: ReadonlyArray<readonly [method: string, pattern: RegExp, Category]> = [
  // The page itself.
  ['GET', /^(\/layers\/:layerName)?\/render\//, 'page'],
  ['GET', /^(\/layers\/:layerName)?\/text\/pages\//, 'page'],
  ['GET', /^\/layers\/:layerName\/search\/full\//, 'page'],
  // The document's bytes.
  ['GET', /^\/layers\/:layerName\/download(@:token)?$/, 'page'],
  ['POST', /^\/layers\/:layerName\/download-link$/, 'page'],
  ['GET', /^\/layers\/:layerName\/versions\/(download|revisions)\//, 'page'],
  ['POST', /^\/layers\/:layerName\/pages\/extract$/, 'page'],
  ['GET', /^(\/layers\/:layerName)?\/attachment-files\//, 'page'],
  ['GET', /^(\/layers\/:layerName)?\/(annotations|form)\/export@:token$/, 'page'],
  ['POST', /^\/layers\/:layerName\/(annotations|form)\/export$/, 'page'],
  ['POST', /^\/layers\/:layerName\/annotations\/pages\/:pageKey\/items\/appearance$/, 'page'],
  [
    'GET',
    /^\/layers\/:layerName\/annotations\/pages\/:pageKey\/items\/:annotKey\/resources\//,
    'page',
  ],
  // The overlay.
  ['GET', /^(\/layers\/:layerName)?\/annotations\//, 'overlay'],
  ['GET', /^(\/layers\/:layerName)?\/form(@:token|\/pages\/|\/fields\/:fieldKey$|$)/, 'overlay'],
  // Opening and following the document.
  ['POST', /^(\/layers\/:layerName)?\/access$/, 'session'],
  [
    'GET',
    /^(\/layers\/:layerName)?\/(head|manifest|layout|metadata|outline|actions|attachments)(@:token|\/custom(@:token)?)?$/,
    'session',
  ],
  ['GET', /^(\/layers\/:layerName)?\/geometry\/pages\//, 'session'],
  ['GET', /^\/layers\/:layerName\/search\/rects\//, 'session'],
  ['GET', /^\/layers\/:layerName\/(events|signatures(@:token|\/analysis(@:token)?)?)$/, 'session'],
  ['GET', /^\/layers\/:layerName\/versions(\/signatures\/|\/analysis\/|$)/, 'session'],
  ['GET', /^\/layers\/:layerName\/pages\/:pageKey\/viewports$/, 'session'],
  ['POST', /^\/layers\/:layerName\/object-numbers$/, 'session'],
  // Everything that changes the document.
  ['POST', /./, 'write'],
  ['PATCH', /./, 'write'],
  ['PUT', /./, 'write'],
  ['DELETE', /./, 'write'],
];

const SECRET = 'protected-refusal-secret';
const API_TOKEN = 'protected-refusal-root';
const TENANT = 'protected-t';
const DOC = 'docprotected1';
const LAYER = 'default';
const PROTECTED_SCOPE = [
  'doc.open',
  'doc.text.select',
  'doc.text.search',
  'doc.annotate.read',
  'doc.forms.read',
  'protected-display.view',
];

let bundle: AppBundle;
let db: Kysely<DbSchema>;
let baseUrl: string;
let roots: string[] = [];

beforeAll(async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'protected-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'protected-cache-'));
  roots = [storageRoot, cacheRoot];
  db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    apiAuthTokens: [API_TOKEN],
    // The plugin's permission, declared by its module; the frames themselves aren't needed here.
    modules: [
      {
        id: 'protected-display',
        permissions: {
          view: { level: 'document', label: 'See pages with screenshot protection' },
        },
        setup() {},
      },
    ],
    workerEntry: new URL('./_helpers/stub-worker-entry.cjs', import.meta.url),
    poolSize: 1,
    db,
    objectStore: new FsObjectStore({ root: storageRoot }),
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 1024 * 1024,
    kms: new StaticKmsKeyring({ keyId: 'protected-kek', kek: Buffer.alloc(32, 7) }),
  });
  const address = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  baseUrl = typeof address === 'string' ? address : `http://127.0.0.1:${address}`;
  await seedDocument(storageRoot);
});

afterAll(async () => {
  await bundle?.shutdown();
  await db?.destroy();
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function seedDocument(storageRoot: string): Promise<void> {
  const bytes = new Uint8Array(4096);
  bytes[0] = 3; // the stub worker reads its page count from the first byte
  bytes.set(randomBytes(4095), 1);
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
}

function token(scope: string[]): string {
  return signDevToken(SECRET, {
    sub: 'viewer-1',
    tenant_id: TENANT,
    doc_id: DOC,
    layer_name: LAYER,
    scope,
    jti: `jti-${randomBytes(8).toString('hex')}`,
  });
}

interface DocRoute {
  readonly method: string;
  /** The route below `/v1/docs/:docId`. */
  readonly path: string;
}

function documentRoutes(): DocRoute[] {
  const seen = new Set<string>();
  const out: DocRoute[] = [];
  for (const route of bundle.routes) {
    if (route.method === 'HEAD' || !route.url.startsWith('/v1/docs/:docId/')) continue;
    const path = route.url.slice('/v1/docs/:docId'.length);
    const key = `${route.method} ${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ method: route.method, path });
  }
  return out;
}

function categoryOf(route: DocRoute): Category | null {
  for (const [method, pattern, category] of RULES) {
    if (method === route.method && pattern.test(route.path)) return category;
  }
  return null;
}

/**
 * Requests some routes must get right before they reach their permission
 * check: what to search for, which pages to extract.
 */
const REQUESTS: Readonly<Record<string, { token?: string; query?: string; body?: unknown }>> = {
  'GET /layers/:layerName/search/full/data@:token': {
    token: encodeSearchToken({ epoch: '1', query: { text: 'confidential' }, skip: 0 }),
  },
  'GET /layers/:layerName/search/full/data': { query: '?q=confidential' },
  'POST /layers/:layerName/pages/extract': {
    body: { pages: [{ kind: 'objectNumber', objectNumber: 1 }] },
  },
};

/** A concrete URL for a route: every parameter filled with a value the route can parse. */
function urlOf(route: DocRoute): string {
  const request = REQUESTS[`${route.method} ${route.path}`];
  const path = route.path
    .replace(':layerName', LAYER)
    .replace(':pageKey', 'obj:1')
    .replace(':annotKey', 'obj:9')
    .replace(':fileKey', 'f1')
    .replace(':fieldKey', 'obj:9')
    .replace(':sha', 'a'.repeat(64))
    .replace(':index', '0')
    .replace(':signingId', 'sig1')
    .replace(':algorithm', 'sha256')
    .replace(':token', request?.token ?? 'contentVersion=1');
  return `${baseUrl}/v1/docs/${DOC}${path}${request?.query ?? ''}`;
}

async function call(route: DocRoute, scope: string[]): Promise<Response> {
  const request = REQUESTS[`${route.method} ${route.path}`];
  const body =
    route.method === 'GET' || route.method === 'DELETE'
      ? undefined
      : JSON.stringify(request?.body ?? {});
  return fetch(urlOf(route), {
    method: route.method,
    headers: {
      Authorization: `Bearer ${token(scope)}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body } : {}),
  });
}

describe('a protected session gets none of the page and none of the document', () => {
  test('every document route is classified', () => {
    const unclassified = documentRoutes()
      .filter((route) => categoryOf(route) === null)
      .map((route) => `${route.method} ${route.path}`);
    expect(unclassified, 'add these routes to RULES').toEqual([]);
  });

  test('every route that returns the page or the document refuses a protected session', async () => {
    const leaks: string[] = [];
    for (const route of documentRoutes().filter((r) => categoryOf(r) === 'page')) {
      const response = await call(route, PROTECTED_SCOPE);
      await response.arrayBuffer();
      if (response.status !== 403) leaks.push(`${route.method} ${route.path}: ${response.status}`);
    }
    expect(leaks).toEqual([]);
  });

  test("the refusals come from the session's permissions, not from the request", async () => {
    // The same requests with every permission are not refused: what the
    // protected session lacks is what refused it.
    const refusedAnyway: string[] = [];
    for (const route of documentRoutes().filter((r) => categoryOf(r) === 'page')) {
      const response = await call(route, ['*']);
      await response.arrayBuffer();
      if (response.status === 403) refusedAnyway.push(`${route.method} ${route.path}`);
    }
    expect(refusedAnyway).toEqual([]);
  });

  test('a picture right opens its own pictures and nothing else of the page', async () => {
    // Each kind of picture needs its own right and no other: thumbnails or
    // printing given to a protected session open only those pictures.
    const opened = async (scope: string[]) => {
      const answered: string[] = [];
      for (const route of documentRoutes().filter((r) => categoryOf(r) === 'page')) {
        const response = await call(route, scope);
        await response.arrayBuffer();
        if (response.status !== 403) answered.push(route.path);
      }
      return answered;
    };
    const thumbnails = await opened([...PROTECTED_SCOPE, 'doc.render.thumbnail']);
    expect(thumbnails.length).toBeGreaterThan(0);
    expect(thumbnails.filter((path) => !/\/render\/thumbnail\//.test(path))).toEqual([]);
    const print = await opened([...PROTECTED_SCOPE, 'doc.print']);
    expect(print.length).toBeGreaterThan(0);
    expect(print.filter((path) => !/\/render\/print\//.test(path))).toEqual([]);
  });

  test('the overlay stays: annotation and form appearances answer a protected session', async () => {
    const refused: string[] = [];
    for (const route of documentRoutes().filter(
      (r) => categoryOf(r) === 'overlay' && /appearances/.test(r.path),
    )) {
      const response = await call(route, PROTECTED_SCOPE);
      await response.arrayBuffer();
      if (response.status === 403) refused.push(`${route.method} ${route.path}`);
    }
    expect(refused).toEqual([]);
  });

  test("the session's plugin permission reaches the viewer, and only installed ones", async () => {
    const response = await fetch(`${baseUrl}/v1/docs/${DOC}/layers/${LAYER}/access`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token([...PROTECTED_SCOPE, 'ai-chat.ask'])}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(response.status, await response.clone().text()).toBe(200);
    const { effectiveScope } = (await response.json()) as { effectiveScope: string[] };
    expect(effectiveScope).toContain('protected-display.view');
    expect(effectiveScope).not.toContain('ai-chat.ask'); // carried by the token, but no plugin enforces it
    expect(effectiveScope).not.toContain('doc.render');
  });
});

describe('plugin permissions are checked where people grant them', () => {
  async function issue(scope: string[]): Promise<Response> {
    return fetch(`${baseUrl}/v1/tenants/${TENANT}/tokens`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'doc', sub: 'viewer-1', docId: DOC, scope, expiresIn: 600 }),
    });
  }

  test('an installed plugin permission can be granted', async () => {
    const response = await issue(['doc.open', 'protected-display.view']);
    expect(response.status, await response.clone().text()).toBe(200);
  });

  test("a plugin permission no installed plugin declares can't", async () => {
    const response = await issue(['doc.open', 'protected-display.veiw']);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('no installed plugin declares this permission');
  });
});
