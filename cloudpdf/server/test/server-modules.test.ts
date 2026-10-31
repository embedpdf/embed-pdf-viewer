import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePageKey, EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import Fastify from 'fastify';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  createSqliteDb,
  FsObjectStore,
  migrate,
  PermissionRegistry,
  signDevToken,
  sqliteMigrations,
  StaticKmsKeyring,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '../src/index';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';
import { mountModules } from '../src/modules/host';
import { loadModules } from '../src/modules/load';
import type { HostedModule, ModuleConnection, ModuleResponse } from '../src/modules/index';
import type { DocumentService } from '../src/services/DocumentService';

/**
 * The host side of server modules: a module's permissions join the server's,
 * its routes mount under its id behind `doc.open` and its own permission, and
 * each request reaches the server's API twice: as the caller, with their own
 * token, and as the module, with a token that carries `requires.document`.
 * The modules here are written against the host protocol directly; the kit
 * that gives authors the engine's document API is `@cloudpdf/server-modules`.
 */

const json = (value: unknown): ModuleResponse => ({
  type: 'application/json',
  body: JSON.stringify(value),
});

/** What `POST …/access` says a connection's token may do. */
async function effectiveScope(
  connection: ModuleConnection,
  docId: string,
  layerName: string,
): Promise<string[] | number> {
  const response = await connection.fetch(
    `${connection.baseUrl}/v1/docs/${docId}/layers/${layerName}/access`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await connection.token()}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
  );
  if (!response.ok) return response.status;
  return ((await response.json()) as { effectiveScope: string[] }).effectiveScope;
}

/** Saves pages as images: draws them as itself, beyond what its callers may render. */
const snapshot: HostedModule = {
  id: 'snapshot',
  permissions: {
    create: { level: 'document', label: 'Save a page as an image' },
    settings: { level: 'tenant', label: 'Change snapshot settings' },
  },
  requires: { document: ['doc.render'] },
  config: {
    MAX_SCALE: { description: 'The largest scale a snapshot is drawn at', default: '2' },
    LABEL: { description: 'Sent with every snapshot' },
  },
  setup(host, config) {
    host.docRoute({
      method: 'GET',
      path: 'pages/:page',
      permission: 'create',
      async handler(req) {
        const scale = Number(req.query['scale'] ?? 1);
        if (!(scale > 0)) throw new EngineError(EngineErrorCode.InvalidArg, 'scale must be > 0');
        const page = decodePageKey(req.params['page']!);
        if (!page) throw new EngineError(EngineErrorCode.InvalidArg, 'not a page key');
        const raster = await req.renderRaw(page, {
          viewport: { kind: 'scale', scale: Math.min(scale, Number(config['MAX_SCALE'])) },
          ...(req.query['annotations'] === 'yes' ? { includeAnnotations: true } : {}),
          ...(req.query['usage'] === 'print' ? { usage: 'print' as const } : {}),
        });
        return {
          type: 'application/octet-stream',
          body: new Uint8Array(raster.data),
          headers: {
            'x-size': `${raster.width}x${raster.height}`,
            'x-transform-size': `${raster.transform.width}x${raster.transform.height}`,
            'x-label': config['LABEL']!,
          },
        };
      },
    });
    host.docRoute({
      method: 'POST',
      path: 'echo',
      permission: 'create',
      async handler(req) {
        return json({
          bytes: req.body instanceof Uint8Array ? req.body.byteLength : null,
          parsed: req.body instanceof Uint8Array ? null : req.body,
          sub: req.session.sub,
          document: [req.tenantId, req.docId, req.layerName],
          mayEditAnnotations: await req.session.allows('doc.annotate.modify'),
          maySnapshot: await req.session.allows('snapshot.create'),
        });
      },
    });
    host.docRoute({
      method: 'GET',
      path: 'scopes',
      permission: 'create',
      async handler(req) {
        const sameToken = (await req.module.token()) === (await req.module.token());
        return json({
          caller: req.caller ? await effectiveScope(req.caller, req.docId, req.layerName) : null,
          module: await effectiveScope(req.module, req.docId, req.layerName),
          sameToken,
        });
      },
    });
    host.docRoute({
      method: 'GET',
      path: 'events',
      permission: 'create',
      async handler(req) {
        const response = await req.module.fetch(
          `${req.module.baseUrl}/v1/docs/${req.docId}/layers/${req.layerName}/events`,
          {
            headers: {
              Accept: 'text/event-stream',
              Authorization: `Bearer ${await req.module.token()}`,
            },
          },
        );
        return json({ status: response.status });
      },
    });
    host.docRoute({
      method: 'GET',
      path: 'elsewhere',
      permission: 'create',
      async handler(req) {
        // A CDN's address, as /access hands one out: not this server.
        const response = await req.module.fetch(
          `https://cdn.example.test/v1/docs/${req.docId}/layers/${req.layerName}/manifest`,
          { headers: { Authorization: `Bearer ${await req.module.token()}` } },
        );
        return json({ status: response.status });
      },
    });
  },
};

