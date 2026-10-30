import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildAppForTesting } from '../../src/app/buildApp';
import { signDevToken } from '../../src/auth/JwtVerifier';
import { FsObjectStore, type AppBundle, type DbSchema } from '../../src/index';
import { createValidTestLicenseGate } from '../../src/licensing/testing';

const SECRET = 'upload-tokens-secret';
const API_TOKEN = 'upload-tokens-api-token';
const TENANT = 'fernquill';
const OTHER_TENANT = 'lanternfield';
const APP_ORIGIN = 'https://app.fernquill.example';

const pdf = new TextEncoder().encode('%PDF-1.4\n% upload token test\n%%EOF\n');
const sha256 = createHash('sha256').update(pdf).digest('hex');

export interface UploadTokensDialect {
  label: string;
  makeDb: () => Promise<Kysely<DbSchema>>;
  destroyDb: (db: Kysely<DbSchema>) => Promise<void>;
}

/**
 * Upload tokens: a browser uploads with a token its customer's server
 * made (`tokens.issue` kind `upload`), and the token reaches nothing but
 * init, the proxied transfer and commit. FsObjectStore can't presign, so
 * every transfer here takes the proxy path, the one an upload token sends
 * bytes through the engine on.
 */
export function runUploadTokens(dialect: UploadTokensDialect): void {
  describe(`upload tokens [${dialect.label}]`, () => {
    let bundle: AppBundle;
    let db: Kysely<DbSchema>;
    let storageRoot: string;
    let baseUrl: string;
    let folderId: string;

    beforeAll(async () => {
      storageRoot = await mkdtemp(join(tmpdir(), 'embedpdf-upload-tokens-'));
      db = await dialect.makeDb();
      bundle = await buildAppForTesting({
        licenseGate: createValidTestLicenseGate(),
        verifier: { mode: 'hs256', secret: SECRET },
        apiAuthTokens: [API_TOKEN],
        workerEntry: null,
        db,
        objectStore: new FsObjectStore({ root: storageRoot }),
        autoProvisionTenant: true,
        sweepIntervalMs: 0,
        authFailureLimit: false,
      });
      await bundle.app.listen({ port: 0, host: '127.0.0.1' });
      baseUrl = `http://127.0.0.1:${(bundle.app.server.address() as AddressInfo).port}`;

      const folder = await call('POST', `/v1/tenants/${TENANT}/folders`, API_TOKEN, {
        name: 'Contracts',
      });
      expect(folder.status).toBe(200);
      folderId = ((await folder.json()) as { folder: { id: string } }).folder.id;
      // The other tenant exists too, so a cross-tenant request reaches the guard.
      await call('POST', `/v1/tenants/${OTHER_TENANT}/folders`, API_TOKEN, { name: 'Other' });
    });

    afterAll(async () => {
      await bundle.shutdown();
      await dialect.destroyDb(db);
      await rm(storageRoot, { recursive: true, force: true });
    });

    async function call(
      method: string,
      path: string,
      token: string,
      body?: unknown,
      headers: Record<string, string> = {},
    ): Promise<Response> {
      return fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    }

    async function uploadToken(request: Record<string, unknown> = {}, minter = API_TOKEN) {
      const res = await call('POST', `/v1/tenants/${TENANT}/tokens`, minter, {
        kind: 'upload',
        sub: 'user-381',
        expiresIn: 600,
        ...request,
      });
      expect(res.status, await res.clone().text()).toBe(200);
      return ((await res.json()) as { token: string }).token;
    }

    function init(token: string, body: Record<string, unknown> = {}, headers = {}) {
      return call(
        'POST',
        `/v1/tenants/${TENANT}/documents/init`,
        token,
        { contentLength: pdf.byteLength, contentSha256: sha256, name: 'Contract.pdf', ...body },
        headers,
      );
    }

    function sendFile(token: string, docId: string) {
      const form = new FormData();
      form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'Contract.pdf');
      return fetch(`${baseUrl}/v1/tenants/${TENANT}/documents/${docId}/upload-proxy`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });
    }

    function commit(token: string, docId: string) {
      return call('POST', `/v1/tenants/${TENANT}/documents/${docId}/commit`, token, { sha256 });
    }

    /** init → transfer → commit with one token; the committed document. */
    async function uploadWith(token: string, body: Record<string, unknown> = {}) {
      const started = await init(token, body);
      expect(started.status, await started.clone().text()).toBe(200);
      const { document } = (await started.json()) as { document: { id: string } };
      expect((await sendFile(token, document.id)).status).toBe(200);
      const done = await commit(token, document.id);
      expect(done.status, await done.clone().text()).toBe(200);
      return ((await done.json()) as { document: Record<string, unknown> }).document;
    }

    describe('making one', () => {
      test('the API token makes an upload token that carries an upload claim and no scope', async () => {
        const token = await uploadToken({ folderId, maxFiles: 3, maxBytes: 1000 });
        const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'));
        expect(claims).toMatchObject({
          sub: 'user-381',
          tenant_id: TENANT,
          upload: { folder_id: folderId, max_files: 3, max_bytes: 1000 },
        });
        expect(claims.scope).toBeUndefined();
        expect(claims.doc_id).toBeUndefined();
        expect(typeof claims.jti).toBe('string');
      });

      test('a tenant key needs docs.create, not tokens.issue-doc', async () => {
        const issuer = signDevToken(SECRET, {
          sub: 'apikey:viewer-tokens',
          tenant_id: TENANT,
          scope: ['tokens.issue-doc'],
        });
        const refused = await call('POST', `/v1/tenants/${TENANT}/tokens`, issuer, {
          kind: 'upload',
          sub: 'user-381',
          expiresIn: 600,
        });
        expect(refused.status).toBe(403);

        const uploader = signDevToken(SECRET, {
          sub: 'apikey:uploads',
          tenant_id: TENANT,
          scope: ['docs.create'],
        });
        await uploadToken({}, uploader);
      });

      test('a folder that does not exist is refused when the token is made', async () => {
        const res = await call('POST', `/v1/tenants/${TENANT}/tokens`, API_TOKEN, {
          kind: 'upload',
          sub: 'user-381',
          folderId: 'fld_000000000000000000000000',
          expiresIn: 600,
        });
        expect(res.status).toBe(404);
      });

      test('metadata over 4 KB is refused', async () => {
        const res = await call('POST', `/v1/tenants/${TENANT}/tokens`, API_TOKEN, {
          kind: 'upload',
          sub: 'user-381',
          metadata: { note: 'x'.repeat(5000) },
          expiresIn: 600,
        });
        expect(res.status).toBe(400);
      });
    });

    describe('uploading with one', () => {
      test("the document goes into the token's folder with the token's metadata", async () => {
        const token = await uploadToken({ folderId, metadata: { contractId: 'c_381' } });
        const document = await uploadWith(token, {
          folderId: 'root',
          metadata: { contractId: 'c_999' },
        });
        expect(document).toMatchObject({
          state: 'ready',
          name: 'Contract.pdf',
          folderId,
          metadata: { contractId: 'c_381' },
          createdBy: 'user-381',
        });
      });

      test('without a folder, the top level', async () => {
        const token = await uploadToken();
        const document = await uploadWith(token);
        expect(document.folderId).toBe('root');
      });

      test('one file by default, then 403', async () => {
        const token = await uploadToken();
        await uploadWith(token);
        const again = await init(token);
        expect(again.status).toBe(403);
      });

      test('maxFiles holds when inits race', async () => {
        const token = await uploadToken({ maxFiles: 2 });
        const results = await Promise.all(Array.from({ length: 6 }, () => init(token)));
        // Each init takes a use atomically: exactly maxFiles of them win.
        expect(results.filter((r) => r.status === 200)).toHaveLength(2);
        for (const r of results) expect([200, 403]).toContain(r.status);
      });

      test('a file larger than maxBytes is refused', async () => {
        const token = await uploadToken({ maxBytes: pdf.byteLength - 1 });
        const res = await init(token);
        expect(res.status).toBe(400);
      });

      test.each([
        ['a chosen document id', { docId: 'doc_aaaaaaaaaaaaaaaaaaaaaaaa' }],
        ['an idempotency key', { idempotencyKey: 'retry-1' }],
        ['reusing an existing file', { dedupMode: 'reuse-existing' }],
      ])('%s is refused', async (_label, body) => {
        const token = await uploadToken();
        const res = await init(token, body);
        expect(res.status).toBe(400);
      });

      test('it sends files to, and commits, only documents it started', async () => {
        const own = await call('POST', `/v1/tenants/${TENANT}/documents/init`, API_TOKEN, {
          contentLength: pdf.byteLength,
          contentSha256: sha256,
        });
        const { document } = (await own.json()) as { document: { id: string } };

        const token = await uploadToken();
        expect((await sendFile(token, document.id)).status).toBe(404);
        expect((await commit(token, document.id)).status).toBe(404);
        expect((await commit(token, 'doc_does_not_exist')).status).toBe(404);
      });

      test("another tenant's path is refused", async () => {
        const token = await uploadToken();
        const res = await call('POST', `/v1/tenants/${OTHER_TENANT}/documents/init`, token, {
          contentLength: pdf.byteLength,
          contentSha256: sha256,
        });
        expect(res.status).toBe(403);
      });
    });

    describe('its origin lock', () => {
      test('works from its website, and only there', async () => {
        const token = await uploadToken({ origins: [APP_ORIGIN] });
        expect((await init(token, {}, { origin: 'https://elsewhere.example' })).status).toBe(403);
        expect((await init(token, {}, { origin: APP_ORIGIN })).status).toBe(200);
      });
    });

    describe('everywhere else', () => {
      test('it is refused on every other route', async () => {
        const token = await uploadToken({ maxFiles: 2 });
        const document = await uploadWith(token);
        const id = document.id as string;

        const elsewhere: Array<[string, string, unknown?]> = [
          ['GET', `/v1/tenants/${TENANT}/documents`],
          ['GET', `/v1/tenants/${TENANT}/documents/${id}`],
          ['GET', `/v1/tenants/${TENANT}/documents/${id}/download`],
          ['DELETE', `/v1/tenants/${TENANT}/documents/${id}`],
          ['GET', `/v1/tenants/${TENANT}/folders`],
          ['POST', `/v1/tenants/${TENANT}/tokens`, { kind: 'upload', sub: 'x', expiresIn: 600 }],
          ['GET', `/v1/docs/${id}`],
          ['GET', `/v1/tenants/${TENANT}/usage`],
        ];
        for (const [method, path, body] of elsewhere) {
          const res = await call(method, path, token, body);
          expect(res.status, `${method} ${path}`).toBe(403);
        }
      });

      test('a token carrying upload and a scope is not a token at all', async () => {
        const forged = signDevToken(SECRET, {
          sub: 'user-381',
          tenant_id: TENANT,
          jti: 'forged-1',
          extras: { upload: { folder_id: null, max_files: 1 }, scope: ['*'] },
        });
        expect((await call('GET', `/v1/tenants/${TENANT}/documents`, forged)).status).toBe(401);
        expect((await init(forged)).status).toBe(401);
      });

      test('an upload claim without a jti is refused', async () => {
        const unnamed = signDevToken(SECRET, {
          sub: 'user-381',
          tenant_id: TENANT,
          extras: { upload: { folder_id: null, max_files: 1 } },
        });
        expect((await init(unnamed)).status).toBe(401);
      });
    });
  });
}
