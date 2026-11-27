import { pdfOf } from './pdfOf';
import type { ConformanceTestRunner } from './runMetadataConformance';
import { BANDS_PNG } from './stampFixtures';
import type { Identity } from '../auth/scope/types';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { FormFieldRef } from '../identity/FormFieldRef';
import { toPageRef } from '../identity/PageRef';
import type { FieldLockSpec } from '../signature/types';

/**
 * Fields anyone fills in (`forAnyone`): every signer's, not one group's. On a
 * form with two signers, Dana and Ada, the same on every engine:
 *   - the fact reads from the field's `/EMBD_Metadata`, and never on a field
 *     in a group or a signature field;
 *   - every token that may fill in some field fills one in; a token that may
 *     fill in none can't, and a group's token still can't fill in the
 *     sender's fields;
 *   - marking a field takes `fields:set-group:all`, and a field in a group or
 *     a signature field is refused;
 *   - a signing that names no lock locks every such field that holds a value,
 *     whoever filled it in (an image field holds one once it holds a
 *     picture), and leaves an empty one open for the next signer;
 *     a signing that names a lock decides for itself;
 *   - a copy, an export and an import keep the fact;
 *   - what a signature allows: filling in a field it left open is permitted,
 *     changing one it locked is forbidden.
 *
 * It runs on {@link ANYONE_FIELDS_PDF}.
 */

/**
 * One page with Dana's and Ada's fields, the fields anyone fills in and the
 * sender's, each fact in its field's `/EMBD_Metadata`:
 *   - `dana_name`, `dana_sig` (Dana's group), `ada_name`, `ada_sig` (Ada's);
 *   - `reference`, `notes` (empty) and `delivery` (holding the sender's
 *     `2026-12-01`), which anyone fills in;
 *   - `sender_note` and the signature field `witness_sig`, in no group;
 *   - as another tool could leave them: `both`, in Dana's group and marked
 *     for anyone, and `sig_marked`, a signature field marked for anyone.
 */
export const ANYONE_FIELDS_PDF = (() => {
  const meta = (entries: string) => `/EMBD_Metadata << /SchemaVersion 1 ${entries} >>`;
  const group = (name: string) => meta(`/GroupID (${name})`);
  const forAnyone = meta('/ForAnyone true');
  const text = (name: string, rect: string, extra: string) =>
    `<< /Type /Annot /Subtype /Widget /FT /Tx /T (${name}) /Rect [${rect}] /F 4 /P 3 0 R ${extra} >>`;
  const signature = (name: string, rect: string, extra: string) =>
    `<< /Type /Annot /Subtype /Widget /FT /Sig /T (${name}) /Rect [${rect}] /F 4 /P 3 0 R ${extra} >>`;
  const fields = Array.from({ length: 11 }, (_, at) => `${at + 4} 0 R`).join(' ');
  return pdfOf([
    `<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [${fields}] ` +
      '/DA (/Helv 10 Tf 0 g) /DR << /Font << /Helv << /Type /Font /Subtype /Type1 ' +
      '/BaseFont /Helvetica >> >> >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Contents 15 0 R /Resources << >> ' +
      `/Annots [${fields}] >>`,
    text('dana_name', '20 360 180 380', group('dana')),
    signature('dana_sig', '20 20 120 60', group('dana')),
    text('ada_name', '200 360 380 380', group('ada')),
    signature('ada_sig', '140 20 240 60', group('ada')),
    text('reference', '20 320 180 340', forAnyone),
    text('notes', '200 320 380 340', forAnyone),
    text('delivery', '20 280 180 300', `${forAnyone} /V (2026-12-01)`),
    text('sender_note', '200 280 380 300', ''),
    signature('witness_sig', '260 20 380 60', ''),
    text('both', '20 240 180 260', meta('/GroupID (dana) /ForAnyone true')),
    signature('sig_marked', '200 240 380 260', forAnyone),
    '<< /Length 0 >>\nstream\n\nendstream',
  ]);
})();

/**
 * One page whose signature fields carry a lock of their own (`/Lock`), as the
 * PDF's author may set: `all_sig`, in no group, locks every field, and
 * `dana_sig`, in Dana's group, locks `dana_name` alone. `reference` is a
 * field anyone fills in.
 */
