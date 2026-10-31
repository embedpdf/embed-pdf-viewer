/**
 * The browser side of a server module: `cloudDocument(doc).module(id).fetch()` reaches the
 * module's routes on the document's layer with the document's token and answers a plain
 * `Response`, and `doc.security.allows()` answers for a plugin's own permission.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { EngineErrorCode, type DocumentHandle } from '@embedpdf/engine-core/runtime';

import type { HostedModule } from '../../server/src/modules/protocol';
import { cloudDocument, cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'sample.pdf',
);

// The module's permission, declared the way a plugin declares its own.
declare module '@embedpdf/engine-core/runtime' {
  interface PluginPermissions {
    'echo.read': true;
  }
}

const TENANT_ID = 'cloud-module-channel-tenant';
const DOC_ID = 'module-channel-doc';

const json = (value: unknown) => ({ type: 'application/json', body: JSON.stringify(value) });

/** A module with two routes: one that says who asked and what, one that echoes bytes. */
const echo: HostedModule = {
  id: 'echo',
  permissions: { read: { level: 'document', label: 'Read the echo' } },
  setup(host) {
    host.docRoute({
      method: 'GET',
      path: 'hello',
      permission: 'read',
      async handler(req) {
        return json({ sub: req.session.sub, query: req.query, layer: req.layerName });
      },
    });
    host.docRoute({
      method: 'POST',
      path: 'bytes',
      permission: 'read',
      async handler(req) {
        const body = req.body instanceof Uint8Array ? req.body : new Uint8Array();
        return { type: 'application/octet-stream', body: body.slice().reverse() };
      },
    });
  },
};

let fx: DbSeededFixture | undefined;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-module-channel-secret', modules: [echo] });
  await seedDocumentFromBytes(fx, TENANT_ID, DOC_ID, fixturePath, 8);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

async function open(scope: string[]) {
  const engine = cloudEngine({
    baseUrl: fx!.baseUrl,
    token: docScopedToken(fx!, TENANT_ID, DOC_ID, scope),
  });
  const doc = await engine.open({ kind: 'id', id: DOC_ID });
  return {
    doc,
    async [Symbol.asyncDispose]() {
      await doc.close();
      await engine.destroy();
    },
  };
}

describe('a server module, from the browser', () => {
  test("reaches the module's routes on the document's layer, with the document's token", async () => {
    await using session = await open(['doc.open', 'echo.read']);
    const channel = cloudDocument(session.doc)!.module('echo');
    const hello = await channel.fetch('hello?greeting=hi');
    expect(hello.status).toBe(200);
    expect(await hello.json()).toEqual({
      sub: 'cloud-test',
      query: { greeting: 'hi' },
      layer: 'default',
    });

    const echoed = await channel.fetch('/bytes', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: new Uint8Array([1, 2, 3]),
    });
    expect(new Uint8Array(await echoed.arrayBuffer())).toEqual(new Uint8Array([3, 2, 1]));
  });

  test("answers the module's refusal as a response, not an error", async () => {
    await using session = await open(['doc.open']);
    const refused = await cloudDocument(session.doc)!.module('echo').fetch('hello');
    expect(refused.status).toBe(403);
    expect(refused.ok).toBe(false);
  });

  test("refuses an id that can't be a module's", async () => {
    await using session = await open(['doc.open', 'echo.read']);
    for (const id of ['doc', 'Echo', 'echo/hello', '']) {
      expect(() => cloudDocument(session.doc)!.module(id)).toThrow(
        expect.objectContaining({ code: EngineErrorCode.InvalidArg }),
      );
    }
  });

  test('is null for a document that is not open on the cloud engine', () => {
    expect(cloudDocument({} as DocumentHandle)).toBeNull();
  });
});

describe("a plugin's own permission in allows()", () => {
  test("is the server's answer once /access answered, else what the token names", async () => {
    await using named = await open(['doc.open', 'echo.read']);
    expect(named.doc.security.allows('echo.read')).toBe(true);
    // @ts-expect-error a permission no plugin declared is a type error
    expect(named.doc.security.allows('other.read')).toBe(false);

    await using everything = await open(['*']);
    // `*` includes every installed plugin's permissions, on the server's word too.
    expect(everything.doc.security.allows('echo.read')).toBe(true);
    expect(everything.doc.security.scope).toContain('echo.read');

    await using without = await open(['doc.open']);
    expect(without.doc.security.allows('echo.read')).toBe(false);
  });
});
