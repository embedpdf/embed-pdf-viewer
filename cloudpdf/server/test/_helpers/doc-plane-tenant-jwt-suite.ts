import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import { CHANGE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import { FsObjectStore, StorageKeys, type AppBundle, type DbSchema } from '../../src/index';
import { buildAppForTesting } from '../../src/app/buildApp';
import { createValidTestLicenseGate } from '../../src/licensing/testing';

/**
 * A tenant JWT on the doc plane: what a hosted customer's server key is.
 * The key is minted the way the hosted control plane mints it
 * (`tokens.issue`, `kind: 'tenant'`) and then calls `/v1/docs/{docId}`
 * routes directly, on the native engine. Inside documents it is checked
 * like a doc token, against the document permissions its scope names (`*`
 * for all; tenant scopes such as `docs.read` grant none): reads and writes
 * on its own tenant's documents as far as those reach, a refusal on another
 * tenant's, and a revocation that takes effect there too.
 *
 * Both `doc-plane-tenant-jwt.test.ts` (SQLite) and
 * `doc-plane-tenant-jwt-postgres.test.ts` run it.
 */
export interface DocPlaneTenantJwtDialect {
  /** Build a fresh, migrated, isolated Kysely instance. */
  makeDb: () => Promise<Kysely<DbSchema>>;
  destroyDb: (db: Kysely<DbSchema>) => Promise<void>;
  /** Diagnostic label printed in the `describe` block. */
  label: string;
}

const SECRET = 'doc-plane-tenant-jwt-secret';
const API_TOKEN = 'doc-plane-tenant-jwt-root-token';
const OWN_TENANT = 'tenant-own';
const OTHER_TENANT = 'tenant-other';
const OWN_DOC = 'doc-own';
const OTHER_DOC = 'doc-other';
/** The fixture's first page, and the `name` field's merged widget on it (value `Ann`). */
const PAGE = 3;
const FIELD = 9;

interface Answer {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test responses are probed loosely
  body: any;
}

export function runDocPlaneTenantJwt(dialect: DocPlaneTenantJwtDialect): void {
  describe(`tenant JWT on the doc plane [${dialect.label}]`, () => {
    let dir: string;
    let db: Kysely<DbSchema>;
    let bundle: AppBundle;
    let baseUrl: string;

    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), 'doc-plane-tenant-jwt-'));
      const storageRoot = join(dir, 'objects');
      db = await dialect.makeDb();
      bundle = await buildAppForTesting({
        licenseGate: createValidTestLicenseGate(),
        verifier: { mode: 'hs256', secret: SECRET },
        apiAuthTokens: [API_TOKEN],
        enableRevocation: true,
        workerEntry: new URL('../../dist/runtime/worker-entry.js', import.meta.url),
        poolSize: 1,
        db,
        objectStore: new FsObjectStore({ root: storageRoot }),
        autoProvisionTenant: true,
        sweepIntervalMs: 0,
        cacheRoot: join(dir, 'cache'),
        cacheMaxBytes: 4 * 1024 * 1024,
      });
      const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
      baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;

      const store = new FsObjectStore({ root: storageRoot });
      const bytes = CHANGE_FIXTURE_PDF;
      const now = Date.now();
      for (const [tenantId, docId] of [
        [OWN_TENANT, OWN_DOC],
        [OTHER_TENANT, OTHER_DOC],
      ] as const) {
        await store.put(StorageKeys.basePdf(tenantId, docId), bytes, {
          contentLength: bytes.byteLength,
        });
        await db.insertInto('tenants').values({ id: tenantId, name: tenantId }).execute();
        await db
          .insertInto('documents')
          .values({
            id: docId,
            tenant_id: tenantId,
            state: 'ready',
            base_sha: createHash('sha256').update(bytes).digest('hex'),
            storage_size_bytes: bytes.byteLength,
            encryption_state: 'unknown',
            metadata_json: null,
            idempotency_key: null,
            failure_reason: null,
            created_at: now,
            updated_at: now,
            created_by: null,
          })
          .execute();
      }
    }, 120_000);

    afterAll(async () => {
      await bundle?.shutdown();
      if (db) await dialect.destroyDb(db);
      if (dir) await rm(dir, { recursive: true, force: true });
    });

    async function call(
      token: string,
      method: string,
      path: string,
      body?: unknown,
    ): Promise<Answer> {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // binary and multipart bodies stay text
      }
      return { status: res.status, body: parsed };
    }

    /** A tenant key, minted with the API token as the hosted control plane mints one. */
    async function issueTenantKey(
      sub: string,
      scope: ReadonlyArray<string>,
    ): Promise<{ token: string; jti: string; expiresAt: number }> {
      const issued = await call(API_TOKEN, 'POST', `/v1/tenants/${OWN_TENANT}/tokens`, {
        kind: 'tenant',
        sub,
        scope,
        expiresIn: 30 * 24 * 60 * 60,
      });
      expect(issued.status, JSON.stringify(issued.body)).toBe(200);
      return issued.body;
    }

    const docPath = (docId: string, rest: string) => `/v1/docs/${docId}${rest}`;
    const square = { subtype: 'square', box: { x: 20, y: 120, width: 40, height: 30 } };

    test('a full-scope key reads its own tenant document', async () => {
      const { token } = await issueTenantKey('apikey:reads', ['*']);

      const head = await call(token, 'GET', docPath(OWN_DOC, '/head'));
      expect(head.status, JSON.stringify(head.body)).toBe(200);

      const text = await call(
        token,
        'GET',
        docPath(OWN_DOC, `/layers/default/text/pages/obj:${PAGE}/data`),
      );
      expect(text.status, JSON.stringify(text.body)).toBe(200);
      expect(text.body).toEqual(expect.any(Object));

      const annotations = await call(
        token,
        'GET',
        docPath(OWN_DOC, `/layers/default/annotations/pages/obj:${PAGE}/items`),
      );
      expect(annotations.status, JSON.stringify(annotations.body)).toBe(200);
      expect(annotations.body.annotations.length).toBeGreaterThan(0);

      const form = await call(token, 'GET', docPath(OWN_DOC, '/layers/default/form'));
      expect(form.status, JSON.stringify(form.body)).toBe(200);
    });

    test('a full-scope key writes through the routes a viewer uses, as itself', async () => {
      const { token } = await issueTenantKey('apikey:writes', ['*']);

      const created = await call(
        token,
        'POST',
        docPath(OWN_DOC, `/layers/server/annotations/pages/obj:${PAGE}/items`),
        square,
      );
      expect(created.status, JSON.stringify(created.body)).toBe(200);
      const audit = await db
        .selectFrom('audit_log')
        .select(['sub', 'kind'])
        .where('doc_id', '=', OWN_DOC)
        .where('kind', '=', 'annot.create')
        .executeTakeFirst();
      expect(audit?.sub).toBe('apikey:writes');

      const filled = await call(
        token,
        'POST',
        docPath(OWN_DOC, `/layers/server/form/fields/obj:${FIELD}/value`),
        { value: { value: 'Bea' } },
      );
      expect(filled.status, JSON.stringify(filled.body)).toBe(200);
      expect(
        filled.body.widgets.map((w: { ref: { objectNumber: number } }) => w.ref.objectNumber),
      ).toEqual([FIELD]);
    });

    test("another tenant's document is refused, for reads and writes alike", async () => {
      const { token } = await issueTenantKey('apikey:cross', ['*']);
      const attempts: Array<[string, string, unknown?]> = [
        ['GET', '/head'],
        ['GET', '/layers/default/manifest'],
        ['GET', `/layers/default/text/pages/obj:${PAGE}/data`],
        ['GET', `/layers/default/annotations/pages/obj:${PAGE}/items`],
        ['POST', `/layers/default/annotations/pages/obj:${PAGE}/items`, square],
        ['POST', `/layers/default/form/fields/obj:${FIELD}/value`, { value: { value: 'Eve' } }],
        ['GET', '/layers/default/download'],
        ['POST', '/layers/default/download-link', {}],
      ];
      for (const [method, rest, body] of attempts) {
        const answer = await call(token, method, docPath(OTHER_DOC, rest), body);
        expect(answer.status, `${method} ${rest}: ${JSON.stringify(answer.body)}`).toBe(403);
      }
      const touched = await db
        .selectFrom('audit_log')
        .select('id')
        .where('doc_id', '=', OTHER_DOC)
        .execute();
      expect(touched).toEqual([]);
    });

    test('a key reads what its document permissions name, and writes nothing else', async () => {
      const reader = await issueTenantKey('apikey:reader', [
        'docs.read',
        'doc.open',
        'doc.text.copy',
        'doc.annotate.read',
        'doc.forms.read',
      ]);
      for (const rest of [
        '/head',
        `/layers/default/text/pages/obj:${PAGE}/data`,
        `/layers/default/annotations/pages/obj:${PAGE}/items`,
        '/layers/default/form',
      ]) {
        const answer = await call(reader.token, 'GET', docPath(OWN_DOC, rest));
        expect(answer.status, `${rest}: ${JSON.stringify(answer.body)}`).toBe(200);
      }

      const writes: Array<[string, unknown]> = [
        [`/layers/reader/annotations/pages/obj:${PAGE}/items`, square],
        [`/layers/reader/form/fields/obj:${FIELD}/value`, { value: { value: 'Mal' } }],
      ];
      for (const [rest, body] of writes) {
        const answer = await call(reader.token, 'POST', docPath(OWN_DOC, rest), body);
        expect(answer.status, `${rest}: ${JSON.stringify(answer.body)}`).toBe(403);
      }
      const written = await db
        .selectFrom('audit_log')
        .select('id')
        .where('doc_id', '=', OWN_DOC)
        .where('sub', '=', 'apikey:reader')
        .execute();
      expect(written).toEqual([]);
    });

    test('a key writes what its document permissions name, and nothing else', async () => {
      const filler = await issueTenantKey('apikey:filler', ['doc.open', 'doc.forms.fill']);
      const filled = await call(
        filler.token,
        'POST',
        docPath(OWN_DOC, `/layers/filler/form/fields/obj:${FIELD}/value`),
        { value: { value: 'Cy' } },
      );
      expect(filled.status, JSON.stringify(filled.body)).toBe(200);
      const fillerAnnotates = await call(
        filler.token,
        'POST',
        docPath(OWN_DOC, `/layers/filler/annotations/pages/obj:${PAGE}/items`),
        square,
      );
      expect(fillerAnnotates.status, JSON.stringify(fillerAnnotates.body)).toBe(403);

      const reviewer = await issueTenantKey('apikey:reviewer', ['doc.open', 'doc.annotate.modify']);
      const annotated = await call(
        reviewer.token,
        'POST',
        docPath(OWN_DOC, `/layers/reviewer/annotations/pages/obj:${PAGE}/items`),
        square,
      );
      expect(annotated.status, JSON.stringify(annotated.body)).toBe(200);
      const reviewerFills = await call(
        reviewer.token,
        'POST',
        docPath(OWN_DOC, `/layers/reviewer/form/fields/obj:${FIELD}/value`),
        { value: { value: 'Dee' } },
      );
      expect(reviewerFills.status, JSON.stringify(reviewerFills.body)).toBe(403);
    });

    test('tenant scopes alone, docs.read included, are refused inside documents', async () => {
      const records = await issueTenantKey('apikey:records', [
        'docs.read',
        'docs.create',
        'tokens.issue-doc',
      ]);
      const refused = await call(records.token, 'GET', docPath(OWN_DOC, '/head'));
      expect(refused.status).toBe(403);
      expect(refused.body.error.message).toMatch(/names no document permission/);
    });

    test('a tenant key is issued only with scopes the server knows', async () => {
      await issueTenantKey('apikey:collab', [
        'docs.read',
        'annotations:update:self',
        'pdf.permissions',
      ]);
      for (const scope of [['doc.bogus'], ['docs.read', 'docs.everything']]) {
        const refused = await call(API_TOKEN, 'POST', `/v1/tenants/${OWN_TENANT}/tokens`, {
          kind: 'tenant',
          sub: 'apikey:bogus',
          scope,
          expiresIn: 3600,
        });
        expect(refused.status, JSON.stringify(scope)).toBe(400);
      }
    });

    test('a revoked key stops working on the doc plane', async () => {
      const key = await issueTenantKey('apikey:revoked', ['*']);
      const before = await call(key.token, 'GET', docPath(OWN_DOC, '/head'));
      expect(before.status).toBe(200);

      const revoked = await call(
        API_TOKEN,
        'POST',
        `/v1/tenants/${OWN_TENANT}/tokens/${key.jti}/revoke`,
        { reason: 'dashboard', expiresAtSeconds: key.expiresAt },
      );
      expect(revoked.status, JSON.stringify(revoked.body)).toBe(204);
      // The guard caches "not revoked" for a while; a fresh replica would not have.
      bundle.revokedJtisGuard!.clearCache();

      const after = await call(key.token, 'GET', docPath(OWN_DOC, '/head'));
      expect(after.status).toBe(401);
    });
  });
}