const OWN_LOCK_PDF = (() => {
  const meta = (entries: string) => `/EMBD_Metadata << /SchemaVersion 1 ${entries} >>`;
  const widget = (type: string, name: string, rect: string, extra: string) =>
    `<< /Type /Annot /Subtype /Widget /FT /${type} /T (${name}) /Rect [${rect}] /F 4 /P 3 0 R ${extra} >>`;
  const lock = (entries: string) => `/Lock << /Type /SigFieldLock ${entries} >>`;
  const fields = '4 0 R 5 0 R 6 0 R 7 0 R';
  return pdfOf([
    `<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [${fields}] ` +
      '/DA (/Helv 10 Tf 0 g) /DR << /Font << /Helv << /Type /Font /Subtype /Type1 ' +
      '/BaseFont /Helvetica >> >> >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Contents 8 0 R /Resources << >> ' +
      `/Annots [${fields}] >>`,
    widget('Tx', 'dana_name', '20 360 180 380', meta('/GroupID (dana)')),
    widget('Tx', 'reference', '20 320 180 340', meta('/ForAnyone true')),
    widget('Sig', 'all_sig', '20 20 120 60', lock('/Action /All')),
    widget(
      'Sig',
      'dana_sig',
      '140 20 240 60',
      `${meta('/GroupID (dana)')} ${lock('/Action /Include /Fields [(dana_name)]')}`,
    ),
    '<< /Length 0 >>\nstream\n\nendstream',
  ]);
})();

/** The tokens of the people the form is for. */
export const ANYONE_FIELD_TOKENS = {
  /** The sender: designs the form, puts fields in every group, fills in every field. */
  sender: {
    scope: [
      'doc.open',
      'doc.render',
      'doc.download',
      'doc.forms.modify',
      'doc.sign',
      'fields:set-group:all',
    ],
    identity: { userId: 'sam', displayName: 'Sam' },
  },
  dana: {
    scope: [
      'doc.open',
      'doc.render',
      'doc.download',
      'fields:fill:group=dana',
      'fields:sign:group=dana',
    ],
    identity: { userId: 'dana', displayName: 'Dana Smith' },
  },
  ada: {
    scope: [
      'doc.open',
      'doc.render',
      'doc.download',
      'fields:fill:group=ada',
      'fields:sign:group=ada',
    ],
    identity: { userId: 'ada', displayName: 'Ada Lovelace' },
  },
  /** Fills in every field with the plain capability, and signs. */
  filler: { scope: ['doc.open', 'doc.render', 'doc.forms.fill', 'doc.sign'], identity: {} },
  /** Fills in every field through a `fields:` scope. */
  fillAll: { scope: ['doc.open', 'doc.render', 'fields:fill:all'], identity: {} },
  /** Reads the form and fills in nothing. */
  reader: { scope: ['doc.open', 'doc.render', 'doc.forms.read'], identity: {} },
  /** Designs the form, and puts fields in Dana's group only. */
  designer: {
    scope: ['doc.open', 'doc.render', 'doc.forms.modify', 'fields:set-group:group=dana'],
    identity: { userId: 'lisa' },
  },
  everything: { scope: ['*'], identity: {} },
} as const satisfies Record<string, { scope: readonly string[]; identity: Identity }>;

export type AnyoneFieldToken = keyof typeof ANYONE_FIELD_TOKENS;

/** What a signing in this suite names: the field, and a lock of its own. */
export interface AnyoneFieldsSigning {
  field: FormFieldRef;
  lock?: FieldLockSpec;
}

export interface AnyoneFieldsConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** Open a fresh copy of `bytes` (default {@link ANYONE_FIELDS_PDF}) with `scope`, acting for `identity`. */
  open: (
    engine: Engine,
    scope: readonly string[],
    identity: Identity,
    bytes?: Uint8Array,
  ) => Promise<DocumentHandle>;
  /**
   * Sign and complete `signing` on `doc`. Left out: prepare, then complete
   * with a placeholder CMS, which an engine that judges the CMS refuses.
   */
  sign?: (doc: DocumentHandle, signing: AnyoneFieldsSigning) => Promise<void>;
  /**
   * An engine whose documents' signatures are judged but not enforced
   * (`signedDocumentPolicy: 'permit'`), so a change to a locked field can be
   * written and judged. Left out where the engine has no such policy.
   */
  makePermitEngine?: () => Promise<Engine> | Engine;
}

