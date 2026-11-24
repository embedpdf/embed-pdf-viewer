/**
 * A field's purpose and format over the cloud engine, on the wire: a real
 * @cloudpdf/server with the native runtime behind the `@cloudpdf/engine`
 * client. What a create and an update carry, that a server older than both
 * facts is never sent either, and that its fields still read whole.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { FIELD_PURPOSE_FORMAT_PDF } from '@embedpdf/engine-core/conformance';
import {
  EngineError,
  EngineErrorCode,
  type DocumentHandle,
  type FormField,
  type FormFieldRef,
} from '@embedpdf/engine-core/runtime';
import { FIELD_PURPOSE_AND_FORMAT_SINCE } from '@embedpdf/engine-core/wire';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocument,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const TENANT_ID = 'cloud-field-purpose-format-wire-tenant';
const named = (name: string): FormFieldRef => ({ kind: 'fqn', name });
const DATE = { kind: 'date', pattern: 'dd/mm/yyyy' } as const;

let fx: DbSeededFixture | undefined;
let docs = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-field-purpose-format-wire-secret' });
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
 * answers it: without its `purpose` and its `format`. A field is the object
 * with a `valueEntry`.
 */
function withoutFacts(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutFacts);
  if (typeof value !== 'object' || value === null) return value;
  const isField = 'valueEntry' in value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isField || (key !== 'purpose' && key !== 'format'))
      .map(([key, member]) => [key, withoutFacts(member)]),
  );
}

