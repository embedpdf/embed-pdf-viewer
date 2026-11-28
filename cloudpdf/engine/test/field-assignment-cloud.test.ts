/**
 * A field's assignment over the cloud engine, on the wire: a real
 * @cloudpdf/server with the native runtime behind the `@cloudpdf/engine`
 * client. What a create, an update and a change carry; that a server older
 * than `assignment` gets a group's or an unassigned field's as its `groupId`,
 * and is never sent a field anyone fills in, nor a bundle with one; and that
 * its fields still read whole.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { ANYONE_FIELDS_PDF } from '@embedpdf/engine-core/conformance';
import {
  EngineError,
  EngineErrorCode,
  type DocumentHandle,
  type FieldAssignment,
  type FormFieldRef,
} from '@embedpdf/engine-core/runtime';
import { FIELD_ASSIGNMENT_SINCE } from '@embedpdf/engine-core/wire';
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
const ANYONE: FieldAssignment = { kind: 'anyone' };
const UNASSIGNED: FieldAssignment = { kind: 'unassigned' };
const inGroup = (groupId: string): FieldAssignment => ({ kind: 'group', groupId });
/** Older than this build (3.4) and than `assignment` (3.5). */
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
 * answers it: without `assignment`. A field is the object with a `valueEntry`.
 */
function withoutAssignment(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutAssignment);
  if (typeof value !== 'object' || value === null) return value;
  const isField = 'valueEntry' in value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isField || key !== 'assignment')
      .map(([key, member]) => [key, withoutAssignment(member)]),
  );
}

