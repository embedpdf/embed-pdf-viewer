import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import {
  createSqliteDb,
  migrate,
  sqliteMigrations,
  FsObjectStore,
  signDevToken,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '@cloudpdf/server';
import { buildAppForTesting } from '../../server/src/app/buildApp';
import { createValidTestLicenseGate } from '../../server/src/licensing/testing';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { createCloudEngine } from '../src/index';
import { exchangeShareToken, shareSessionSource, ShareExchangeError } from '../src/share';

/**
 * SDK side of the no-backend embed flow, at both levels:
 *
 *   - the primitives: a share token exchanged into a self-renewing
 *     token source that drives an ordinary `open({ kind: 'token' })`
 *   - the engine arm: `open({ kind: 'share' })`, which performs the
 *     exchange itself on the engine's own transport (baseUrl + fetch)
 *     and surfaces exchange failures as EngineErrors
 *
 * The exchange endpoint requires a browser Origin header — browsers
 * send it automatically; here (Node) the fetch wrapper plays the
 * browser.
 */

const STUB_ENTRY = fileURLToPath(
  new URL('../../server/test/_helpers/stub-worker-entry.cjs', import.meta.url),
);
const SECRET = 'cloud-engine-share-secret';
const TENANT = 'acme';

interface Fixture {
  bundle: AppBundle;
  db: Kysely<DbSchema>;
  baseUrl: string;
  storageRoot: string;
  cacheRoot: string;
}

let fx: Fixture;

beforeEach(async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'share-session-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'share-session-cache-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const store = new FsObjectStore({ root: storageRoot });
  const bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    workerEntry: STUB_ENTRY,
    poolSize: 1,
    db,
    objectStore: store,
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 1024 * 1024,
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  const baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;
  fx = { bundle, db, baseUrl, storageRoot, cacheRoot };
});

afterEach(async () => {
  if (!fx) return;
  await fx.bundle.shutdown();
  await fx.db.destroy();
  await rm(fx.storageRoot, { recursive: true, force: true });
  await rm(fx.cacheRoot, { recursive: true, force: true });
});

