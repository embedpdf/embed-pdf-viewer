/**
 * A signature field's mark over the cloud engine, on the wire: a real
 * @cloudpdf/server with the native runtime behind the `@cloudpdf/engine`
 * client. What a request carries for an image and for no mark, that
 * `{ pdf }` takes a PDF only, and that an older server is never sent an
 * image or no mark.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { BANDS_JPEG, BANDS_PDF, BANDS_PNG } from '@embedpdf/engine-core/conformance';
import {
  EngineErrorCode,
  sniffBinaryMetadata,
  type DocumentHandle,
} from '@embedpdf/engine-core/runtime';
import { cloudEngine } from '../src/index';
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
  'packages',
  'engine',
  'main',
  'test',
  'fixtures',
  'unsigned_sigfield.pdf',
);

const TENANT_ID = 'cloud-signature-mark-wire-tenant';
const FIELD = { kind: 'fqn', name: 'sig' } as const;

let fx: DbSeededFixture | undefined;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-signature-mark-wire-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

/** One write as it went out: its route, its JSON, and the format of each part beside it. */
interface SentWrite {
  route: string;
  body: unknown;
  parts: Record<string, string | null>;
}

/**
 * A fetch that records the writes about a mark (the visual fill, a prepare,
 * a request of changes), through which the server says it is `version` when
 * one is given.
 */
function recordingFetch(version?: string) {
  const sent: SentWrite[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const route = ['/signature-appearance', '/signatures/prepare', '/changes'].find((end) =>
      new URL(url).pathname.endsWith(end),
    );
    if (route && init?.method === 'POST') {
      const parts: Record<string, string | null> = {};
      let body: unknown;
      if (init.body instanceof FormData) {
        body = JSON.parse(String(init.body.get('body')));
        for (const [name, value] of init.body.entries()) {
          if (name === 'body' || typeof value === 'string') continue;
          parts[name] = sniffBinaryMetadata(await value.arrayBuffer())?.mimeType ?? null;
        }
      } else {
        body = JSON.parse(String(init.body));
      }
      sent.push({ route, body, parts });
    }
    const response = await fetch(input, init);
    if (version === undefined) return response;
    const headers = new Headers(response.headers);
    headers.set('EmbedPDF-Server-Version', version);
    return new Response(response.body, { status: response.status, headers });
  };
  return { fetchFn, sent };
}

async function open(docId: string, fetchFn: typeof fetch) {
  await seedDocumentFromBytes(fx!, TENANT_ID, docId, fixturePath, 1);
  const engine = cloudEngine({
    baseUrl: fx!.baseUrl,
    token: docScopedToken(fx!, TENANT_ID, docId, ['*'], 'default'),
    fetch: fetchFn,
  });
  return { engine, doc: await engine.open({ kind: 'id', id: docId, layerName: 'default' }) };
}

/** Whether the fixture's signature field has a mark in it. */
async function hasMark(doc: DocumentHandle): Promise<boolean> {
  const { fields, widgets } = await doc.forms.list();
  const widget = fields.find((field) => field.name === 'sig')!.widgets[0]!;
  return widgets.find(
    (row) => row.ref.kind === 'objectNumber' && row.ref.objectNumber === widget.objectNumber,
  )!.hasMark;
}