/**
 * A fetch that records the writes of fields (a create, an update, an import,
 * a request of changes). With `version`, the server says it is that
 * version, and its JSON answers come without `assignment`, as an older server
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
        older.append(name, stripped ? JSON.stringify(withoutAssignment(JSON.parse(value))) : value);
      }
      headers.delete('content-type');
      headers.delete('content-length');
      return new Response(older, { status: response.status, headers });
    }
    if (!type.includes('application/json')) {
      return new Response(response.body, { status: response.status, headers });
    }
    headers.delete('content-length');
    const body = JSON.stringify(withoutAssignment(await response.json()));
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

describe('field assignments, on the wire', () => {
  test('a create, an update and a change carry the assignment as given', async () => {
    const { fetchFn, sent } = recordingFetch();
    const doc = await open(fetchFn);
    try {
      const { field } = await doc.forms.create({ kind: 'text', name: 'made', assignment: ANYONE });
      expect(sent.at(-1)).toMatchObject({
        method: 'POST',
        route: '/form/fields',
        body: { kind: 'text', name: 'made', assignment: ANYONE },
      });
      expect(field.assignment).toEqual(ANYONE);

      // The groupId shorthand goes as it is.
      await doc.forms.update(field.ref, { groupId: 'dana' });
      expect(sent.at(-1)).toMatchObject({
        method: 'PATCH',
        route: '/form/fields',
        body: { groupId: 'dana' },
      });

      await doc.apply({
        ops: [{ type: 'forms.update', field: field.ref, patch: { assignment: ANYONE } }],
      });
      expect(sent.at(-1)).toMatchObject({
        method: 'POST',
        route: '/changes',
        body: { changes: [{ ops: [{ type: 'forms.update', patch: { assignment: ANYONE } }] }] },
      });
      expect((await doc.forms.get(field.ref)).assignment).toEqual(ANYONE);
    } finally {
      await doc.close();
    }
  });

  test('a server older than assignments gets a group as its groupId, and never anyone', async () => {
    const { fetchFn, sent } = recordingFetch(OLDER);
    const doc = await open(fetchFn);
    try {
      const field = named('sender_note');
      const writes: (() => Promise<unknown>)[] = [
        () => doc.forms.create({ kind: 'text', name: 'made', assignment: ANYONE }),
        () => doc.forms.update(field, { assignment: ANYONE }),
        () =>
          doc.apply({
            ops: [
              { type: 'forms.create', draft: { kind: 'text', name: 'made', assignment: ANYONE } },
            ],
          }),
        () => doc.apply({ ops: [{ type: 'forms.update', field, patch: { assignment: ANYONE } }] }),
        () =>
          doc.apply({
            ops: [
              {
                type: 'forms.update',
                field,
                patch: { required: true },
                expect: { assignment: ANYONE },
              },
            ],
          }),
      ];
      for (const write of writes) {
        const error = await refusal(write());
        expect(EngineError.is(error) && error.code).toBe(EngineErrorCode.NotImplemented);
        expect((error as EngineError).details).toMatchObject({
          field: 'assignment',
          needs: FIELD_ASSIGNMENT_SINCE,
          serverVersion: OLDER,
        });
      }
      expect(sent).toEqual([]);

      // A group's or an unassigned field's assignment goes as the groupId it knows.
      const { field: made } = await doc.forms.create({
        kind: 'text',
        name: 'made',
        assignment: inGroup('dana'),
      });
      expect(sent.at(-1)!.body).toEqual({ kind: 'text', name: 'made', groupId: 'dana' });
      expect(made.assignment).toEqual(inGroup('dana'));
      await doc.forms.update(made.ref, { assignment: UNASSIGNED });
      expect(sent.at(-1)!.body).toEqual({ groupId: null });
      await doc.apply({
        ops: [
          {
            type: 'forms.update',
            field: made.ref,
            patch: { assignment: inGroup('ada') },
            expect: { assignment: UNASSIGNED },
          },
        ],
      });
      expect(sent.at(-1)).toMatchObject({
        body: {
          changes: [{ ops: [{ patch: { groupId: 'ada' }, expect: { groupId: null } }] }],
        },
      });
      expect(JSON.stringify(sent.at(-1)!.body)).not.toContain('assignment');
      expect((await doc.forms.get(made.ref)).assignment).toEqual(inGroup('ada'));

      // A misspelt kind goes as it is, for the server to refuse: never as no group.
      const misspelt = { kind: 'unasigned' } as unknown as FieldAssignment;
      const typo = await refusal(doc.forms.update(made.ref, { assignment: misspelt }));
      expect(EngineError.is(typo) && typo.code).toBe(EngineErrorCode.InvalidArg);
      expect(sent.at(-1)!.body).toEqual({ assignment: misspelt });
      expect((await doc.forms.get(made.ref)).assignment).toEqual(inGroup('ada'));

      // A write that names neither goes out as it always did.
      await doc.forms.create({ kind: 'text', name: 'plain' });
      expect(sent.at(-1)!.body).toEqual({ kind: 'text', name: 'plain' });

      // An import of a bundle with a field anyone fills in never goes out: an
      // older server would make it an unassigned one.
      const exported = await doc.forms.export({ fields: [named('sender_note')] });
      const marked = {
        ...exported,
        fields: exported.fields.map((row) => ({
          ...row,
          data: { ...row.data, assignment: ANYONE },
        })),
      };
      const before = sent.length;
      const refused = await refusal(doc.forms.import(marked, { attribution: 'stamp' }));
      expect(EngineError.is(refused) && refused.code).toBe(EngineErrorCode.NotImplemented);
      expect((refused as EngineError).details).toMatchObject({
        field: 'assignment',
        needs: FIELD_ASSIGNMENT_SINCE,
        serverVersion: OLDER,
      });
      expect(sent).toHaveLength(before);
      // A bundle without one goes out.
      await doc.forms.import(exported, { attribution: 'stamp' });
      expect(sent.at(-1)).toMatchObject({ method: 'POST', route: '/form/import' });
    } finally {
      await doc.close();
    }
  });

  test("an older server's fields read their assignment from their group, in a list, an answer and a bundle", async () => {
    const { fetchFn } = recordingFetch(OLDER);
    const doc = await open(fetchFn);
    try {
      const { fields } = await doc.forms.list();
      const assignments = Object.fromEntries(fields.map((f) => [f.name, f.assignment]));
      expect(assignments).toMatchObject({
        dana_name: inGroup('dana'),
        reference: UNASSIGNED,
        sender_note: UNASSIGNED,
      });
      const { field } = await doc.forms.update(named('reference'), { required: true });
      expect(field.assignment).toEqual(UNASSIGNED);
      const bundle = await doc.forms.export({ fields: [named('dana_name'), named('notes')] });
      expect(bundle.fields.map(({ data }) => [data.name, data.assignment])).toEqual([
        ['dana_name', inGroup('dana')],
        ['notes', UNASSIGNED],
      ]);
    } finally {
      await doc.close();
    }
  });
});
