import { pdfOf } from './pdfOf';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { Identity } from '../auth/scope/types';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { FormFieldRef } from '../identity/FormFieldRef';
import { toPageRef } from '../identity/PageRef';

/**
 * Field groups: who fills in and signs which fields. On a buyer and seller
 * contract, the same on every engine:
 *   - each signer fills in and signs only their own group's fields;
 *   - a field a script calculates moves with a fill of the signer's own;
 *   - a designer puts fields in their own group, or one they may set;
 *   - a values import leaves out the fields the token may not fill;
 *   - signing a grouped signature field locks the rest of its group.
 *
 * It runs on {@link FIELD_GROUPS_PDF}.
 */

/**
 * One page with a buyer's and a seller's fields, each field's group in its
 * `/EMBD_Metadata /GroupID`: `buyer_name` and `buyer_price` (buyer),
 * `seller_name` (seller), `total` (no group; a calculate script, in the
 * calculation order), and the signature fields `buyer_sig` (buyer) and
 * `seller_sig` (seller).
 */
export const FIELD_GROUPS_PDF = (() => {
  const group = (name: string) => `/EMBD_Metadata << /SchemaVersion 1 /GroupID (${name}) >>`;
  const text = (name: string, rect: string, extra: string) =>
    `<< /Type /Annot /Subtype /Widget /FT /Tx /T (${name}) /Rect [${rect}] /F 4 /P 3 0 R ${extra} >>`;
  const signature = (name: string, rect: string, extra: string) =>
    `<< /Type /Annot /Subtype /Widget /FT /Sig /T (${name}) /Rect [${rect}] /F 4 /P 3 0 R ${extra} >>`;
  return pdfOf([
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R 5 0 R 6 0 R 7 0 R 8 0 R 9 0 R] ' +
      '/CO [7 0 R] /DA (/Helv 10 Tf 0 g) /DR << /Font << /Helv << /Type /Font /Subtype /Type1 ' +
      '/BaseFont /Helvetica >> >> >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Contents 10 0 R /Resources << >> ' +
      '/Annots [4 0 R 5 0 R 6 0 R 7 0 R 8 0 R 9 0 R] >>',
    text('buyer_name', '20 340 180 360', group('buyer')),
    text('buyer_price', '20 300 180 320', group('buyer')),
    text('seller_name', '200 340 380 360', group('seller')),
    text('total', '20 260 180 280', '/AA << /C << /S /JavaScript /JS (event.value = 1;) >> >>'),
    signature('buyer_sig', '20 100 180 150', group('buyer')),
    signature('seller_sig', '200 100 380 150', group('seller')),
    '<< /Length 0 >>\nstream\n\nendstream',
  ]);
})();

/** The tokens of the contract's parties. */
export const FIELD_GROUP_TOKENS = {
  /** The buyer: fills in and signs the buyer's fields. */
  buyer: {
    scope: ['doc.open', 'doc.render', 'fields:fill:group=buyer', 'fields:sign:group=buyer'],
    identity: { userId: 'alice', displayName: 'Alice' },
  },
  /** The seller, as a share link would grant it: everything on the seller's fields. */
  seller: { scope: ['doc.open', 'doc.render', 'fields:*:group=seller'], identity: {} },
  /** The designer: her fields go in legal; she may put fields in the buyer's group too. */
  designer: {
    scope: ['doc.open', 'doc.render', 'doc.forms.modify', 'fields:set-group:group=buyer'],
    identity: { userId: 'lisa', groupId: 'legal' },
  },
  everything: { scope: ['*'], identity: {} },
} as const satisfies Record<string, { scope: readonly string[]; identity: Identity }>;

export type FieldGroupToken = keyof typeof FIELD_GROUP_TOKENS;

export interface FieldGroupsConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** Open a fresh copy of `bytes` (default {@link FIELD_GROUPS_PDF}) with `scope`, acting for `identity`. */
  open: (
    engine: Engine,
    scope: readonly string[],
    identity: Identity,
    bytes?: Uint8Array,
  ) => Promise<DocumentHandle>;
  /**
   * Whether a signing completes on this engine with a placeholder CMS, so
   * the lock it installs can be read back. Default `true`.
   */
  completesSignings?: boolean;
}

const PAGE = toPageRef(3);
const field = (name: string): FormFieldRef => ({ kind: 'fqn', name });
/** A DER SEQUENCE: what a completion takes as a CMS, without judging it. */
const PLACEHOLDER_CMS = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);