describe("a signature field's mark on the wire", () => {
  test('an image travels in the `appearance` part, and no mark as `null` with no part', async () => {
    const { fetchFn, sent } = recordingFetch();
    const { engine, doc } = await open('cloud-mark-wire-shapes', fetchFn);
    try {
      // The visual fill: the part a PDF travels in, holding the image.
      await doc.forms.setSignatureAppearance(FIELD, BANDS_PNG);
      expect(sent.at(-1)).toEqual({
        route: '/signature-appearance',
        body: { resources: { appearance: 'appearance' } },
        parts: { 'resource:appearance': 'image/png' },
      });
      expect(await hasMark(doc)).toBe(true);

      // No mark: plain JSON, no part.
      await doc.forms.setSignatureAppearance(FIELD, null);
      expect(sent.at(-1)).toEqual({
        route: '/signature-appearance',
        body: { resources: { appearance: null } },
        parts: {},
      });
      expect(await hasMark(doc)).toBe(false);

      // The change op: the same two shapes, its part named by a key.
      await doc.apply({
        ops: [{ type: 'forms.setSignatureAppearance', field: FIELD, appearance: BANDS_JPEG }],
      });
      expect(sent.at(-1)).toMatchObject({
        route: '/changes',
        body: {
          changes: [
            {
              ops: [
                {
                  type: 'forms.setSignatureAppearance',
                  field: FIELD,
                  resources: { appearance: 'r0' },
                },
              ],
            },
          ],
        },
        parts: { 'resource:r0': 'image/jpeg' },
      });
      await doc.apply({
        ops: [{ type: 'forms.setSignatureAppearance', field: FIELD, appearance: null }],
      });
      expect(sent.at(-1)).toMatchObject({
        route: '/changes',
        body: {
          changes: [
            {
              ops: [
                {
                  type: 'forms.setSignatureAppearance',
                  field: FIELD,
                  resources: { appearance: null },
                },
              ],
            },
          ],
        },
        parts: {},
      });
      expect(await hasMark(doc)).toBe(false);

      // A prepare: the image in its `appearance` part. It has no `null`: no mark is no `resources`.
      const prepared = await doc.signatures.prepare({ field: FIELD, appearance: BANDS_PNG });
      expect(sent.at(-1)).toEqual({
        route: '/signatures/prepare',
        body: { field: FIELD, resources: { appearance: 'appearance' } },
        parts: { 'resource:appearance': 'image/png' },
      });
      await doc.signatures.cancel(prepared.signingId);
      const bare = await doc.signatures.prepare({ field: FIELD });
      expect(sent.at(-1)).toEqual({
        route: '/signatures/prepare',
        body: { field: FIELD },
        parts: {},
      });
      await doc.signatures.cancel(bare.signingId);
    } finally {
      await doc.close();
      await engine.destroy();
    }
  });

  test('`{ pdf }` takes a PDF only: an image under it is refused, and nothing is sent', async () => {
    const { fetchFn, sent } = recordingFetch();
    const { engine, doc } = await open('cloud-mark-wire-keyed-pdf', fetchFn);
    try {
      const refusal = {
        code: EngineErrorCode.InvalidArg,
        message: 'the appearance resource must be a PDF',
      };
      for (const image of [BANDS_PNG, BANDS_JPEG]) {
        await expect(doc.forms.setSignatureAppearance(FIELD, { pdf: image })).rejects.toMatchObject(
          refusal,
        );
        await expect(
          doc.signatures.prepare({ field: FIELD, appearance: { pdf: image } }),
        ).rejects.toMatchObject(refusal);
        await expect(
          doc.apply({
            ops: [
              { type: 'forms.setSignatureAppearance', field: FIELD, appearance: { pdf: image } },
            ],
          }),
        ).rejects.toMatchObject(refusal);
      }
      expect(sent).toEqual([]);
      expect(await hasMark(doc)).toBe(false);

      // A PDF under it goes out, in the `appearance` part.
      await doc.forms.setSignatureAppearance(FIELD, { pdf: BANDS_PDF });
      expect(sent).toEqual([
        {
          route: '/signature-appearance',
          body: { resources: { appearance: 'appearance' } },
          parts: { 'resource:appearance': 'application/pdf' },
        },
      ]);
      expect(await hasMark(doc)).toBe(true);
    } finally {
      await doc.close();
      await engine.destroy();
    }
  });

  test('an older server is never sent an image or no mark, and the refusal names both versions', async () => {
    const { fetchFn, sent } = recordingFetch('3.2');
    const { engine, doc } = await open('cloud-mark-wire-older-server', fetchFn);
    try {
      const refusal = {
        code: EngineErrorCode.NotImplemented,
        details: { needs: '3.4', serverVersion: '3.2' },
      };
      const op = (appearance: Uint8Array | null) => ({
        ops: [{ type: 'forms.setSignatureAppearance' as const, field: FIELD, appearance }],
      });
      for (const image of [BANDS_PNG, new Blob([BANDS_JPEG.slice()])]) {
        await expect(doc.forms.setSignatureAppearance(FIELD, image)).rejects.toMatchObject(refusal);
        await expect(
          doc.signatures.prepare({ field: FIELD, appearance: image }),
        ).rejects.toMatchObject(refusal);
      }
      await expect(doc.apply(op(BANDS_PNG))).rejects.toMatchObject(refusal);
      await expect(doc.forms.setSignatureAppearance(FIELD, null)).rejects.toMatchObject(refusal);
      await expect(doc.apply(op(null))).rejects.toMatchObject(refusal);
      expect(sent).toEqual([]);

      // Everything else keeps working: a one-page PDF goes out, as its bytes and under `{ pdf }`.
      await doc.forms.setSignatureAppearance(FIELD, BANDS_PDF);
      expect(await hasMark(doc)).toBe(true);
      await doc.forms.setSignatureAppearance(FIELD, { pdf: BANDS_PDF });
      await doc.apply(op(BANDS_PDF));
      const prepared = await doc.signatures.prepare({ field: FIELD, appearance: BANDS_PDF });
      await doc.signatures.cancel(prepared.signingId);
      expect(sent.map(({ route, parts }) => [route, Object.values(parts)])).toEqual([
        ['/signature-appearance', ['application/pdf']],
        ['/signature-appearance', ['application/pdf']],
        ['/changes', ['application/pdf']],
        ['/signatures/prepare', ['application/pdf']],
      ]);
    } finally {
      await doc.close();
      await engine.destroy();
    }
  });
});