async function seedDocument(docId: string): Promise<void> {
  const padding = randomBytes(4095);
  const bytes = new Uint8Array(4096);
  bytes[0] = 3;
  bytes.set(padding, 1);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const storage = new FsObjectStore({ root: fx.storageRoot });
  await storage.put(StorageKeys.basePdf(TENANT, docId), bytes, {
    contentLength: bytes.byteLength,
  });
  await fx.db
    .insertInto('tenants')
    .values({ id: TENANT, name: TENANT })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();
  const now = Date.now();
  await fx.db
    .insertInto('documents')
    .values({
      id: docId,
      tenant_id: TENANT,
      state: 'ready',
      base_sha: sha,
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

async function createShare(body: Record<string, unknown>): Promise<string> {
  const token = signDevToken(SECRET, {
    sub: 'dash-1',
    tenant_id: TENANT,
    scope: ['shares.manage'],
  });
  const res = await fetch(`${fx.baseUrl}/v1/tenants/${TENANT}/shares`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { share: { id: string } }).share.id;
}

/**
 * Node fetch playing the browser: attach Origin like a cross-origin page
 * would. Merges via `Headers` — engine transport passes a `Headers`
 * instance, which a plain object spread would silently flatten to `{}`
 * (dropping `Authorization`).
 */
function browserFetch(origin: string, counter?: { exchanges: number }): typeof fetch {
  return async (input, init) => {
    if (counter && String(input).endsWith('/v1/share-sessions')) counter.exchanges += 1;
    const headers = new Headers(init?.headers);
    headers.set('origin', origin);
    return fetch(input, { ...init, headers });
  };
}

describe('share sessions (SDK)', () => {
  test('shareSessionSource feeds open({kind: token}) and caches the session', async () => {
    await seedDocument('doc-sdk-share');
    const shareId = await createShare({
      docId: 'doc-sdk-share',
      scope: ['doc.open', 'doc.render'],
      origins: ['https://acme.com'],
    });

    const counter = { exchanges: 0 };
    const source = shareSessionSource(fx.baseUrl, shareId, {
      fetch: browserFetch('https://acme.com', counter),
    });

    const engine = createCloudEngine({ baseUrl: fx.baseUrl });
    try {
      const handle = await engine.open({ kind: 'token', token: source });
      expect(handle.id).toBe('doc-sdk-share');
      // A second open re-invokes the source (fresh /head with the
      // bearer), but the cached session serves it: still one exchange.
      const again = await engine.open({ kind: 'token', token: source });
      expect(again.id).toBe('doc-sdk-share');
      expect(counter.exchanges).toBe(1);
    } finally {
      await engine.destroy();
    }
  });

  test('one engine, multiple share tokens — independent sessions per tab', async () => {
    await seedDocument('doc-multi-a');
    await seedDocument('doc-multi-b');
    const shareA = await createShare({ docId: 'doc-multi-a', scope: ['doc.open'] });
    const shareB = await createShare({ docId: 'doc-multi-b', scope: ['doc.open'] });

    const counterA = { exchanges: 0 };
    const counterB = { exchanges: 0 };
    const engine = createCloudEngine({ baseUrl: fx.baseUrl });
    try {
      // Exactly what the viewer's `documents: [{ source: { kind: 'share' } }]`
      // lowering produces: one exchanging source per entry, opened as a batch.
      const [a, b] = await Promise.all([
        engine.open({
          kind: 'token',
          token: shareSessionSource(fx.baseUrl, shareA, {
            fetch: browserFetch('https://acme.com', counterA),
          }),
        }),
        engine.open({
          kind: 'token',
          token: shareSessionSource(fx.baseUrl, shareB, {
            fetch: browserFetch('https://acme.com', counterB),
          }),
        }),
      ]);
      expect(a.id).toBe('doc-multi-a');
      expect(b.id).toBe('doc-multi-b');
      // Each grant exchanged exactly once — sessions are per-document,
      // never shared across tabs.
      expect(counterA.exchanges).toBe(1);
      expect(counterB.exchanges).toBe(1);

      // Revoking one share does not disturb the other tab's session:
      // B's already-minted JWT keeps serving until its own exp.
      const admin = signDevToken(SECRET, {
        sub: 'dash-1',
        tenant_id: TENANT,
        scope: ['shares.manage'],
      });
      const del = await fetch(`${fx.baseUrl}/v1/tenants/${TENANT}/shares/${shareA}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${admin}` },
      });
      expect(del.status).toBe(204);
      const again = await engine.open({
        kind: 'token',
        token: shareSessionSource(fx.baseUrl, shareB, {
          fetch: browserFetch('https://acme.com'),
        }),
      });
      expect(again.id).toBe('doc-multi-b');
    } finally {
      await engine.destroy();
    }
  });

  test("open({ kind: 'share' }) exchanges on the engine's own transport", async () => {
    await seedDocument('doc-open-share');
    const shareId = await createShare({
      docId: 'doc-open-share',
      scope: ['doc.open', 'doc.render'],
      origins: ['https://acme.com'],
    });

    // The Origin-attaching fetch is configured on the ENGINE, not the
    // open call — proving the share arm forwards the engine's transport
    // (fetchImpl + baseUrl) into the exchange. No engine-level token:
    // the anonymous-engine embed scenario.
    const counter = { exchanges: 0 };
    const engine = createCloudEngine({
      baseUrl: fx.baseUrl,
      fetch: browserFetch('https://acme.com', counter),
    });
    try {
      const handle = await engine.open({ kind: 'share', shareToken: shareId });
      expect(handle.id).toBe('doc-open-share');
      expect(counter.exchanges).toBe(1);
    } finally {
      await engine.destroy();
    }
  });

  test("open({ kind: 'share' }) with a passphrase-protected grant", async () => {
    await seedDocument('doc-open-share-pass');
    const shareId = await createShare({
      docId: 'doc-open-share-pass',
      scope: ['doc.open'],
      password: 'open-sesame',
    });

    const engine = createCloudEngine({
      baseUrl: fx.baseUrl,
      fetch: browserFetch('https://acme.com'),
    });
    try {
      // Without the passphrase: an EngineError with the dedicated code —
      // the prompt-and-retry signal — never a raw ShareExchangeError.
      try {
        await engine.open({ kind: 'share', shareToken: shareId });
        expect.unreachable('share open without a passphrase must reject');
      } catch (err) {
        expect(err).toBeInstanceOf(EngineError);
        expect(EngineError.is(err, EngineErrorCode.SharePasswordRequired)).toBe(true);
        expect((err as EngineError).details).toMatchObject({
          shareCode: 'SharePasswordRequired',
        });
      }

      // With it: an ordinary handle.
      const handle = await engine.open({
        kind: 'share',
        shareToken: shareId,
        sharePassword: 'open-sesame',
      });
      expect(handle.id).toBe('doc-open-share-pass');
    } finally {
      await engine.destroy();
    }
  });

  test("open({ kind: 'share' }) maps unknown grants to NotFound", async () => {
    const engine = createCloudEngine({
      baseUrl: fx.baseUrl,
      fetch: browserFetch('https://acme.com'),
    });
    try {
      try {
        await engine.open({ kind: 'share', shareToken: `shr_${'B'.repeat(24)}` });
        expect.unreachable('unknown share must reject');
      } catch (err) {
        expect(err).toBeInstanceOf(EngineError);
        expect(EngineError.is(err, EngineErrorCode.NotFound)).toBe(true);
      }
    } finally {
      await engine.destroy();
    }
  });

  test('exchange errors surface typed codes', async () => {
    await seedDocument('doc-sdk-pass');
    const shareId = await createShare({
      docId: 'doc-sdk-pass',
      scope: ['doc.open'],
      password: 'open-sesame',
    });

    await expect(
      exchangeShareToken(fx.baseUrl, shareId, { fetch: browserFetch('https://x.example') }),
    ).rejects.toMatchObject({ name: 'ShareExchangeError', code: 'SharePasswordRequired' });

    await expect(
      exchangeShareToken(fx.baseUrl, `shr_${'B'.repeat(24)}`, {
        fetch: browserFetch('https://x.example'),
      }),
    ).rejects.toMatchObject({ code: 'NotFound', status: 404 });

    const session = await exchangeShareToken(fx.baseUrl, shareId, {
      password: 'open-sesame',
      fetch: browserFetch('https://x.example'),
    });
    expect(session.docId).toBe('doc-sdk-pass');
    expect(session.expiresAt).toBeGreaterThan(Date.now() / 1000);

    // The typed error is an instanceof, not just a shape.
    try {
      await exchangeShareToken(fx.baseUrl, shareId, { fetch: browserFetch('https://x.example') });
      expect.unreachable('exchange without password must throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ShareExchangeError);
    }
  });
});
