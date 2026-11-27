/**
 * A push button's picture and a widget's layout over the cloud engine, on
 * the wire: a real @cloudpdf/server with the native runtime behind the
 * `@cloudpdf/engine` client. What a write carries, that a server older than
 * both is never sent either, and that its rows still read whole.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { BANDS_PNG, PICTURE_BUTTON_PDF } from '@embedpdf/engine-core/conformance';
import {
  EngineError,
  EngineErrorCode,
  toPageRef,
  type DocumentHandle,
  type FormField,
  type FormFieldRef,
} from '@embedpdf/engine-core/runtime';
import { BUTTON_IMAGE_AND_LAYOUT_SINCE } from '@embedpdf/engine-core/wire';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocument,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const TENANT_ID = 'cloud-picture-button-wire-tenant';
const PAGE = toPageRef(3);
const named = (name: string): FormFieldRef => ({ kind: 'fqn', name });
const box = (row: number) => ({ x: 300, y: 40 + row * 40, width: 90, height: 30 });
/**
 * An older server. The packages still carry 3.4, the version before the one
 * both arrive in, and a side of this build's own version is never read as
 * lacking: an older one is. After the release a 3.4 server is gated the same way.
 */
const OLDER = '3.3';

let fx: DbSeededFixture | undefined;
let docs = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-picture-button-wire-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

/** One write as it went out: its method, the end of its route, and its JSON, or its parts. */
interface SentWrite {
  method: string;
  route: string;
  body: unknown;
  parts: string[];
}

/**
 * `value` as an older server answers it: every form field in it, at any
 * depth, without `hasImage`, and every widget row without `layout`. A field
 * is the object with a `valueEntry`, a widget row the one whose `subtype`
 * is `widget`.
 */
function withoutFacts(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutFacts);
  if (typeof value !== 'object' || value === null) return value;
  const isField = 'valueEntry' in value;
  const isWidget = (value as { subtype?: unknown }).subtype === 'widget';
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !(isField && key === 'hasImage') && !(isWidget && key === 'layout'))
      .map(([key, member]) => [key, withoutFacts(member)]),
  );
}

/**
 * A fetch that records the writes of the form (a create, a widget's add or
 * update, an import, a request of changes). With `version`, the server says
 * it is that version, and its JSON answers come without the two facts, as a
 * server older than both sends them.
 */