const PAGE = toPageRef(3);
const field = (name: string): FormFieldRef => ({ kind: 'fqn', name });
/** A DER `SEQUENCE`: what a completion takes as a CMS, without judging it. */
const PLACEHOLDER_CMS = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);

export function runAnyoneFieldsConformance(
  runner: ConformanceTestRunner,
  options: AnyoneFieldsConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`anyone fields conformance: ${options.label}`, () => {
    let engine: Engine;
    let permitEngine: Engine | null = null;

    beforeAll(async () => {
      engine = await options.makeEngine();
      if (options.makePermitEngine) permitEngine = await options.makePermitEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
      if (permitEngine) await permitEngine.destroy();
    });

    /** Run `body` as `token` on a fresh copy of `bytes`. */
    const as = async (
      token: AnyoneFieldToken,
      body: (doc: DocumentHandle) => Promise<void>,
      bytes?: Uint8Array,
      on: Engine = engine,
    ): Promise<void> => {
      const { scope, identity } = ANYONE_FIELD_TOKENS[token];
      const doc = await options.open(on, scope, identity, bytes);
      try {
        await body(doc);
      } finally {
        await doc.close();
      }
    };

    /** {@link as}, handing on the file it leaves: what the next person opens. */
    const handOn = async (
      token: AnyoneFieldToken,
      body: (doc: DocumentHandle) => Promise<void>,
      bytes?: Uint8Array,
    ): Promise<Uint8Array> => {
      let left: Uint8Array | null = null;
      await as(
        token,
        async (doc) => {
          await body(doc);
          left = await doc.download();
        },
        bytes,
      );
      return left!;
    };

    const includes = (list: readonly string[] | undefined, name: string) =>
      (list ?? []).includes(name);

    const sign = async (doc: DocumentHandle, signing: AnyoneFieldsSigning): Promise<void> => {
      if (options.sign) return options.sign(doc, signing);
      const prepared = await doc.signatures.prepare(signing);
      await doc.signatures.complete({
        signingId: prepared.signingId,
        cms: PLACEHOLDER_CMS,
        expectedVersion: prepared.expectedVersion,
      });
    };

    const refusal = (attempt: Promise<unknown>): Promise<unknown> =>
      attempt.then(
        () => null,
        (error: unknown) => error,
      );

    const codeOf = (error: unknown) =>
      EngineError.is(error) ? error.code : error === null ? 'resolved' : String(error);

    /** What filling `name` in with `value` gives: `'resolved'` or the refusal's code. */
    const fill = async (doc: DocumentHandle, name: string, value = 'x') =>
      codeOf(await refusal(doc.forms.setValue(field(name), { value })));

    const valueOf = async (doc: DocumentHandle, name: string) =>
      ((await doc.forms.get(field(name))) as { value?: string }).value;

    /** What the signature in the field `name` locks. */
    const lockOf = async (doc: DocumentHandle, name: string) =>
      (await doc.signatures.list()).signatures.find((s) => s.signed && s.fieldName === name)
        ?.fieldMdp ?? null;

    const widgetsAt = (x: number, y = 200) => [
      { page: PAGE, rect: { x, y, width: 100, height: 20 } },
    ];

    test("the fact reads from a field's /EMBD_Metadata, never with a group or on a signature field", async () => {
      await as('everything', async (doc) => {
        const { fields } = await doc.forms.list();
        expect(Object.fromEntries(fields.map((f) => [f.name, [f.groupId, f.forAnyone]]))).toEqual({
          dana_name: ['dana', false],
          dana_sig: ['dana', false],
          ada_name: ['ada', false],
          ada_sig: ['ada', false],
          reference: [null, true],
          notes: [null, true],
          delivery: [null, true],
          sender_note: [null, false],
          witness_sig: [null, false],
          // Another tool's entry beside a group: the field is that group's.
          both: ['dana', false],
          // A signature field is signed by one signer.
          sig_marked: [null, false],
        });
      });
    });

    test('every token that may fill in some field fills one in, and no other', async () => {
      const results: Record<string, Record<string, string>> = {};
      for (const token of Object.keys(ANYONE_FIELD_TOKENS) as AnyoneFieldToken[]) {
        await as(token, async (doc) => {
          results[token] = {};
          for (const name of ['reference', 'dana_name', 'ada_name', 'sender_note']) {
            const { fields } = await doc.forms.list();
            const target = fields.find((f) => f.name === name)!;
            const result = await fill(doc, name);
            results[token]![name] = result;
            // `allowsField` answers as the write does.
            expect(doc.security.allowsField('fill', target)).toBe(result === 'resolved');
          }
        });
      }
      const ok = 'resolved';
      const no = EngineErrorCode.Forbidden;
      expect(results).toEqual({
        sender: { reference: ok, dana_name: ok, ada_name: ok, sender_note: ok },
        dana: { reference: ok, dana_name: ok, ada_name: no, sender_note: no },
        ada: { reference: ok, dana_name: no, ada_name: ok, sender_note: no },
        filler: { reference: ok, dana_name: ok, ada_name: ok, sender_note: ok },
        fillAll: { reference: ok, dana_name: ok, ada_name: ok, sender_note: ok },
        reader: { reference: no, dana_name: no, ada_name: no, sender_note: no },
        designer: { reference: ok, dana_name: ok, ada_name: ok, sender_note: ok },
        everything: { reference: ok, dana_name: ok, ada_name: ok, sender_note: ok },
      });
    });

    test('a token that may fill in no field is refused, naming the capability', async () => {
      await as('reader', async (doc) => {
        const refused = await refusal(doc.forms.setValue(field('reference'), { value: 'x' }));
        expect(codeOf(refused)).toBe(EngineErrorCode.Forbidden);
        expect((refused as EngineError).details).toMatchObject({ required: 'doc.forms.fill' });
      });
    });

    test("a group's token resets, imports values into and undoes its fill of such a field", async () => {
      let bundle: Awaited<ReturnType<DocumentHandle['forms']['export']>> | null = null;
      await as('everything', async (doc) => {
        await doc.forms.setValue(field('reference'), { value: 'R-7' });
        await doc.forms.setValue(field('ada_name'), { value: 'Ada' });
        bundle = await doc.forms.export();
      });
      await as('dana', async (doc) => {
        const imported = await doc.forms.importValues(bundle!, { attribution: 'stamp' });
        expect(imported.fields.map((f) => f.name)).toContain('reference');
        expect(
          includes(
            imported.fields.map((f) => f.name),
            'ada_name',
          ),
        ).toBe(false);
        expect(await valueOf(doc, 'reference')).toBe('R-7');
        const filled = await doc.forms.setValue(field('reference'), { value: 'R-8' });
        await doc.apply({ undoOf: filled.meta.opId });
        expect(await valueOf(doc, 'reference')).toBe('R-7');
        await doc.forms.reset([field('reference')]);
        expect(await valueOf(doc, 'reference')).toBe('');
      });
    });

    test('Dana fills one in, corrects it and signs: it locks at her value; an empty one stays open', async () => {
      const signedByDana = await handOn('dana', async (doc) => {
        await doc.forms.setValue(field('reference'), { value: 'R-1' });
        await doc.forms.setValue(field('reference'), { value: 'R-2' });
        await doc.forms.setValue(field('dana_name'), { value: 'Dana Smith' });
        await sign(doc, { field: field('dana_sig') });
        const lock = await lockOf(doc, 'dana_sig');
        expect(lock?.action).toBe('include');
        // Her group, the filled fields anyone fills in (hers and the sender's), not the empty one.
        expect([...(lock?.fields ?? [])].sort()).toEqual(
          ['both', 'dana_name', 'delivery', 'reference'].sort(),
        );
        expect(await fill(doc, 'reference', 'R-3')).toBe(EngineErrorCode.ProtectedDocument);
        expect(await valueOf(doc, 'reference')).toBe('R-2');
      });
      const signedByAda = await handOn(
        'ada',
        async (doc) => {
          // Locked for Ada too, as for everyone.
          expect(await fill(doc, 'reference', 'R-9')).toBe(EngineErrorCode.ProtectedDocument);
          expect(await fill(doc, 'delivery', 'soon')).toBe(EngineErrorCode.ProtectedDocument);
          // The empty one is still open: Ada fills it in, and her signing locks it.
          expect(await fill(doc, 'notes', 'Leave at the door')).toBe('resolved');
          await sign(doc, { field: field('ada_sig') });
          expect([...((await lockOf(doc, 'ada_sig'))?.fields ?? [])].sort()).toEqual(
            ['ada_name', 'delivery', 'notes', 'reference'].sort(),
          );
          expect(await fill(doc, 'notes', 'x')).toBe(EngineErrorCode.ProtectedDocument);
        },
        signedByDana,
      );
      await as(
        'everything',
        async (doc) => {
          expect(await valueOf(doc, 'reference')).toBe('R-2');
          expect(await valueOf(doc, 'notes')).toBe('Leave at the door');
          expect(await fill(doc, 'notes', 'y')).toBe(EngineErrorCode.ProtectedDocument);
        },
        signedByAda,
      );
    });

    test('a required one is every signer’s to fill in, and locks once it holds a value', async () => {
      const prepared = await handOn('sender', async (doc) => {
        const { field: made } = await doc.forms.create({
          kind: 'checkbox',
          name: 'agree',
          required: true,
          forAnyone: true,
          widgets: widgetsAt(20, 200),
        });
        expect([made.required, made.forAnyone, made.groupId]).toEqual([true, true, null]);
      });
      // Empty, Dana's signing leaves it open; Ada checks it and her signing locks it.
      const afterDana = await handOn(
        'dana',
        async (doc) => {
          expect(doc.security.allowsField('fill', await doc.forms.get(field('agree')))).toBe(true);
          await sign(doc, { field: field('dana_sig') });
          expect(includes((await lockOf(doc, 'dana_sig'))?.fields, 'agree')).toBe(false);
        },
        prepared,
      );
      await as(
        'ada',
        async (doc) => {
          await doc.forms.setValue(field('agree'), { checked: true });
          await sign(doc, { field: field('ada_sig') });
          expect(includes((await lockOf(doc, 'ada_sig'))?.fields, 'agree')).toBe(true);
          const refused = await refusal(doc.forms.setValue(field('agree'), { checked: false }));
          expect(codeOf(refused)).toBe(EngineErrorCode.ProtectedDocument);
        },
        afterDana,
      );
    });

    test('an image field is every signer’s to fill in, and locks once it holds a picture', async () => {
      const prepared = await handOn('sender', async (doc) => {
        for (const [name, x] of [
          ['initials', 20],
          ['photo', 200],
        ] as const) {
          await doc.forms.create({
            kind: 'pushbutton',
            name,
            forAnyone: true,
            widgets: widgetsAt(x).map((widget) => ({ ...widget, layout: 'image' as const })),
          });
        }
      });
      /** What putting a picture in `name` (or taking it out) gives: `'resolved'` or the refusal's code. */
      const picture = async (doc: DocumentHandle, name: string, image: Uint8Array | null) =>
        codeOf(await refusal(doc.forms.setButtonImage(field(name), image)));
      // Dana puts her initials in; her signing locks them and leaves the empty photo open.
      const afterDana = await handOn(
        'dana',
        async (doc) => {
          expect(doc.security.allowsField('fill', await doc.forms.get(field('initials')))).toBe(
            true,
          );
          expect(await picture(doc, 'initials', BANDS_PNG)).toBe('resolved');
          await sign(doc, { field: field('dana_sig') });
          const locked = (await lockOf(doc, 'dana_sig'))?.fields ?? [];
          expect(locked).toContain('initials');
          expect(includes(locked, 'photo')).toBe(false);
          expect(await picture(doc, 'initials', null)).toBe(EngineErrorCode.ProtectedDocument);
        },
        prepared,
      );
      await as(
        'ada',
        async (doc) => {
          expect(await picture(doc, 'initials', BANDS_PNG)).toBe(EngineErrorCode.ProtectedDocument);
          expect(await picture(doc, 'photo', BANDS_PNG)).toBe('resolved');
          await sign(doc, { field: field('ada_sig') });
          expect(includes((await lockOf(doc, 'ada_sig'))?.fields, 'photo')).toBe(true);
          expect(await picture(doc, 'photo', null)).toBe(EngineErrorCode.ProtectedDocument);
        },
        afterDana,
      );
    });

    test("the sender's value locks at the first signature", async () => {
      const prepared = await handOn('sender', async (doc) => {
        await doc.forms.setValue(field('notes'), { value: 'Fragile' });
      });
      await as(
        'dana',
        async (doc) => {
          await sign(doc, { field: field('dana_sig') });
          const locked = (await lockOf(doc, 'dana_sig'))?.fields ?? [];
          expect(locked).toContain('notes');
          expect(locked).toContain('delivery');
          expect(includes(locked, 'reference')).toBe(false);
          expect(await fill(doc, 'notes')).toBe(EngineErrorCode.ProtectedDocument);
          expect(await fill(doc, 'reference', 'R-1')).toBe('resolved');
        },
        prepared,
      );
    });

    test('a signature field in no group locks the filled ones, and with none filled locks nothing', async () => {
      // Only the sender's value: the signing locks it and nothing else.
      await as('filler', async (doc) => {
        await doc.forms.setValue(field('reference'), { value: 'R-1' });
        await sign(doc, { field: field('witness_sig') });
        const lock = await lockOf(doc, 'witness_sig');
        expect(lock?.action).toBe('include');
        expect([...(lock?.fields ?? [])].sort()).toEqual(['delivery', 'reference']);
        expect(await fill(doc, 'notes')).toBe('resolved');
        expect(await fill(doc, 'sender_note')).toBe('resolved');
      });
      // With every one empty, such a signing locks nothing, as it always did.
      await as('filler', async (doc) => {
        await doc.forms.setValue(field('delivery'), { value: '' });
        await sign(doc, { field: field('witness_sig') });
        expect(await lockOf(doc, 'witness_sig')).toBe(null);
        expect((await doc.signatures.list()).protection.fieldLocks).toEqual([]);
      });
    });

    test('a signing that names its own lock decides for itself', async () => {
      await as('dana', async (doc) => {
        await doc.forms.setValue(field('reference'), { value: 'R-1' });
        await sign(doc, {
          field: field('dana_sig'),
          lock: { action: 'include', fields: ['dana_name'] },
        });
        expect((await lockOf(doc, 'dana_sig'))?.fields).toEqual(['dana_name']);
        expect(await fill(doc, 'reference', 'R-2')).toBe('resolved');
        expect(await fill(doc, 'delivery', 'later')).toBe('resolved');
        expect(await fill(doc, 'dana_name')).toBe(EngineErrorCode.ProtectedDocument);
      });
    });

    test("a signature field's own lock decides what its signing locks", async () => {
      // The field already locks every field: a filled one adds nothing, and the signing goes on.
      await as(
        'filler',
        async (doc) => {
          await doc.forms.setValue(field('reference'), { value: 'PO-42' });
          await sign(doc, { field: field('all_sig') });
          expect((await lockOf(doc, 'all_sig'))?.action).toBe('all');
          expect(await fill(doc, 'reference', 'PO-43')).toBe(EngineErrorCode.ProtectedDocument);
        },
        OWN_LOCK_PDF,
      );
      // A narrower lock of its own stays as it is: what it leaves open stays open.
      await as(
        'dana',
        async (doc) => {
          await doc.forms.setValue(field('reference'), { value: 'PO-42' });
          await sign(doc, { field: field('dana_sig') });
          expect(await lockOf(doc, 'dana_sig')).toMatchObject({
            action: 'include',
            fields: ['dana_name'],
          });
          expect(await fill(doc, 'reference', 'PO-43')).toBe('resolved');
        },
        OWN_LOCK_PDF,
      );
    });

    test('a field in a group, or a signature field, is never for anyone', async () => {
      await as('everything', async (doc) => {
        const invalid = async (attempt: Promise<unknown>, named = true) => {
          const error = await refusal(attempt);
          expect(codeOf(error)).toBe(EngineErrorCode.InvalidArg);
          if (named) expect((error as EngineError).details).toMatchObject({ field: 'forAnyone' });
        };
        await invalid(
          doc.forms.create({ kind: 'text', name: 'x', groupId: 'dana', forAnyone: true }),
        );
        await invalid(doc.forms.create({ kind: 'signature', name: 'x', forAnyone: true }));
        await invalid(doc.forms.update(field('dana_name'), { forAnyone: true }));
        await invalid(doc.forms.update(field('witness_sig'), { forAnyone: true }));
        // A group for such a field without taking `forAnyone` away.
        await invalid(doc.forms.update(field('reference'), { groupId: 'dana' }));
        // Refused by the request's schema on the wire, by the engine locally.
        await invalid(
          doc.forms.update(field('reference'), { forAnyone: 'yes' as unknown as boolean }),
          false,
        );
        // Moved both ways in one update each.
        await doc.forms.update(field('reference'), { groupId: 'dana', forAnyone: false });
        expect(await doc.forms.get(field('reference'))).toMatchObject({
          groupId: 'dana',
          forAnyone: false,
        });
        await doc.forms.update(field('reference'), { groupId: null, forAnyone: true });
        expect(await doc.forms.get(field('reference'))).toMatchObject({
          groupId: null,
          forAnyone: true,
        });
        // `false` on a signature field changes nothing.
        await doc.forms.update(field('witness_sig'), { forAnyone: false });
        // Another tool's entry beside a group doesn't come back with the group gone.
        await doc.forms.update(field('both'), { groupId: null });
        expect((await doc.forms.get(field('both'))).forAnyone).toBe(false);
      });
    });

    test('marking one takes fields:set-group:all; unmarking takes form design', async () => {
      await as('designer', async (doc) => {
        const refused = await refusal(
          doc.forms.create({ kind: 'text', name: 'x', forAnyone: true, widgets: widgetsAt(20) }),
        );
        expect(codeOf(refused)).toBe(EngineErrorCode.Forbidden);
        expect((refused as EngineError).details).toMatchObject({
          required: 'fields:set-group:all',
        });
        const update = await refusal(doc.forms.update(field('sender_note'), { forAnyone: true }));
        expect((update as EngineError).details).toMatchObject({
          required: 'fields:set-group:all',
        });
        // `false` takes form design alone, as no group does.
        await doc.forms.update(field('reference'), { forAnyone: false });
        expect((await doc.forms.get(field('reference'))).forAnyone).toBe(false);
        expect(doc.security.fieldRights().setGroup).toEqual({ all: false, groups: ['dana'] });
      });
      await as('sender', async (doc) => {
        expect(doc.security.fieldRights().setGroup).toEqual({ all: true });
        const { field: made } = await doc.forms.create({
          kind: 'text',
          name: 'x',
          forAnyone: true,
          widgets: widgetsAt(20),
        });
        expect(made.forAnyone).toBe(true);
      });
    });

    test('an undo puts the fact back, also after a later change to the field', async () => {
      await as('sender', async (doc) => {
        const marked = await doc.apply({
          ops: [{ type: 'forms.update', field: field('sender_note'), patch: { forAnyone: true } }],
        });
        expect((await doc.forms.get(field('sender_note'))).forAnyone).toBe(true);
        await doc.apply({ undoOf: marked.meta.opId });
        expect((await doc.forms.get(field('sender_note'))).forAnyone).toBe(false);

        const moved = await doc.apply({
          ops: [
            {
              type: 'forms.update',
              field: field('dana_name'),
              patch: { groupId: null, forAnyone: true },
            },
          ],
        });
        await doc.forms.update(field('dana_name'), { required: true });
        await doc.apply({ undoOf: moved.meta.opId });
        expect(await doc.forms.get(field('dana_name'))).toMatchObject({
          groupId: 'dana',
          forAnyone: false,
          required: true,
        });
      });
    });

    test('an undo leaves a newer assignment as it is and puts the rest back', async () => {
      await as('sender', async (doc) => {
        // One update takes `reference` from anyone and gives it a label…
        const edited = await doc.apply({
          ops: [
            {
              type: 'forms.update',
              field: field('reference'),
              patch: { forAnyone: false, alternateName: 'Order number' },
            },
          ],
        });
        // …and a later one gives it to Ada.
        await doc.forms.update(field('reference'), { groupId: 'ada' });
        const undone = await doc.apply({ undoOf: edited.meta.opId });
        expect(await doc.forms.get(field('reference'))).toMatchObject({
          groupId: 'ada',
          forAnyone: false,
          alternateName: null,
        });
        const item = undone.items[0] as { skipped?: readonly string[] };
        expect([...(item.skipped ?? [])].sort()).toEqual(['forAnyone', 'groupId']);
      });
    });

    test('an update that expects the fact applies only where it holds', async () => {
      await as('sender', async (doc) => {
        const expecting = (name: string) =>
          doc.apply({
            ops: [
              {
                type: 'forms.update',
                field: field(name),
                patch: { required: true },
                expect: { forAnyone: true },
              },
            ],
          });
        expect(codeOf(await refusal(expecting('sender_note')))).toBe(
          EngineErrorCode.ChangeConflict,
        );
        await expecting('reference');
        expect((await doc.forms.get(field('reference'))).required).toBe(true);
      });
    });

    test('a copy keeps the fact, which takes the right to mark it', async () => {
      await as('sender', async (doc) => {
        const copied = await doc.forms.copy([field('reference'), field('sender_note')]);
        expect(copied.fields.map((f) => [f.groupId, f.forAnyone])).toEqual([
          [null, true],
          [null, false],
        ]);
      });
      await as('designer', async (doc) => {
        const refused = await refusal(doc.forms.copy([field('reference')]));
        expect(codeOf(refused)).toBe(EngineErrorCode.Forbidden);
        expect((refused as EngineError).details).toMatchObject({
          required: 'fields:set-group:all',
        });
      });
    });

    test('an export carries the fact, and an import keeps it under the right rights', async () => {
      let everyone: Awaited<ReturnType<DocumentHandle['forms']['export']>> | null = null;
      let plain: Awaited<ReturnType<DocumentHandle['forms']['export']>> | null = null;
      await as('everything', async (doc) => {
        everyone = await doc.forms.export();
        plain = await doc.forms.export({ fields: [field('sender_note')] });
      });
      const marked = Object.fromEntries(
        everyone!.fields.map(({ data }) => [data.name, data.forAnyone]),
      );
      expect(marked).toMatchObject({ reference: true, notes: true, sender_note: false });
      const blank = await handOn('everything', async (doc) => {
        for (const { ref } of (await doc.forms.list()).fields) await doc.forms.delete(ref);
      });
      await as(
        'sender',
        async (doc) => {
          const copied = await doc.forms.import(everyone!, { attribution: 'stamp' });
          const facts = Object.fromEntries(copied.fields.map((f) => [f.name, f.forAnyone]));
          expect(facts).toMatchObject({ reference: true, delivery: true, sender_note: false });
        },
        blank,
      );
      await as(
        'designer',
        async (doc) => {
          // A field of no group, not for anyone, she may copy in.
          const copied = await doc.forms.import(plain!, { attribution: 'stamp' });
          expect(copied.fields.map((f) => f.forAnyone)).toEqual([false]);
          const refused = await refusal(doc.forms.import(everyone!, { attribution: 'stamp' }));
          expect(codeOf(refused)).toBe(EngineErrorCode.Forbidden);
        },
        blank,
      );
      await as(
        'everything',
        async (doc) => {
          const restored = await doc.forms.import(everyone!, { attribution: 'restore' });
          const facts = Object.fromEntries(restored.fields.map((f) => [f.name, f.forAnyone]));
          expect(facts).toMatchObject({ reference: true, notes: true, sender_note: false });
        },
        blank,
      );
    });

    test('after a signature, filling one it left open is permitted; changing one it locked is forbidden', async () => {
      const signed = await handOn('dana', async (doc) => {
        await doc.forms.setValue(field('reference'), { value: 'R-1' });
        await sign(doc, { field: field('dana_sig') });
      });
      const since = { since: { signatureIndex: 0 }, until: 'working-copy' } as const;
      // Ada, the next signer, fills in a field for anyone that Dana's signature left open.
      await as(
        'ada',
        async (doc) => {
          await doc.forms.setValue(field('notes'), { value: 'later' });
          expect((await doc.signatures.analyze(since)).verdict).toBe('permitted');
        },
        signed,
      );
      if (!permitEngine) return;
      await as(
        'everything',
        async (doc) => {
          // Judged, not enforced: the write goes through, and the signature's lock forbids it.
          await doc.forms.setValue(field('reference'), { value: 'R-2' });
          const analysis = await doc.signatures.analyze(since);
          expect(analysis.verdict).toBe('forbidden');
          const findings = analysis.steps.flatMap((step) => step.findings);
          expect(
            findings.some(
              (finding) =>
                finding.rule === 'field-lock' &&
                finding.verdict === 'forbidden' &&
                (finding.detail ?? '').includes('"reference"'),
            ),
          ).toBe(true);
        },
        signed,
        permitEngine,
      );
    });
  });
}