/** Holds what drawing annotations takes, so its pictures draw them by default. */
const annotated: HostedModule = {
  id: 'annotated',
  permissions: { peek: { level: 'document', label: 'Peek at a page' } },
  requires: { document: ['doc.render', 'doc.annotate.read'] },
  setup(host) {
    host.docRoute({
      method: 'GET',
      path: 'pages/:page',
      permission: 'peek',
      async handler(req) {
        await req.renderRaw(decodePageKey(req.params['page']!)!, { viewport: { kind: 'scale' } });
        return { status: 204 };
      },
    });
  },
};

/** Renders without holding `doc.render`. */
const careless: HostedModule = {
  id: 'careless',
  permissions: { peek: { level: 'document', label: 'Peek at a page' } },
  setup(host) {
    host.docRoute({
      method: 'GET',
      path: 'pages/:page',
      permission: 'peek',
      async handler(req) {
        await req.renderRaw(decodePageKey(req.params['page']!)!, { viewport: { kind: 'scale' } });
        return { status: 204 };
      },
    });
  },
};

describe('mounting a module checks it while the server starts', () => {
  async function mount(
    modules: ReadonlyArray<HostedModule>,
    env: Record<string, string> = {},
  ): Promise<PermissionRegistry> {
    const permissions = new PermissionRegistry();
    await mountModules(Fastify(), modules, {
      permissions,
      documentService: {} as DocumentService,
      env,
    });
    return permissions;
  }

  const minimal = (overrides: Partial<HostedModule>): HostedModule => ({
    id: 'snapshot',
    permissions: { create: { level: 'document', label: 'x' } },
    setup() {},
    ...overrides,
  });

  test("its permissions join the server's", async () => {
    const permissions = await mount([snapshot], { CLOUDPDF_SNAPSHOT_LABEL: 'x' });
    expect(permissions.list().map((p) => p.name)).toEqual(['snapshot.create', 'snapshot.settings']);
  });

  test('a required setting that is missing names the variable', async () => {
    await expect(mount([snapshot])).rejects.toThrow(
      'module snapshot needs CLOUDPDF_SNAPSHOT_LABEL',
    );
    await expect(mount([snapshot], { CLOUDPDF_SNAPSHOT_LABEL: '' })).rejects.toThrow(
      /needs CLOUDPDF_SNAPSHOT_LABEL/,
    );
  });

  test('settings come from CLOUDPDF_<ID>_<KEY>, with dashes as underscores', async () => {
    let seen: Record<string, string> = {};
    await mount(
      [
        minimal({
          id: 'protected-display',
          permissions: {},
          config: {
            PROVIDER: { description: 'x', default: 'own' },
            HOST_PREFIX: { description: 'x' },
          },
          setup(_host, config) {
            seen = { ...config };
          },
        }),
      ],
      { CLOUDPDF_PROTECTED_DISPLAY_HOST_PREFIX: '1822e3b6' },
    );
    expect(seen).toEqual({ PROVIDER: 'own', HOST_PREFIX: '1822e3b6' });
  });

  test('an id is lowercase words, not a core name, and installed once', async () => {
    await expect(mount([minimal({ id: 'Snapshot' })])).rejects.toThrow(/isn't a module id/);
    await expect(mount([minimal({ id: 'doc' })])).rejects.toThrow(/isn't a module id/);
    await expect(mount([minimal({ id: 'layer' })])).rejects.toThrow(/isn't a module id/); // the core's events
    await expect(mount([minimal({}), minimal({})])).rejects.toThrow(
      'module snapshot is installed twice',
    );
  });

  test('requires.document holds core document permissions only', async () => {
    const requiring = (words: string[]) => minimal({ requires: { document: words as never } });
    await expect(mount([requiring(['doc.render', 'doc.text.copy'])])).resolves.toBeDefined();
    for (const word of ['*', 'protected-display.view', 'annotations:create:self', 'doc.nope']) {
      await expect(mount([requiring([word])])).rejects.toThrow(
        `requires.document holds core document permissions, not "${word}"`,
      );
    }
  });

  test('a route needs one of the module’s own document permissions', async () => {
    const routeNeeding = (permission: string) =>
      minimal({
        permissions: {
          create: { level: 'document', label: 'x' },
          settings: { level: 'tenant', label: 'x' },
        },
        setup(host) {
          host.docRoute({ method: 'GET', path: 'x', permission, handler: async () => ({}) });
        },
      });
    await expect(mount([routeNeeding('settings')])).rejects.toThrow(
      /needs snapshot.settings, which isn't one of its document permissions/,
    );
    await expect(mount([routeNeeding('delete')])).rejects.toThrow(/needs snapshot.delete/);
  });

  test("a route's path is relative and leaves the server's parameters alone", async () => {
    const routeAt = (path: string) =>
      minimal({
        setup(host) {
          host.docRoute({ method: 'GET', path, permission: 'create', handler: async () => ({}) });
        },
      });
    await expect(mount([routeAt('/pages')])).rejects.toThrow(/route path "\/pages"/);
    await expect(mount([routeAt('pages/:docId')])).rejects.toThrow(/route path/);
    await expect(mount([routeAt('../access')])).rejects.toThrow(/route path/);
    await expect(mount([routeAt('fairplay.cer')])).resolves.toBeDefined();
  });

  test('routes are added in setup, not after it', async () => {
    let later: (() => void) | undefined;
    await mount([
      minimal({
        setup(host) {
          later = () =>
            host.docRoute({
              method: 'GET',
              path: 'x',
              permission: 'create',
              handler: async () => ({}),
            });
        },
      }),
    ]);
    expect(later).toThrow('module snapshot adds its routes in setup, not after it');
  });

  test('a permission outside its namespace is refused, with the module named', async () => {
    await expect(
      mount([minimal({ permissions: { 'create.Bad': { level: 'document', label: 'x' } } })]),
    ).rejects.toThrow(/^module snapshot /);
  });
});

describe('CLOUDPDF_MODULES', () => {
  test('names packages, or paths from the working directory', async () => {
    const asked: string[] = [];
    const modules = await loadModules(
      ' @acme/snapshot-module, ./modules/careless.js ,',
      async (s) => {
        asked.push(s);
        return { default: s.includes('snapshot') ? snapshot : careless };
      },
    );
    expect(modules.map((m) => m.id)).toEqual(['snapshot', 'careless']);
    expect(asked).toEqual([
      '@acme/snapshot-module',
      pathToFileURL(join(process.cwd(), 'modules/careless.js')).href,
    ]);
  });

  test('unset is no modules', async () => {
    expect(await loadModules(undefined)).toEqual([]);
  });

  test("a module that won't load, or isn't one, stops the server", async () => {
    await expect(
      loadModules('@acme/missing', async () => {
        throw new Error('Cannot find package');
      }),
    ).rejects.toThrow("module @acme/missing couldn't be loaded: Cannot find package");
    await expect(loadModules('@acme/odd', async () => ({ default: {} }))).rejects.toThrow(
      'module @acme/odd has no server module as its default export',
    );
  });

  test('modules need the document plane', async () => {
    await expect(
      buildAppForTesting({
        licenseGate: createValidTestLicenseGate(),
        verifier: { mode: 'hs256', secret: 'x' },
        workerEntry: null,
        modules: [careless],
      }),
    ).rejects.toThrow('server modules need the document plane');
  });
});

const SECRET = 'server-modules-secret';
const API_TOKEN = 'server-modules-root-token';
const TENANT = 'modules-t';
const DOC = 'docmodules1';
const LAYER = 'default';

describe('a mounted module', () => {
  let bundle: AppBundle;
  let db: Kysely<DbSchema>;
  let baseUrl: string;
  let roots: string[] = [];

  beforeAll(async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), 'modules-store-'));
    const cacheRoot = await mkdtemp(join(tmpdir(), 'modules-cache-'));
    roots = [storageRoot, cacheRoot];
    db = createSqliteDb({ path: ':memory:' });
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    bundle = await buildAppForTesting({
      licenseGate: createValidTestLicenseGate(),
      verifier: { mode: 'hs256', secret: SECRET },
      apiAuthTokens: [API_TOKEN],
      modules: [snapshot, annotated, careless],
      moduleEnv: { CLOUDPDF_SNAPSHOT_LABEL: 'fernquill' },
      workerEntry: new URL('./_helpers/stub-worker-entry.cjs', import.meta.url),
      poolSize: 1,
      db,
      objectStore: new FsObjectStore({ root: storageRoot }),
      autoProvisionTenant: true,
      sweepIntervalMs: 0,
      cacheRoot,
      cacheMaxBytes: 1024 * 1024,
      kms: new StaticKmsKeyring({ keyId: 'modules-kek', kek: Buffer.alloc(32, 7) }),
    });
    const address = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
    baseUrl = typeof address === 'string' ? address : `http://127.0.0.1:${address}`;

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
  });

  afterAll(async () => {
    await bundle?.shutdown();
    await db?.destroy();
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  });

  function call(path: string, scope: string[] | 'api-token', init: RequestInit = {}) {
    const bearer =
      scope === 'api-token'
        ? API_TOKEN
        : signDevToken(SECRET, {
            sub: 'viewer-1',
            tenant_id: TENANT,
            doc_id: DOC,
            layer_name: LAYER,
            scope,
            jti: `jti-${randomBytes(8).toString('hex')}`,
          });
    return fetch(`${baseUrl}/v1/docs/${DOC}/layers/${LAYER}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${bearer}`, ...(init.headers ?? {}) },
    });
  }

  const SNAPSHOT = ['doc.open', 'snapshot.create'];

  test('its routes live under its id', () => {
    const urls = bundle.routes.map((r) => `${r.method} ${r.url}`);
    expect(urls).toContain('GET /v1/docs/:docId/layers/:layerName/snapshot/pages/:page');
    expect(urls).toContain('POST /v1/docs/:docId/layers/:layerName/snapshot/echo');
    expect(bundle.permissions.documentPermissions()).toEqual(
      new Set(['snapshot.create', 'annotated.peek', 'careless.peek']),
    );
  });

  test("a route needs the module's permission, and the document open", async () => {
    const without = await call('snapshot/echo', ['doc.open', 'doc.render'], { method: 'POST' });
    expect(without.status).toBe(403);
    expect(((await without.json()) as { error: { message: string } }).error.message).toMatch(
      /snapshot.create/,
    );
    expect((await call('snapshot/echo', ['snapshot.create'], { method: 'POST' })).status).toBe(403);
    expect((await call('snapshot/echo', SNAPSHOT, { method: 'POST' })).status).toBe(200);
    expect((await call('snapshot/echo', ['*'], { method: 'POST' })).status).toBe(200);
  });

  test('it reaches the API as the caller, and as itself with what it requires', async () => {
    const response = await call('snapshot/scopes', [...SNAPSHOT, 'doc.text.select']);
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toEqual({
      caller: ['doc.open', 'doc.text.select', 'snapshot.create'],
      module: ['doc.open', 'doc.render'],
      sameToken: true,
    });
  });

  test("with the deployment's API token there is no caller session to act as", async () => {
    const response = await call('snapshot/scopes', 'api-token');
    expect(response.status, await response.clone().text()).toBe(200);
    expect(((await response.json()) as { caller: unknown }).caller).toBeNull();
  });

  test('a live event stream is refused inside the server', async () => {
    expect(await (await call('snapshot/events', SNAPSHOT)).json()).toEqual({ status: 403 });
  });

  test('the connection reaches only this server, never another host', async () => {
    expect(await (await call('snapshot/elsewhere', SNAPSHOT)).json()).toEqual({ status: 502 });
  });

  test('it draws a page its caller may not render', async () => {
    const response = await call('snapshot/pages/obj:1?scale=2', SNAPSHOT);
    expect(response.status, await response.clone().text()).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-size')).toBe('16x16');
    expect(response.headers.get('x-transform-size')).toBe('16x16'); // the pixels' map to the page
    expect(response.headers.get('x-label')).toBe('fernquill');
    const rgba = new Uint8Array(await response.arrayBuffer());
    expect(rgba.byteLength).toBe(16 * 16 * 4);
    expect([...rgba.slice(0, 4)]).toEqual([0x88, 0xaa, 0xcc, 0xff]);
    // MAX_SCALE's default caps it.
    const capped = await call('snapshot/pages/obj:1?scale=9', SNAPSHOT);
    expect(capped.headers.get('x-size')).toBe('16x16');
  });

  test('a raw render is for the screen', async () => {
    const response = await call('snapshot/pages/obj:1?usage=print', SNAPSHOT);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { message: string } }).error.message).toBe(
      "a module's raw render is for the screen",
    );
  });

  test('a picture draws only what the module holds', async () => {
    const refused = await call('snapshot/pages/obj:1?annotations=yes', SNAPSHOT);
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: { message: string } }).error.message).toBe(
      'permission denied (module snapshot): doc.annotate.read',
    );
    expect((await call('annotated/pages/obj:1', ['doc.open', 'annotated.peek'])).status).toBe(204);
    const careless = await call('careless/pages/obj:1', [
      'doc.open',
      'careless.peek',
      'doc.render',
    ]);
    expect(careless.status).toBe(403); // the caller's doc.render isn't the module's
  });

  test('a module refuses a request the way the server does', async () => {
    const response = await call('snapshot/pages/obj:1?scale=0', SNAPSHOT);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        name: 'EngineError',
        code: EngineErrorCode.InvalidArg,
        message: 'scale must be > 0',
      },
    });
  });

  test('it sees who asks, what they may do, and the body', async () => {
    const echo = (scope: string[], body: BodyInit, type: string) =>
      call('snapshot/echo', scope, { method: 'POST', body, headers: { 'Content-Type': type } });

    const bytes = await echo(SNAPSHOT, new Uint8Array([1, 2, 3]), 'application/octet-stream');
    expect(await bytes.json()).toEqual({
      bytes: 3,
      parsed: null,
      sub: 'viewer-1',
      document: [TENANT, DOC, LAYER],
      mayEditAnnotations: false,
      maySnapshot: true,
    });

    const parsed = await echo(
      [...SNAPSHOT, 'doc.annotate.modify'],
      JSON.stringify({ hello: 'world' }),
      'application/json',
    );
    expect(await parsed.json()).toMatchObject({
      bytes: null,
      parsed: { hello: 'world' },
      mayEditAnnotations: true,
    });
  });
});
