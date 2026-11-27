/**
 * Fields anyone fills in over the cloud engine, on the wire: a real
 * @cloudpdf/server with the native runtime behind the `@cloudpdf/engine`
 * client. What a create, an update and a change carry, that a server older
 * than such fields is never sent `forAnyone` nor a bundle with one, and that
 * its fields still read whole.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { ANYONE_FIELDS_PDF } from '@embedpdf/engine-core/conformance';
import {
  EngineError,
  EngineErrorCode,
  type DocumentHandle,
  type FormFieldRef,
} from '@embedpdf/engine-core/runtime';
import { ANYONE_FIELDS_SINCE } from '@embedpdf/engine-core/wire';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocument,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const TENANT_ID = 'cloud-anyone-fields-wire-tenant';
const named = (name: string): FormFieldRef => ({ kind: 'fqn', name });
/** Older than this build (3.4) and than fields anyone fills in (3.5). */
const OLDER = '3.3';

let fx: DbSeededFixture | undefined;
let docs = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-anyone-fields-wire-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

/** One write as it went out: its method, the end of its route, and its JSON. */
interface SentWrite {
  method: string;
  route: string;
  body: unknown;
}

/**
 * `value` with every form field in it, at any depth, as an older server
 * answers it: without `forAnyone`. A field is the object with a `valueEntry`.
 */
function withoutForAnyone(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutForAnyone);
  if (typeof value !== 'object' || value === null) return value;
  const isField = 'valueEntry' in value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isField || key !== 'forAnyone')
      .map(([key, member]) => [key, withoutForAnyone(member)]),
  );
}

/**
 * A fetch that records the writes of fields (a create, an update, an import,
 * a request of changes). With `version`, the server says it is that
 * version, and its JSON answers come without `forAnyone`, as an older server
 * sends them.
 */
function recordingFetch(version?: string) {
  const sent: SentWrite[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url).pathname;
    const method = init?.method ?? 'GET';
    const route = ['/form/fields', '/form/import', '/changes'].find((part) => path.includes(part));
    if (route && (method === 'POST' || method === 'PATCH')) {
      // An import's body is multipart: only that it went out is recorded.
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      sent.push({ method, route, body });
    }
    const response = await fetch(input, init);
    if (version === undefined) return response;
    const headers = new Headers(response.headers);
    headers.set('EmbedPDF-Server-Version', version);
    const type = headers.get('content-type') ?? '';
    if (type.includes('multipart/form-data')) {
      // An exported bundle: its `body` part holds the fields.
      const older = new FormData();
      for (const [name, value] of (await response.formData()).entries()) {
        const stripped = name === 'body' && typeof value === 'string';
        older.append(name, stripped ? JSON.stringify(withoutForAnyone(JSON.parse(value))) : value);
      }
      headers.delete('content-type');
      headers.delete('content-length');
      return new Response(older, { status: response.status, headers });
    }
    if (!type.includes('application/json')) {
      return new Response(response.body, { status: response.status, headers });
    }
    headers.delete('content-length');
    const body = JSON.stringify(withoutForAnyone(await response.json()));
    return new Response(body, { status: response.status, headers });
  };
  return { fetchFn, sent };
}

async function open(fetchFn: typeof fetch): Promise<DocumentHandle> {
  const docId = `cloud-anyone-fields-${++docs}`;
  await seedDocument(fx!, TENANT_ID, docId, ANYONE_FIELDS_PDF);
  const engine = cloudEngine({ baseUrl: fx!.baseUrl, fetch: fetchFn });
  return engine.open({ kind: 'token', token: docScopedToken(fx!, TENANT_ID, docId) });
}

const refusal = (attempt: Promise<unknown>): Promise<unknown> =>
  attempt.then(
    () => null,
    (error: unknown) => error,
  );