function recordingFetch(version?: string) {
  const sent: SentWrite[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url).pathname;
    const method = init?.method ?? 'GET';
    const route = ['/form/fields', '/form/widgets', '/form/import', '/changes'].find((part) =>
      path.includes(part),
    );
    if (route && (method === 'POST' || method === 'PATCH')) {
      if (init?.body instanceof FormData) {
        const form = init.body;
        const body = form.get('body');
        sent.push({
          method,
          route,
          body: typeof body === 'string' ? JSON.parse(body) : null,
          parts: [...form.keys()],
        });
      } else {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        sent.push({ method, route, body, parts: [] });
      }
    }
    const response = await fetch(input, init);
    if (version === undefined) return response;
    const headers = new Headers(response.headers);
    headers.set('EmbedPDF-Server-Version', version);
    const type = headers.get('content-type') ?? '';
    if (type.includes('multipart/form-data')) {
      // An exported bundle: its `body` part holds the rows.
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
  const docId = `cloud-picture-button-${++docs}`;
  await seedDocument(fx!, TENANT_ID, docId, PICTURE_BUTTON_PDF);
  const engine = cloudEngine({ baseUrl: fx!.baseUrl, fetch: fetchFn });
  return engine.open({ kind: 'token', token: docScopedToken(fx!, TENANT_ID, docId) });
}

const hasImageOf = (field: FormField) => (field.kind === 'pushbutton' ? field.hasImage : undefined);
const refusal = (attempt: Promise<unknown>): Promise<unknown> =>
  attempt.then(
    () => null,
    (error: unknown) => error,
  );

describe("a push button's picture and a widget's layout on the wire", () => {
  test('a picture travels as a part of a change, and no picture as none', async () => {
    const { fetchFn, sent } = recordingFetch();
    const doc = await open(fetchFn);
    try {
      const { field } = await doc.forms.create({
        kind: 'pushbutton',
        name: 'initials',
        widgets: [{ page: PAGE, box: box(0), layout: 'image' }],
      });
      expect(sent.at(-1)).toMatchObject({
        method: 'POST',
        route: '/form/fields',
        body: { kind: 'pushbutton', widgets: [{ layout: 'image' }] },
      });

      const filled = await doc.forms.setButtonImage(field.ref, BANDS_PNG);
      expect(hasImageOf(filled.field)).toBe(true);
      const withPicture = sent.at(-1)!;
      expect(withPicture).toMatchObject({
        method: 'POST',
        route: '/changes',
        body: {
          changes: [{ ops: [{ type: 'forms.setButtonImage', resources: { image: 'r0' } }] }],
        },
      });
      expect(withPicture.parts).toEqual(['body', 'resource:r0']);

      await doc.forms.setButtonImage(field.ref, null);
      expect(sent.at(-1)).toMatchObject({
        method: 'POST',
        route: '/changes',
        body: {
          changes: [{ ops: [{ type: 'forms.setButtonImage', resources: { image: null } }] }],
        },
        parts: [],
      });
      expect(hasImageOf(await doc.forms.get(field.ref))).toBe(false);
    } finally {
      await doc.close();
    }
  });

  test('a server older than both is never sent either, and the refusal names both versions', async () => {
    const { fetchFn, sent } = recordingFetch(OLDER);
    const doc = await open(fetchFn);
    try {
      const { widgets } = await doc.forms.list();
      const plain = widgets.find((row) => row.layout === 'caption')!;
      const writes: [detail: Record<string, unknown>, write: () => Promise<unknown>][] = [
        [
          { kind: 'forms.setButtonImage' },
          () => doc.forms.setButtonImage(named('layout_1'), BANDS_PNG),
        ],
        [{ kind: 'forms.setButtonImage' }, () => doc.forms.setButtonImage(named('layout_1'), null)],
        [
          { field: 'layout' },
          () =>
            doc.forms.create({
              kind: 'pushbutton',
              name: 'made',
              widgets: [{ page: PAGE, box: box(0), layout: 'image' }],
            }),
        ],
        [
          { field: 'layout' },
          () =>
            doc.forms.create({
              kind: 'pushbutton',
              name: 'made',
              widgets: [{ page: PAGE, box: box(0), layout: 'caption' }],
            }),
        ],
        [
          { field: 'layout' },
          () =>
            doc.forms.addWidget(named('layout_none'), { page: PAGE, box: box(1), layout: 'image' }),
        ],
        [{ field: 'layout' }, () => doc.forms.updateWidget(plain.ref, { layout: 'image' })],
        [
          { field: 'layout' },
          () =>
            doc.apply({
              ops: [{ type: 'forms.updateWidget', widget: plain.ref, patch: { layout: 'image' } }],
            }),
        ],
        [
          { field: 'layout' },
          () =>
            doc.apply({
              ops: [
                {
                  type: 'forms.updateWidget',
                  widget: plain.ref,
                  patch: { color: '#123456' },
                  expect: { layout: 'caption' },
                },
              ],
            }),
        ],
        [
          { kind: 'forms.setButtonImage' },
          () =>
            doc.apply({
              ops: [{ type: 'forms.setButtonImage', field: named('layout_1'), image: BANDS_PNG }],
            }),
        ],
      ];
      for (const [detail, write] of writes) {
        const error = await refusal(write());
        expect(EngineError.is(error) && error.code, JSON.stringify(detail)).toBe(
          EngineErrorCode.NotImplemented,
        );
        expect((error as EngineError).details).toMatchObject({
          ...detail,
          needs: BUTTON_IMAGE_AND_LAYOUT_SINCE,
          serverVersion: OLDER,
        });
      }
      expect(sent).toEqual([]);

      // A write that names neither goes out as it always did.
      const { field: made } = await doc.forms.create({
        kind: 'pushbutton',
        name: 'made',
        widgets: [{ page: PAGE, box: box(0), caption: 'Go' }],
      });
      await doc.forms.updateWidget(plain.ref, { color: '#123456' });
      expect(sent.map((write) => [write.method, write.route])).toEqual([
        ['POST', '/form/fields'],
        ['PATCH', '/form/widgets'],
      ]);
      expect(made.kind).toBe('pushbutton');

      // An import of a button that shows a picture, or names one, never goes out.
      const exported = await doc.forms.export({ fields: [named('layout_none')] });
      const laidOut = {
        ...exported,
        widgets: exported.widgets.map((row) => ({
          ...row,
          data: { ...row.data, layout: 'image' as const },
        })),
      };
      const before = sent.length;
      const refused = await refusal(doc.forms.import(laidOut, { attribution: 'stamp' }));
      expect(EngineError.is(refused) && refused.code).toBe(EngineErrorCode.NotImplemented);
      expect((refused as EngineError).details).toMatchObject({
        field: 'layout',
        needs: BUTTON_IMAGE_AND_LAYOUT_SINCE,
        serverVersion: OLDER,
      });
      expect(sent).toHaveLength(before);
      // A bundle of caption-only buttons goes out: that is what any server makes.
      await doc.forms.import(exported, { attribution: 'stamp' });
      expect(sent.at(-1)).toMatchObject({ method: 'POST', route: '/form/import' });
    } finally {
      await doc.close();
    }
  });

  test("an older server's rows read whole: a button's widget its caption, no picture", async () => {
    const { fetchFn } = recordingFetch(OLDER);
    const doc = await open(fetchFn);
    try {
      const { fields, widgets } = await doc.forms.list();
      const byName = Object.fromEntries(fields.map((field) => [field.name, field]));
      // Such a server says nothing of a picture, so none is read, the
      // standard's own image field's included.
      expect(hasImageOf(byName.acrobat_image!)).toBe(false);
      expect(hasImageOf(byName.layout_1!)).toBe(false);
      expect('hasImage' in byName.text_field!).toBe(false);
      const layoutOf = (name: string) =>
        widgets.find(
          (row) =>
            row.field?.kind === 'objectNumber' &&
            row.field.objectNumber === (byName[name]!.ref as { objectNumber: number }).objectNumber,
        )!.layout;
      expect([layoutOf('acrobat_image'), layoutOf('layout_6')]).toEqual(['caption', 'caption']);
      expect([layoutOf('text_field'), layoutOf('sig_field')]).toEqual([null, null]);

      // An answer to a write reads the same way, and so does an exported bundle.
      const { field } = await doc.forms.update(named('layout_1'), { required: true });
      expect(hasImageOf(field)).toBe(false);
      const bundle = await doc.forms.export({ fields: [named('layout_1'), named('text_field')] });
      expect(bundle.fields.map(({ data }) => hasImageOf(data))).toEqual([false, undefined]);
      expect(bundle.widgets.map(({ data }) => data.layout)).toEqual(['caption', null]);
    } finally {
      await doc.close();
    }
  });
});
