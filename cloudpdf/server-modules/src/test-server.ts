/**
 * The test server's mechanics: a real `@cloudpdf/server` with the modules
 * mounted, whose database, files and credentials are its own. How it's
 * licensed is the caller's: `startTestServer` brings a license runtime like
 * any deployment's, the kit's own tests the server's test gate.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { adminWirePaths, type AdminDocumentInitResponse } from '@cloudpdf/contract';
import {
  createSqliteDb,
  defaultWorkerEntryUrl,
  FsObjectStore,
  migrate,
  signDevToken,
  sqliteMigrations,
  type AppBundle,
  type BuildAppOptions,
} from '@cloudpdf/server';
import type { HostedModule } from '@cloudpdf/server/modules';
import { encodePageKey, type PageRef } from '@embedpdf/engine-core/runtime';

export interface TestServerOptions {
  /** The modules to mount, in order, as `CLOUDPDF_MODULES` lists them. */
  readonly modules: ReadonlyArray<HostedModule>;
  /**
   * Their settings, as the variables the server reads: `CLOUDPDF_<ID>_<KEY>`.
   * The only place they come from: nothing is read from `process.env`.
   */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** A development license key. Defaults to `CLOUDPDF_LICENSE_KEY`. */
  readonly licenseKey?: string;
}

/** A document on the test server, ready to open. */
export interface TestDocument {
  readonly tenantId: string;
  readonly id: string;
  /** `default`; pass `{ ...doc, layerName }` for another layer. */
  readonly layerName: string;
  /** Its pages' keys in order (`obj:12`), as a route takes them. */
  readonly pages: ReadonlyArray<string>;
}

/**
 * `fetch`'s own options, and who the caller is: the scope a viewer token is
 * signed for, or a token sent as it is (`server.apiToken`, say).
 */
export type TestRequestInit = RequestInit &
  (
    | { readonly scope: ReadonlyArray<string>; readonly sub?: string; readonly token?: never }
    | { readonly token: string; readonly scope?: never; readonly sub?: never }
  );

export interface TestServer {
  /** Where it listens: `http://127.0.0.1:<port>`. */
  readonly url: string;
  /** The deployment's API token: it opens no document session, so `req.document()` is refused. */
  readonly apiToken: string;
  /** Upload a PDF through the server's upload API; answers once the document is ready. */
  addDocument(pdf: Uint8Array, options?: { readonly name?: string }): Promise<TestDocument>;
  /**
   * `fetch` for a route on the document's layer, `path` below
   * `/v1/docs/{docId}/layers/{layerName}/`: the module's (`snapshot/pages/obj:12`)
   * or the core's (`manifest`).
   */
  fetch(doc: TestDocument, path: string, init: TestRequestInit): Promise<Response>;
  /** A viewer token for the document, holding exactly `scope`. `sub` is `test-user` by default. */
  token(
    doc: TestDocument,
    scope: ReadonlyArray<string>,
    options?: { readonly sub?: string },
  ): string;
  /** Stop the server, and delete its database and files. */
  close(): Promise<void>;
}

type TestDb = NonNullable<BuildAppOptions['db']>;

/** A server's license: what builds the app with it, and closes it. */
export interface TestLicense {
  build(options: Omit<BuildAppOptions, 'license'>): Promise<AppBundle>;
  close(): Promise<void>;
}

const TENANT = 'test';
const LAYER = 'default';

/** Start the server, licensed by `license`, which gets the server's database. */
export async function launchTestServer(
  options: TestServerOptions,
  license: (db: TestDb) => Promise<TestLicense>,
): Promise<TestServer> {
  const root = await mkdtemp(join(tmpdir(), 'cloudpdf-test-server-'));
  const db = createSqliteDb({ path: ':memory:' });
  let licensed: TestLicense | undefined;
  let bundle: AppBundle | undefined;
  const teardown = async () => {
    await bundle?.shutdown();
    await licensed?.close();
    await db.destroy();
    await rm(root, { recursive: true, force: true });
  };

  const secret = randomBytes(32).toString('base64url');
  const apiToken = randomBytes(32).toString('base64url');
  let url: string;
  try {
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    licensed = await license(db);
    bundle = await licensed.build({
      verifier: { mode: 'hs256', secret },
      apiAuthTokens: [apiToken],
      modules: options.modules,
      moduleEnv: options.env ?? {},
      workerEntry: defaultWorkerEntryUrl,
      poolSize: 1,
      db,
      objectStore: new FsObjectStore({ root: join(root, 'storage') }),
      cacheRoot: join(root, 'cache'),
      signingRoot: join(root, 'signing'),
      autoProvisionTenant: true,
      sweepIntervalMs: 0,
    });
    url = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  } catch (error) {
    await teardown();
    throw error;
  }

  const token: TestServer['token'] = (doc, scope, { sub = 'test-user' } = {}) =>
    signDevToken(secret, {
      sub,
      tenant_id: doc.tenantId,
      doc_id: doc.id,
      layer_name: doc.layerName,
      scope,
      jti: randomUUID(),
    });

  const fetchDoc: TestServer['fetch'] = (doc, path, init) => {
    const { scope, sub, token: bearer, ...request } = init;
    const headers = new Headers(request.headers);
    headers.set(
      'authorization',
      `Bearer ${bearer ?? token(doc, scope ?? [], sub !== undefined ? { sub } : {})}`,
    );
    const layer = `/v1/docs/${encodeURIComponent(doc.id)}/layers/${encodeURIComponent(doc.layerName)}`;
    return fetch(`${url}${layer}/${path}`, { ...request, headers });
  };

  /** A call as the deployment, which must succeed. */
  const admin = async (path: string, body: FormData | object): Promise<unknown> => {
    const response = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiToken}`,
        ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }),
      },
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`POST ${path} answered ${response.status}: ${await response.text()}`);
    }
    return response.json();
  };

  let closed: Promise<void> | undefined;
  return {
    url,
    apiToken,
    token,
    fetch: fetchDoc,
    async addDocument(pdf, { name } = {}) {
      const bytes = new Uint8Array(pdf);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const init = (await admin(adminWirePaths.documentsInit(TENANT), {
        contentLength: bytes.byteLength,
        contentSha256: sha256,
        ...(name !== undefined ? { name } : {}),
      })) as AdminDocumentInitResponse;
      const { id } = init.document;
      // The test server stores files on disk, which takes no presigned upload.
      if (init.tag !== 'deduped' && init.upload.kind === 'proxy') {
        const form = new FormData();
        form.set('file', new Blob([bytes], { type: 'application/pdf' }), name ?? `${id}.pdf`);
        await admin(init.upload.url, form);
        await admin(adminWirePaths.documentCommit(TENANT, id), { sha256 });
      }

      const doc = { tenantId: TENANT, id, layerName: LAYER, pages: [] };
      const manifest = await fetchDoc(doc, 'manifest', { scope: ['doc.open'] });
      if (!manifest.ok) {
        throw new Error(
          `the document's manifest answered ${manifest.status}: ${await manifest.text()}`,
        );
      }
      const { pages } = (await manifest.json()) as { pages: Array<{ page: PageRef }> };
      return { ...doc, pages: pages.map(({ page }) => encodePageKey(page)) };
    },
    close: () => (closed ??= teardown()),
  };
}