describe('fields anyone fills in, on the wire', () => {
  test('a create, an update and a change carry forAnyone as given', async () => {
    const { fetchFn, sent } = recordingFetch();
    const doc = await open(fetchFn);
    try {
      const { field } = await doc.forms.create({ kind: 'text', name: 'made', forAnyone: true });
      expect(sent.at(-1)).toMatchObject({
        method: 'POST',
        route: '/form/fields',
        body: { kind: 'text', name: 'made', forAnyone: true },
      });
      expect(field.forAnyone).toBe(true);

      await doc.forms.update(field.ref, { forAnyone: false });
      expect(sent.at(-1)).toMatchObject({
        method: 'PATCH',
        route: '/form/fields',
        body: { forAnyone: false },
      });

      await doc.apply({
        ops: [{ type: 'forms.update', field: field.ref, patch: { forAnyone: true } }],
      });
      expect(sent.at(-1)).toMatchObject({
        method: 'POST',
        route: '/changes',
        body: { changes: [{ ops: [{ type: 'forms.update', patch: { forAnyone: true } }] }] },
      });
      expect((await doc.forms.get(field.ref)).forAnyone).toBe(true);
    } finally {
      await doc.close();
    }
  });

  test('a server older than such fields is never sent forAnyone, and the refusal names both versions', async () => {
    const { fetchFn, sent } = recordingFetch(OLDER);
    const doc = await open(fetchFn);
    try {
      const field = named('sender_note');
      const writes: (() => Promise<unknown>)[] = [
        () => doc.forms.create({ kind: 'text', name: 'made', forAnyone: true }),
        // `false` too: an older server's schema refuses a member it doesn't know.
        () => doc.forms.create({ kind: 'text', name: 'made', forAnyone: false }),
        () => doc.forms.update(field, { forAnyone: true }),
        () => doc.forms.update(field, { forAnyone: false }),
        () =>
          doc.apply({
            ops: [{ type: 'forms.create', draft: { kind: 'text', name: 'made', forAnyone: true } }],
          }),
        () => doc.apply({ ops: [{ type: 'forms.update', field, patch: { forAnyone: true } }] }),
        () =>
          doc.apply({
            ops: [
              {
                type: 'forms.update',
                field,
                patch: { required: true },
                expect: { forAnyone: false },
              },
            ],
          }),
      ];
      for (const write of writes) {
        const error = await refusal(write());
        expect(EngineError.is(error) && error.code).toBe(EngineErrorCode.NotImplemented);
        expect((error as EngineError).details).toMatchObject({
          field: 'forAnyone',
          needs: ANYONE_FIELDS_SINCE,
          serverVersion: OLDER,
        });
      }
      expect(sent).toEqual([]);

      // A write that doesn't name it goes out as it always did.
      const { field: made } = await doc.forms.create({ kind: 'text', name: 'made' });
      await doc.forms.update(made.ref, { required: true });
      await doc.apply({ ops: [{ type: 'forms.update', field, patch: { required: true } }] });
      expect(sent.map((write) => [write.method, write.route])).toEqual([
        ['POST', '/form/fields'],
        ['PATCH', '/form/fields'],
        ['POST', '/changes'],
      ]);

      // An import of a bundle with such a field never goes out: an older
      // server would make it an ordinary field.
      const exported = await doc.forms.export({ fields: [named('sender_note')] });
      const marked = {
        ...exported,
        fields: exported.fields.map((row) => ({ ...row, data: { ...row.data, forAnyone: true } })),
      };
      const before = sent.length;
      const refused = await refusal(doc.forms.import(marked, { attribution: 'stamp' }));
      expect(EngineError.is(refused) && refused.code).toBe(EngineErrorCode.NotImplemented);
      expect((refused as EngineError).details).toMatchObject({
        field: 'forAnyone',
        needs: ANYONE_FIELDS_SINCE,
        serverVersion: OLDER,
      });
      expect(sent).toHaveLength(before);
      // A bundle whose fields all read `forAnyone: false` goes out.
      await doc.forms.import(exported, { attribution: 'stamp' });
      expect(sent.at(-1)).toMatchObject({ method: 'POST', route: '/form/import' });
    } finally {
      await doc.close();
    }
  });

  test("an older server's fields read forAnyone: false, in a list, an answer and a bundle", async () => {
    const { fetchFn } = recordingFetch(OLDER);
    const doc = await open(fetchFn);
    try {
      const { fields } = await doc.forms.list();
      expect(fields.every((field) => field.forAnyone === false)).toBe(true);
      const { field } = await doc.forms.update(named('reference'), { required: true });
      expect(field.forAnyone).toBe(false);
      const bundle = await doc.forms.export({ fields: [named('reference'), named('notes')] });
      expect(bundle.fields.map(({ data }) => [data.name, data.forAnyone])).toEqual([
        ['reference', false],
        ['notes', false],
      ]);
    } finally {
      await doc.close();
    }
  });
});
