import { CHANGE_FIXTURE_PDF } from './runChangeConformance';
import type { AttributionSession } from './runAnnotationAttributionConformance';
import type { ConformanceTestRunner } from './runMetadataConformance';
import { BANDS_PNG } from './stampFixtures';
import type { Identity } from '../auth/scope';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { FormField } from '../forms/field';
import type { PageBox } from '../geometry/pageSpace';
import { annotationKey } from '../identity/annotationKey';
import type { FormFieldRef } from '../identity/FormFieldRef';
import { toPageRef } from '../identity/PageRef';
import type { StepVerdict } from '../signature/analysis/types';

/**
 * Who made a field, on both engines with the same identities. The engine
 * stamps it from the session: `create` names the creator. A fill records
 * nobody, named or not: it writes the value and its drawing, as every PDF app
 * does, so a signature made before it stays permitted, and so does one made
 * before a mark is drawn in and signed. A widget row reports no attribution:
 * the field holds it.
 *
 * It runs on {@link CHANGE_FIXTURE_PDF}: the text field `name`, merged with
 * its widget (9), holding `Ann`, on page 3.
 */

export interface FormAttributionConformanceOptions {
  label: string;
  /** Build a fresh engine for this suite. The suite tears it down at the end. */
  makeEngine: () => Promise<Engine> | Engine;
  /**
   * Open a fresh copy of {@link CHANGE_FIXTURE_PDF} as `session`. With
   * `from`, the new session continues that open session's document and sees
   * what it wrote (locally its downloaded bytes, on the cloud the same
   * layer); the suite closes `from` afterwards.
   */
  openAs: (
    engine: Engine,
    session: AttributionSession,
    from?: DocumentHandle,
  ) => Promise<DocumentHandle>;
  /**
   * Sign field `field` of `doc` with an approval signature. Default: a
   * signing completed with a placeholder CMS, which the local engine takes;
   * a server judges the CMS, so the cloud engine passes a real one.
   */
  sign?: (doc: DocumentHandle, field: FormFieldRef) => Promise<void>;
}

// `doc.download` lets a session continue another's document (locally, its bytes).
const FILL = ['doc.open', 'doc.render', 'doc.download', 'doc.forms.fill'] as const;
const DESIGN = ['doc.open', 'doc.render', 'doc.download', 'doc.forms.modify'] as const;
const SIGNER = [...FILL, 'doc.forms.modify', 'doc.sign'] as const;
const EVERYTHING = ['*'] as const;

/** A DER `SEQUENCE`: what a completion takes as a CMS, without judging it. */
const PLACEHOLDER_CMS = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);
const PAGE = toPageRef(3);
const LEFT_BOX: PageBox = { x: 20, y: 100, width: 120, height: 40 };
const RIGHT_BOX: PageBox = { x: 160, y: 100, width: 120, height: 40 };

const ALICE: Identity = { userId: 'alice', displayName: 'Alice Author', groupId: 'legal' };
const BOB: Identity = { userId: 'bob', displayName: 'Bob Builder' };
const ANONYMOUS: Identity = {};

const NAME: FormFieldRef = { kind: 'fqn', name: 'name' };
const WIDGET = 9;