/**
 * A fetch that records the writes of fields (a create, an update, a request
 * of changes). With `version`, the server says it is that version, and its
 * JSON answers come without a field's purpose and format, as a server older
 * than both sends them.
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
        older.append(name, stripped ? JSON.stringify(withoutFacts(JSON.parse(value))) : value);
      }
      headers.delete('content-type');
      headers.delete('content-length');
      return new Response(older, { status: response.status, headers });
    }
    if (!type.includes('application/json')) {
      return new Response(response.body, { status: response.status, headers });
    }
    headers.delete('content-length');
    const body = JSON.stringify(withoutFacts(await response.json()));
    return new Response(body, { status: response.status, headers });
  };
  return { fetchFn, sent };
}

async function open(fetchFn: typeof fetch): Promise<DocumentHandle> {
  const docId = `cloud-field-facts-${++docs}`;
  await seedDocument(fx!, TENANT_ID, docId, FIELD_PURPOSE_FORMAT_PDF);
  const engine = cloudEngine({ baseUrl: fx!.baseUrl, fetch: fetchFn });
  return engine.open({ kind: 'token', token: docScopedToken(fx!, TENANT_ID, docId) });
}

const formatOf = (field: FormField) => ('format' in field ? field.format : undefined);

describe("a field's purpose and format on the wire", () => {
  test('a create and an update carry both as they are given', async () => {
    const { fetchFn, sent } = recordingFetch();
    const doc = await open(fetchFn);
    try {
      const { field } = await doc.forms.create({
        kind: 'text',
        name: 'made',
        purpose: 'date-signed',
        format: DATE,
      });
      expect(sent.at(-1)).toMatchObject({
        method: 'POST',
        route: '/form/fields',
        body: { kind: 'text', name: 'made', purpose: 'date-signed', format: DATE },
      });
      expect([field.purpose, formatOf(field)]).toEqual(['date-signed', DATE]);

      await doc.forms.update(field.ref, { purpose: null, format: null });
      expect(sent.at(-1)).toMatchObject({
        method: 'PATCH',
        route: '/form/fields',
        body: { purpose: null, format: null },
      });

      await doc.apply({
        ops: [{ type: 'forms.update', field: field.ref, patch: { purpose: 'email' } }],
      });
      expect(sent.at(-1)).toMatchObject({
        method: 'POST',
        route: '/changes',
        body: { changes: [{ ops: [{ type: 'forms.update', patch: { purpose: 'email' } }] }] },
      });
      expect((await doc.forms.get(field.ref)).purpose).toBe('email');
    } finally {
      await doc.close();
    }
  });

  test('a server older than both is never sent either, and the refusal names both versions', async () => {
    // The packages still carry the version before the one both arrive in, and
    // a side of this build's own version is never read as lacking: an older one is.
    const { fetchFn, sent } = recordingFetch('3.2');
    const doc = await open(fetchFn);
    try {
      const field = named('plain_six');
      const writes: [fact: string, write: () => Promise<unknown>][] = [
        ['purpose', () => doc.forms.create({ kind: 'text', name: 'made', purpose: 'email' })],
        ['purpose', () => doc.forms.create({ kind: 'text', name: 'made', purpose: null })],
        ['format', () => doc.forms.create({ kind: 'text', name: 'made', format: DATE })],
        ['purpose', () => doc.forms.update(field, { purpose: 'email' })],
        ['purpose', () => doc.forms.update(field, { purpose: null })],
        ['format', () => doc.forms.update(field, { format: DATE })],
        ['format', () => doc.forms.update(field, { format: null })],
        [
          'purpose',
          () =>
            doc.apply({
              ops: [{ type: 'forms.create', draft: { kind: 'text', name: 'made', purpose: 'x' } }],
            }),
        ],
        [
          'format',
          () => doc.apply({ ops: [{ type: 'forms.update', field, patch: { format: DATE } }] }),
        ],
        [
          'purpose',
          () =>
            doc.apply({
              ops: [
                {
                  type: 'forms.update',
                  field,
                  patch: { required: true },
                  expect: { purpose: null },
                },
              ],
            }),
        ],
        [
          'format',
          () => doc.apply({ ops: [{ type: 'forms.delete', field, expect: { format: null } }] }),
        ],
      ];
      for (const [fact, write] of writes) {
        const error = await write().then(
          () => null,
          (refusal: unknown) => refusal,
        );
        expect(EngineError.is(error) && error.code, fact).toBe(EngineErrorCode.NotImplemented);
        expect((error as EngineError).details).toMatchObject({
          field: fact,
          needs: FIELD_PURPOSE_AND_FORMAT_SINCE,
          serverVersion: '3.2',
        });
      }
      expect(sent).toEqual([]);

      // A write that names neither goes out as it always did.
      const { field: made } = await doc.forms.create({ kind: 'text', name: 'made' });
      await doc.forms.update(made.ref, { required: true });
      await doc.apply({ ops: [{ type: 'forms.update', field, patch: { required: true } }] });
      expect(sent.map((write) => [write.method, write.route])).toEqual([
        ['POST', '/form/fields'],
        ['PATCH', '/form/fields'],
        ['POST', '/changes'],
      ]);
      expect((await doc.forms.get(made.ref)).required).toBe(true);

      // An import writes a purpose too: such a server would make the field
      // without it and list nothing as left out, so the bundle never goes out.
      const exported = await doc.forms.export({ fields: [named('plain_one')] });
      const purposed = {
        ...exported,
        fields: exported.fields.map((row) => ({
          ...row,
          data: { ...row.data, purpose: 'date-signed' },
        })),
      };
      const before = sent.length;
      const refusal = await doc.forms.import(purposed, { attribution: 'stamp' }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(EngineError.is(refusal) && refusal.code).toBe(EngineErrorCode.NotImplemented);
      expect((refusal as EngineError).details).toMatchObject({
        field: 'purpose',
        needs: FIELD_PURPOSE_AND_FORMAT_SINCE,
        serverVersion: '3.2',
      });
      expect(sent).toHaveLength(before);
      // A bundle with no purpose goes out, its date format with it: such a
      // server reads that from the field's scripts.
      await doc.forms.import(exported, { attribution: 'stamp' });
      expect(sent.at(-1)).toMatchObject({ method: 'POST', route: '/form/import' });
    } finally {
      await doc.close();
    }
  });

  test('an import checks its bundle before it asks what the server has', async () => {
    // Against a server of this version and against an older one: a bundle
    // that is none is refused as it always was, through the promise.
    for (const version of [undefined, '3.2']) {
      const { fetchFn, sent } = recordingFetch(version);
      const doc = await open(fetchFn);
      try {
        const exported = await doc.forms.export({ fields: [named('plain_one')] });
        const broken: unknown[] = [
          { ...exported, fields: [{ data: null }] },
          { ...exported, fields: [null] },
          { ...exported, fields: undefined },
          { ...exported, fields: [{ data: { purpose: 'email' } }] },
        ];
        for (const bundle of broken) {
          let attempt: Promise<unknown> | undefined;
          expect(() => {
            attempt = doc.forms.import(bundle as never);
          }).not.toThrow();
          const refusal = await attempt!.then(
            () => null,
            (error: unknown) => error,
          );
          expect(EngineError.is(refusal) && refusal.code).toBe(EngineErrorCode.InvalidArg);
        }
        expect(sent).toEqual([]);
      } finally {
        await doc.close();
      }
    }
  });

  test("an older server's fields read whole: no purpose, and the format their scripts give", async () => {
    const { fetchFn } = recordingFetch('3.2');
    const doc = await open(fetchFn);
    try {
      const { fields } = await doc.forms.list();
      const facts = Object.fromEntries(
        fields.map((field) => [field.name, [field.purpose, formatOf(field)]]),
      );
      expect(facts).toMatchObject({
        // The format script decides, read by the client as the server reads it.
        plain_one: [null, { kind: 'date', pattern: 'm/d/yy' }],
        plain_three: [null, null],
        plain_four: [null, { kind: 'date', pattern: 'm/d' }],
        plain_five: [null, { kind: 'other' }],
        time_numbered: [null, { kind: 'time', pattern: 'h:MM tt' }],
        dropdown_date: [null, { kind: 'date', pattern: 'yyyy-mm-dd' }],
        // A purpose in the file is one such a server doesn't read.
        full_name: [null, null],
        sign_here: [null, undefined],
        list_with_script: [null, undefined],
      });
      // An answer to a write reads the same way.
      const { field } = await doc.forms.update(named('plain_one'), { required: true });
      expect([field.purpose, formatOf(field)]).toEqual([null, { kind: 'date', pattern: 'm/d/yy' }]);
      // And so do the fields of a bundle it exports.
      const bundle = await doc.forms.export({
        fields: [named('plain_one'), named('plain_five'), named('full_name'), named('sign_here')],
      });
      expect(bundle.fields.map(({ data }) => [data.name, data.purpose, formatOf(data)])).toEqual([
        ['plain_one', null, { kind: 'date', pattern: 'm/d/yy' }],
        ['plain_five', null, { kind: 'other' }],
        ['full_name', null, null],
        ['sign_here', null, undefined],
      ]);
    } finally {
      await doc.close();
    }
  });
});