export function runFieldGroupsConformance(
  runner: ConformanceTestRunner,
  opts: FieldGroupsConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`field groups conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const as = async (
      token: FieldGroupToken,
      body: (doc: DocumentHandle) => Promise<void>,
      bytes?: Uint8Array,
    ) => {
      const { scope, identity } = FIELD_GROUP_TOKENS[token];
      const doc = await opts.open(engine, scope, identity, bytes);
      try {
        await body(doc);
      } finally {
        await doc.close();
      }
    };

    const refusal = (attempt: Promise<unknown>): Promise<unknown> =>
      attempt.then(
        () => null,
        (error: unknown) => error,
      );

    const codeOf = (error: unknown) =>
      EngineError.is(error) ? error.code : error === null ? 'resolved' : String(error);

    const valueOf = async (doc: DocumentHandle, name: string) =>
      (
        (await doc.forms.list()).fields.find((f) => f.name === name) as
          | { value?: string }
          | undefined
      )?.value;

    test("a field's group reads from its /EMBD_Metadata; its widget has none", async () => {
      await as('everything', async (doc) => {
        const { fields, widgets } = await doc.forms.list();
        const groups = Object.fromEntries(fields.map((f) => [f.name, f.groupId]));
        expect(groups).toEqual({
          buyer_name: 'buyer',
          buyer_price: 'buyer',
          seller_name: 'seller',
          total: null,
          buyer_sig: 'buyer',
          seller_sig: 'seller',
        });
        expect(widgets.every((w) => w.groupId === null)).toBe(true);
      });
    });

    test('each signer fills in only their own fields', async () => {
      await as('buyer', async (doc) => {
        await doc.forms.setValue(field('buyer_name'), { value: 'Alice' });
        expect(await valueOf(doc, 'buyer_name')).toBe('Alice');
        const refused = await refusal(doc.forms.setValue(field('seller_name'), { value: 'x' }));
        expect(codeOf(refused)).toBe(EngineErrorCode.Forbidden);
        expect((refused as EngineError).details).toMatchObject({
          required: 'fields:fill:group=seller',
        });
        // A field in no group is an unrestricted filler's.
        expect(codeOf(await refusal(doc.forms.setValue(field('total'), { value: '9' })))).toBe(
          EngineErrorCode.Forbidden,
        );
        expect(doc.security.allowsField('fill', { groupId: 'buyer' })).toBe(true);
        expect(doc.security.allowsField('fill', { groupId: 'seller' })).toBe(false);
      });
      await as('seller', async (doc) => {
        await doc.forms.setValue(field('seller_name'), { value: 'Bob' });
        expect(codeOf(await refusal(doc.forms.setValue(field('buyer_name'), { value: 'x' })))).toBe(
          EngineErrorCode.Forbidden,
        );
      });
    });

    test("a calculated field moves with a fill of the signer's own, never alone", async () => {
      await as('buyer', async (doc) => {
        await doc.apply({
          ops: [
            { type: 'forms.setValue', field: field('buyer_price'), value: { value: '1200' } },
            { type: 'forms.setValue', field: field('total'), value: { value: '1452' } },
          ],
        });
        expect(await valueOf(doc, 'total')).toBe('1452');
        const alone = await refusal(
          doc.apply({
            ops: [{ type: 'forms.setValue', field: field('total'), value: { value: '1' } }],
          }),
        );
        expect(codeOf(alone)).toBe(EngineErrorCode.Forbidden);
        // The other side's field never rides along.
        const across = await refusal(
          doc.apply({
            ops: [
              { type: 'forms.setValue', field: field('buyer_price'), value: { value: '1' } },
              { type: 'forms.setValue', field: field('seller_name'), value: { value: 'x' } },
            ],
          }),
        );
        expect(codeOf(across)).toBe(EngineErrorCode.Forbidden);
        expect(await valueOf(doc, 'buyer_price')).toBe('1200');
      });
    });

    test('a reset puts back only fields the signer may fill', async () => {
      await as('buyer', async (doc) => {
        await doc.forms.setValue(field('buyer_name'), { value: 'Alice' });
        await doc.forms.reset([field('buyer_name')]);
        expect(await valueOf(doc, 'buyer_name')).toBe('');
        expect(codeOf(await refusal(doc.forms.reset()))).toBe(EngineErrorCode.Forbidden);
      });
    });

    test('each signer signs only their own signature field', async () => {
      await as('buyer', async (doc) => {
        const refused = await refusal(doc.signatures.prepare({ field: field('seller_sig') }));
        expect(codeOf(refused)).toBe(EngineErrorCode.Forbidden);
        const prepared = await doc.signatures.prepare({ field: field('buyer_sig') });
        await doc.signatures.cancel(prepared.signingId);
        expect(doc.security.allowsField('sign', { groupId: 'buyer' })).toBe(true);
        expect(doc.security.allowsField('sign', { groupId: 'seller' })).toBe(false);
      });
    });

    test('signing a grouped field locks the rest of its group, for everyone', async () => {
      if (opts.completesSignings === false) return;
      // The lock follows the field's group, whoever signs: here a token that
      // may do everything, which the lock then refuses too.
      await as('everything', async (doc) => {
        await doc.forms.setValue(field('buyer_name'), { value: 'Alice' });
        const prepared = await doc.signatures.prepare({ field: field('buyer_sig') });
        await doc.signatures.complete({
          signingId: prepared.signingId,
          cms: PLACEHOLDER_CMS,
          expectedVersion: prepared.expectedVersion,
        });
        const locked = await refusal(doc.forms.setValue(field('buyer_name'), { value: 'x' }));
        expect(codeOf(locked)).toBe(EngineErrorCode.ProtectedDocument);
        // The other group's fields, and its signature field, stay open.
        await doc.forms.setValue(field('seller_name'), { value: 'Bob' });
        const next = await doc.signatures.prepare({ field: field('seller_sig') });
        await doc.signatures.cancel(next.signingId);
      });
    });

    test('a designer puts fields in her own group, or one she may set', async () => {
      await as('designer', async (doc) => {
        const own = await doc.forms.create({
          family: 'text',
          name: 'clause',
          widgets: [{ page: PAGE, rect: { x: 20, y: 200, width: 100, height: 20 } }],
        });
        expect(own.field.groupId).toBe('legal');
        const buyers = await doc.forms.create({
          family: 'text',
          name: 'buyer_address',
          groupId: 'buyer',
          widgets: [{ page: PAGE, rect: { x: 140, y: 200, width: 100, height: 20 } }],
        });
        expect(buyers.field.groupId).toBe('buyer');
        const refused = await refusal(
          doc.forms.create({
            family: 'text',
            name: 'seller_address',
            groupId: 'seller',
            widgets: [{ page: PAGE, rect: { x: 260, y: 200, width: 100, height: 20 } }],
          }),
        );
        expect(codeOf(refused)).toBe(EngineErrorCode.Forbidden);
        expect((refused as EngineError).details).toMatchObject({
          required: 'fields:set-group:group=seller',
        });
        const moved = await doc.forms.update(own.field.ref, { groupId: 'buyer' });
        expect(moved.field.groupId).toBe('buyer');
        expect(codeOf(await refusal(doc.forms.update(own.field.ref, { groupId: 'seller' })))).toBe(
          EngineErrorCode.Forbidden,
        );
        expect(doc.security.allowsField('set-group', { groupId: 'buyer' })).toBe(true);
        expect(doc.security.allowsField('set-group', { groupId: 'seller' })).toBe(false);
      });
    });

    test('a copied form keeps the groups the importer may set; a restore keeps every one', async () => {
      let buyers: Awaited<ReturnType<DocumentHandle['forms']['export']>> | null = null;
      let everyone: Awaited<ReturnType<DocumentHandle['forms']['export']>> | null = null;
      await as('everything', async (doc) => {
        buyers = await doc.forms.export({ fields: [field('buyer_name')] });
        everyone = await doc.forms.export();
      });
      const blank = await (async () => {
        let bytes: Uint8Array | null = null;
        await as('everything', async (doc) => {
          for (const { ref } of (await doc.forms.list()).fields) await doc.forms.delete(ref);
          bytes = await doc.download();
        });
        return bytes!;
      })();
      await as(
        'designer',
        async (doc) => {
          const copied = await doc.forms.import(buyers!, { attribution: 'stamp' });
          expect(copied.fields.map((f) => [f.name, f.groupId])).toEqual([['buyer_name', 'buyer']]);
          const refused = await refusal(doc.forms.import(everyone!, { attribution: 'stamp' }));
          expect(codeOf(refused)).toBe(EngineErrorCode.Forbidden);
        },
        blank,
      );
      await as(
        'everything',
        async (doc) => {
          const restored = await doc.forms.import(everyone!, { attribution: 'restore' });
          expect(Object.fromEntries(restored.fields.map((f) => [f.name, f.groupId]))).toMatchObject(
            {
              buyer_name: 'buyer',
              seller_name: 'seller',
              total: null,
            },
          );
        },
        blank,
      );
    });

    test('a values import leaves out the fields the signer may not fill', async () => {
      let bundle: Awaited<ReturnType<DocumentHandle['forms']['export']>> | null = null;
      await as('everything', async (doc) => {
        await doc.forms.setValue(field('buyer_name'), { value: 'Alice' });
        await doc.forms.setValue(field('seller_name'), { value: 'Bob' });
        bundle = await doc.forms.export();
      });
      await as('buyer', async (doc) => {
        const result = await doc.forms.importValues(bundle!, { attribution: 'stamp' });
        expect(result.fields.map((f) => f.name)).toEqual(['buyer_name']);
        expect(result.dropped.some((drop) => drop.reason === 'fill-not-allowed')).toBe(true);
        expect(await valueOf(doc, 'seller_name')).toBe('');
      });
    });
  });
}