export function runFormAttributionConformance(
  runner: ConformanceTestRunner,
  options: FormAttributionConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`form attribution conformance: ${options.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await options.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const open = (identity: Identity, scope: readonly string[] = FILL, from?: DocumentHandle) =>
      options.openAs(engine, { scope, identity }, from);

    /** Continue `from`'s document as `identity`, closing `from`. */
    const continueAs = async (
      from: DocumentHandle,
      identity: Identity,
      scope: readonly string[] = FILL,
    ) => {
      const next = await open(identity, scope, from);
      await from.close();
      return next;
    };

    const signatureField = (doc: DocumentHandle, name: string, box: PageBox) =>
      doc.forms.create({ kind: 'signature', name, widgets: [{ page: PAGE, box }] });

    const sign = async (doc: DocumentHandle, name: string) => {
      const field: FormFieldRef = { kind: 'fqn', name };
      if (options.sign) return options.sign(doc, field);
      const prepared = await doc.signatures.prepare({ field });
      await doc.signatures.complete({
        signingId: prepared.signingId,
        cms: PLACEHOLDER_CMS,
        expectedVersion: prepared.expectedVersion,
      });
    };

    /** What changed since field `name`'s signature, up to the working copy. */
    const verdictSince = async (doc: DocumentHandle, name: string): Promise<StepVerdict> => {
      const { signatures } = await doc.signatures.list();
      const signature = signatures.find((s) => s.fieldName === name && s.signed);
      if (!signature) throw new Error(`'${name}' is not signed`);
      const analysis = await doc.signatures.analyze({
        since: { signatureIndex: signature.index },
        until: 'working-copy',
      });
      return analysis.verdict;
    };

    const fieldOf = async (doc: DocumentHandle, name: string): Promise<FormField> => {
      const { fields } = await doc.forms.list();
      const field = fields.find((f) => f.name === name);
      if (!field) throw new Error(`no field '${name}'`);
      return field;
    };

    /** A date stamped between `before` and now: the engine stamps whole seconds. */
    const expectStampedSince = (value: string | null, before: number) => {
      expect(value !== null).toBe(true);
      const at = Date.parse(value!);
      expect(at >= Math.floor(before / 1000) * 1000 && at <= Date.now()).toBe(true);
    };

    test('create names who created the field, and when', async () => {
      const doc = await open(ALICE, DESIGN);
      try {
        const before = Date.now();
        const { field } = await doc.forms.create({ kind: 'text', name: 'extra' });
        expect(field.createdBy).toBe('alice');
        expectStampedSince(field.createdAt, before);
        expect(field.filledBy).toBe(null);
        expect(field.importedBy).toBe(null);
        expect((await fieldOf(doc, 'extra')).createdBy).toBe('alice');
        // A file's own field names nobody.
        expect((await fieldOf(doc, 'name')).createdBy).toBe(null);
      } finally {
        await doc.close();
      }
    });

    test('a fill records nobody, named or not, and neither does a reset', async () => {
      let doc = await open(ALICE);
      const { field } = await doc.forms.setValue(NAME, { value: 'Cleo' });
      expect([field.filledBy, field.filledByName, field.filledAt]).toEqual([null, null, null]);

      doc = await continueAs(doc, BOB);
      try {
        expect((await fieldOf(doc, 'name')).filledBy).toBe(null);
        await doc.forms.setValue(NAME, { value: 'Bea' });
        const reset = await doc.forms.reset(NAME);
        const cleared = reset.fields.find((f) => f.name === 'name')!;
        expect([cleared.filledBy, cleared.filledByName, cleared.filledAt]).toEqual([
          null,
          null,
          null,
        ]);
      } finally {
        await doc.close();
      }
    });

    test('a named fill after a signature leaves it permitted, and so does a reset', async () => {
      let doc = await open(ALICE, SIGNER);
      await signatureField(doc, 'approval', LEFT_BOX);
      await doc.forms.setValue(NAME, { value: 'Cleo' });
      await sign(doc, 'approval');

      doc = await continueAs(doc, BOB);
      await doc.forms.setValue(NAME, { value: 'Bea' });
      await doc.forms.reset(NAME);
      await doc.forms.setValue(NAME, { value: 'Dee' });

      doc = await continueAs(doc, ANONYMOUS, EVERYTHING);
      try {
        expect(await verdictSince(doc, 'approval')).toBe('permitted');
      } finally {
        await doc.close();
      }
    });

    test('a mark drawn in and then signed leaves an earlier signature permitted', async () => {
      let doc = await open(ALICE, SIGNER);
      await signatureField(doc, 'first', LEFT_BOX);
      await signatureField(doc, 'second', RIGHT_BOX);
      await sign(doc, 'first');

      doc = await continueAs(doc, BOB, SIGNER);
      await doc.forms.setSignatureAppearance({ kind: 'fqn', name: 'second' }, BANDS_PNG);
      await sign(doc, 'second');

      doc = await continueAs(doc, ANONYMOUS, EVERYTHING);
      try {
        expect(await verdictSince(doc, 'first')).toBe('permitted');
        const { fields, widgets } = await doc.forms.list();
        const second = fields.find((f) => f.name === 'second')!;
        const row = widgets.find(
          (w) => annotationKey(w.ref) === annotationKey(second.widgets[0]!.ref!),
        );
        expect(row?.hasMark).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('a widget row reports no attribution: the field holds it', async () => {
      const doc = await open(ALICE);
      try {
        await doc.forms.setValue(NAME, { value: 'Cleo' });
        const { widgets } = await doc.forms.list();
        const row = widgets.find(
          (w) => w.ref.kind === 'objectNumber' && w.ref.objectNumber === WIDGET,
        );
        expect(row !== undefined).toBe(true);
        expect([row!.createdBy, row!.userId, row!.groupId, row!.importedBy]).toEqual([
          null,
          null,
          null,
          null,
        ]);
      } finally {
        await doc.close();
      }
    });
  });
}
