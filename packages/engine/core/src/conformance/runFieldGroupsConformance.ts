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
 *   - a new field is in no group unless its draft names one: the designer's
 *     own, or one they may set;
 *   - `groupId: null` takes a field out of its group, with form design alone,
 *     and an undo puts the group back;
 *   - a copy, or an import that copies, leaves a field of no group in none;
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
  /** The seller, as a grant would grant it: everything on the seller's fields. */
  seller: { scope: ['doc.open', 'doc.render', 'fields:*:group=seller'], identity: {} },
  /** The designer: her own group is legal; she may put fields in the buyer's group too. */
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
/** A DER `SEQUENCE`: what a completion takes as a CMS, without judging it. */
const PLACEHOLDER_CMS = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);

export function runFieldGroupsConformance(
  runner: ConformanceTestRunner,
  options: FieldGroupsConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`field groups conformance: ${options.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await options.makeEngine();
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
      const doc = await options.open(engine, scope, identity, bytes);
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

    test('each token lists the groups it may fill in, sign and assign', async () => {
      const rights: Record<string, unknown> = {};
      for (const token of Object.keys(FIELD_GROUP_TOKENS) as FieldGroupToken[]) {
        await as(token, async (doc) => {
          rights[token] = doc.security.fieldRights();
          // The lists answer as `allowsField` does, group by group.
          const listed = doc.security.fieldRights();
          for (const groupId of ['buyer', 'seller', 'legal', null]) {
            for (const action of ['fill', 'sign'] as const) {
              const right = listed[action];
              const inList = right.all || (groupId !== null && right.groups.includes(groupId));
              expect(inList).toBe(doc.security.allowsField(action, { groupId }));
            }
          }
          for (const groupId of ['buyer', 'seller', 'legal']) {
            const right = listed.setGroup;
            const inList = right.all || right.groups.includes(groupId);
            expect(inList).toBe(doc.security.allowsField('set-group', { groupId }));
          }
        });
      }
      expect(rights).toEqual({
        buyer: {
          fill: { all: false, groups: ['buyer'] },
          sign: { all: false, groups: ['buyer'] },
          setGroup: { all: false, groups: [] },
        },
        seller: {
          fill: { all: false, groups: ['seller'] },
          sign: { all: false, groups: ['seller'] },
          setGroup: { all: false, groups: ['seller'] },
        },
        // Designing the form includes filling it in.
        designer: {
          fill: { all: true },
          sign: { all: false, groups: [] },
          setGroup: { all: false, groups: ['buyer', 'legal'] },
        },
        everything: { fill: { all: true }, sign: { all: true }, setGroup: { all: true } },
      });
    });

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

    test('a signer who also holds doc.sign adds a document timestamp, and signs no more fields for it', async () => {
      // The right to sign a group's fields is not the right to add a timestamp to the document.
      await as('buyer', async (doc) => {
        const refused = await refusal(doc.signatures.prepare({ kind: 'timestamp' }));
        expect(codeOf(refused)).toBe(EngineErrorCode.Forbidden);
      });
      const { scope, identity } = FIELD_GROUP_TOKENS.buyer;
      const doc = await options.open(engine, [...scope, 'doc.sign'], identity);
      try {
        // The timestamp names no field, so it is the document's to sign: `doc.sign` gives it,
        // though the same caller's field signing is narrowed to one group.
        const prepared = await doc.signatures.prepare({ kind: 'timestamp' });
        expect(prepared.subFilter).toBe('ETSI.RFC3161');
        if (options.completesSignings === false) {
          await doc.signatures.cancel(prepared.signingId);
        } else {
          const result = await doc.signatures.complete({
            signingId: prepared.signingId,
            cms: PLACEHOLDER_CMS,
            expectedVersion: prepared.expectedVersion,
          });
          expect(result.signature.kind).toBe('timestamp');
        }
        // `doc.sign` widens nothing else: the other group's field is still not theirs.
        const other = await refusal(doc.signatures.prepare({ field: field('seller_sig') }));
        expect(codeOf(other)).toBe(EngineErrorCode.Forbidden);
        expect(doc.security.allowsField('sign', { groupId: 'seller' })).toBe(false);
        expect(doc.security.allowsField('sign', { groupId: null })).toBe(false);
      } finally {
        await doc.close();
      }
    });

    test('signing a grouped field locks the rest of its group, for everyone', async () => {
      if (options.completesSignings === false) return;
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

    const widgetsAt = (x: number, y = 200) => [
      { page: PAGE, rect: { x, y, width: 100, height: 20 } },
    ];
    const groupOf = async (doc: DocumentHandle, name: string) =>
      (await doc.forms.get(field(name))).groupId;

    test('a new field is in no group unless its draft names one', async () => {
      await as('designer', async (doc) => {
        // Her own group is legal, and a field she makes is nobody's until she says whose.
        const unnamed = await doc.forms.create({
          kind: 'text',
          name: 'clause',
          widgets: widgetsAt(20),
        });
        expect(unnamed.field.groupId).toBe(null);
        expect(await groupOf(doc, 'clause')).toBe(null);
        // `null` says the same as leaving the group out.
        const none = await doc.forms.create({
          kind: 'text',
          name: 'note',
          groupId: null,
          widgets: widgetsAt(140),
        });
        expect(none.field.groupId).toBe(null);
        expect(await groupOf(doc, 'note')).toBe(null);
        // A create that is one op of a change follows the same rule.
        const applied = await doc.apply({
          ops: [
            {
              type: 'forms.create',
              draft: { kind: 'text', name: 'annex', widgets: widgetsAt(260) },
            },
          ],
        });
        expect(applied.items.map((item) => item.type)).toEqual(['forms.create']);
        expect(await groupOf(doc, 'annex')).toBe(null);
      });
    });

    test('naming her own group takes no right; another takes fields:set-group for it', async () => {
      await as('designer', async (doc) => {
        const own = await doc.forms.create({
          kind: 'text',
          name: 'clause',
          groupId: 'legal',
          widgets: widgetsAt(20),
        });
        expect(own.field.groupId).toBe('legal');
        const buyers = await doc.forms.create({
          kind: 'text',
          name: 'buyer_address',
          groupId: 'buyer',
          widgets: widgetsAt(140),
        });
        expect(buyers.field.groupId).toBe('buyer');
        const refused = await refusal(
          doc.forms.create({
            kind: 'text',
            name: 'seller_address',
            groupId: 'seller',
            widgets: widgetsAt(260),
          }),
        );
        expect(codeOf(refused)).toBe(EngineErrorCode.Forbidden);
        expect((refused as EngineError).details).toMatchObject({
          required: 'fields:set-group:group=seller',
        });
        const moved = await doc.forms.update(own.field.ref, { groupId: 'buyer' });
        expect(moved.field.groupId).toBe('buyer');
        const back = await doc.forms.update(own.field.ref, { groupId: 'legal' });
        expect(back.field.groupId).toBe('legal');
        expect(codeOf(await refusal(doc.forms.update(own.field.ref, { groupId: 'seller' })))).toBe(
          EngineErrorCode.Forbidden,
        );
        expect(doc.security.allowsField('set-group', { groupId: 'buyer' })).toBe(true);
        expect(doc.security.allowsField('set-group', { groupId: 'legal' })).toBe(true);
        expect(doc.security.allowsField('set-group', { groupId: 'seller' })).toBe(false);
      });
    });

    test('groupId: null takes a field out of its group, with form design alone', async () => {
      await as('designer', async (doc) => {
        // She may put fields in the buyer's group and her own, and has no right for the
        // seller's: taking a field out of a group takes none.
        const sellers = await doc.forms.update(field('seller_name'), { groupId: null });
        expect(sellers.field.groupId).toBe(null);
        expect(await groupOf(doc, 'seller_name')).toBe(null);
        const buyers = await doc.forms.update(field('buyer_name'), { groupId: null });
        expect(buyers.field.groupId).toBe(null);
        // A field in no group stays in none.
        const total = await doc.forms.update(field('total'), { groupId: null });
        expect(total.field.groupId).toBe(null);
        // Back in is an assignment again: only where she may put fields.
        const refused = await refusal(
          doc.forms.update(field('seller_name'), { groupId: 'seller' }),
        );
        expect(codeOf(refused)).toBe(EngineErrorCode.Forbidden);
        expect((refused as EngineError).details).toMatchObject({
          required: 'fields:set-group:group=seller',
        });
        expect(
          (await doc.forms.update(field('buyer_name'), { groupId: 'buyer' })).field.groupId,
        ).toBe('buyer');
      });
    });

    test('taking a field out of its group is refused without form design', async () => {
      // The seller may put fields in the seller's group, and may not design the form.
      await as('seller', async (doc) => {
        expect(doc.security.allowsField('set-group', { groupId: 'seller' })).toBe(true);
        const refused = await refusal(doc.forms.update(field('seller_name'), { groupId: null }));
        expect(codeOf(refused)).toBe(EngineErrorCode.Forbidden);
        expect((refused as EngineError).details).toMatchObject({ required: 'doc.forms.modify' });
        const applied = await refusal(
          doc.apply({
            ops: [{ type: 'forms.update', field: field('seller_name'), patch: { groupId: null } }],
          }),
        );
        expect(codeOf(applied)).toBe(EngineErrorCode.Forbidden);
      });
      await as('buyer', async (doc) => {
        const refused = await refusal(doc.forms.update(field('buyer_name'), { groupId: null }));
        expect(codeOf(refused)).toBe(EngineErrorCode.Forbidden);
      });
      await as('everything', async (doc) => {
        expect(await groupOf(doc, 'seller_name')).toBe('seller');
      });
    });

    test('an empty group id is refused, not read as no group', async () => {
      await as('everything', async (doc) => {
        const created = await refusal(
          doc.forms.create({ kind: 'text', name: 'clause', groupId: '', widgets: widgetsAt(20) }),
        );
        expect(codeOf(created)).toBe(EngineErrorCode.InvalidArg);
        const updated = await refusal(doc.forms.update(field('buyer_name'), { groupId: '' }));
        expect(codeOf(updated)).toBe(EngineErrorCode.InvalidArg);
        const tooLong = await refusal(
          doc.forms.update(field('buyer_name'), { groupId: 'g'.repeat(257) }),
        );
        expect(codeOf(tooLong)).toBe(EngineErrorCode.InvalidArg);
        expect(await groupOf(doc, 'buyer_name')).toBe('buyer');
      });
    });

    test('undo puts a removed group back, and takes an assigned one away', async () => {
      await as('designer', async (doc) => {
        const update = (name: string, groupId: string | null) =>
          doc.apply({ ops: [{ type: 'forms.update', field: field(name), patch: { groupId } }] });

        // Out of a group she has no right to put fields in, and back by undo.
        const removed = await update('seller_name', null);
        expect(removed.meta.undoable).toBe(true);
        expect(await groupOf(doc, 'seller_name')).toBe(null);
        const undone = await doc.apply({ undoOf: removed.meta.opId });
        expect(await groupOf(doc, 'seller_name')).toBe('seller');
        // The undo's undo takes it out again.
        await doc.apply({ undoOf: undone.meta.opId });
        expect(await groupOf(doc, 'seller_name')).toBe(null);

        // Into a group, and back to none by undo.
        const assigned = await update('total', 'buyer');
        expect(await groupOf(doc, 'total')).toBe('buyer');
        const unassigned = await doc.apply({ undoOf: assigned.meta.opId });
        expect(await groupOf(doc, 'total')).toBe(null);
        await doc.apply({ undoOf: unassigned.meta.opId });
        expect(await groupOf(doc, 'total')).toBe('buyer');
      });
    });

    test('undo of a group change holds after someone else changed the field', async () => {
      await as('designer', async (doc) => {
        const update = (name: string, patch: { groupId?: string | null; required?: boolean }) =>
          doc.apply({ ops: [{ type: 'forms.update', field: field(name), patch }] });

        // A later change to the field leaves the undo each property to put back by value.
        const removed = await update('buyer_name', { groupId: null });
        await update('buyer_name', { required: true });
        await doc.apply({ undoOf: removed.meta.opId });
        const restored = await doc.forms.get(field('buyer_name'));
        expect([restored.groupId, restored.required]).toEqual(['buyer', true]);

        const assigned = await update('total', { groupId: 'buyer' });
        await update('total', { required: true });
        await doc.apply({ undoOf: assigned.meta.opId });
        const unassigned = await doc.forms.get(field('total'));
        expect([unassigned.groupId, unassigned.required]).toEqual([null, true]);
      });
    });

    test('an update that expects no group applies only to a field in none', async () => {
      await as('designer', async (doc) => {
        const expectNone = (name: string) =>
          doc.apply({
            ops: [
              {
                type: 'forms.update',
                field: field(name),
                patch: { groupId: 'buyer' },
                expect: { groupId: null },
              },
            ],
          });
        expect(codeOf(await refusal(expectNone('seller_name')))).toBe(
          EngineErrorCode.ChangeConflict,
        );
        await expectNone('total');
        expect(await groupOf(doc, 'total')).toBe('buyer');
      });
    });

    test('a copy of a field in no group is in none; a copy keeps a group she may set', async () => {
      await as('designer', async (doc) => {
        const copied = await doc.forms.copy([field('total'), field('buyer_name')]);
        expect(copied.fields.map((f) => f.groupId)).toEqual([null, 'buyer']);
        const refused = await refusal(doc.forms.copy([field('seller_name')]));
        expect(codeOf(refused)).toBe(EngineErrorCode.Forbidden);
        expect((refused as EngineError).details).toMatchObject({
          required: 'fields:set-group:group=seller',
        });
      });
    });

    test('a copied form keeps the groups the importer may set; a restore keeps every one', async () => {
      let buyers: Awaited<ReturnType<DocumentHandle['forms']['export']>> | null = null;
      let nobodys: Awaited<ReturnType<DocumentHandle['forms']['export']>> | null = null;
      let everyone: Awaited<ReturnType<DocumentHandle['forms']['export']>> | null = null;
      await as('everything', async (doc) => {
        buyers = await doc.forms.export({ fields: [field('buyer_name')] });
        nobodys = await doc.forms.export({ fields: [field('total')] });
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
          // A field of no group stays in none, whatever the importer's own group is.
          const unassigned = await doc.forms.import(nobodys!, { attribution: 'stamp' });
          expect(unassigned.fields.map((f) => [f.name, f.groupId])).toEqual([['total', null]]);
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
