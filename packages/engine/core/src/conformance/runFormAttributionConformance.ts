import { CHANGE_FIXTURE_PDF } from './runChangeConformance';
import type { AttributionSession } from './runAnnotationAttributionConformance';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { Identity } from '../auth/scope';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { FormFieldDTO } from '../forms/field';
import type { FormFieldRef } from '../identity/FormFieldRef';

/**
 * Who made a field and who filled it in, on both engines with the same
 * identities. The engine stamps it from the session: `create` names the
 * creator, a write that changes a value names its filler (a script's value
 * counts as filled by the user whose fill ran it), a reset and an anonymous
 * fill name nobody, and an undo puts the previous filler back. A widget row
 * reports no attribution: the field holds it.
 *
 * It runs on {@link CHANGE_FIXTURE_PDF}: the text field `name`, merged with
 * its widget (9), holding `Ann`.
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
}

// `doc.download` lets a session continue another's document (locally, its bytes).
const FILL = ['doc.open', 'doc.render', 'doc.download', 'doc.forms.fill'] as const;
const DESIGN = ['doc.open', 'doc.render', 'doc.download', 'doc.forms.modify'] as const;

const ALICE: Identity = { userId: 'alice', displayName: 'Alice Author', groupId: 'legal' };
const BOB: Identity = { userId: 'bob', displayName: 'Bob Builder' };
const ANONYMOUS: Identity = {};

const NAME: FormFieldRef = { kind: 'fqn', name: 'name' };
const WIDGET = 9;

export function runFormAttributionConformance(
  runner: ConformanceTestRunner,
  opts: FormAttributionConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`form attribution conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const open = (identity: Identity, scope: readonly string[] = FILL, from?: DocumentHandle) =>
      opts.openAs(engine, { scope, identity }, from);

    /** Continue `from`'s document as `identity`, closing `from`. */
    const continueAs = async (from: DocumentHandle, identity: Identity) => {
      const next = await open(identity, FILL, from);
      await from.close();
      return next;
    };

    const fieldOf = async (doc: DocumentHandle, name: string): Promise<FormFieldDTO> => {
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
        const { field } = await doc.forms.create({ family: 'text', name: 'extra' });
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

    test('a fill names who filled the value in; one that changes nothing names nobody new', async () => {
      let doc = await open(ALICE);
      const before = Date.now();
      const { field } = await doc.forms.setValue(NAME, { value: 'Cleo' });
      expect(field.filledBy).toBe('alice');
      expect(field.filledByName).toBe('Alice Author');
      expectStampedSince(field.filledAt, before);

      doc = await continueAs(doc, BOB);
      try {
        const same = await doc.forms.setValue(NAME, { value: 'Cleo' });
        expect(same.field.filledBy).toBe('alice');
        const changed = await doc.forms.setValue(NAME, { value: 'Bea' });
        expect(changed.field.filledBy).toBe('bob');
        expect(changed.field.filledByName).toBe('Bob Builder');
        expect((await fieldOf(doc, 'name')).filledBy).toBe('bob');
      } finally {
        await doc.close();
      }
    });

    test('a reset, and an anonymous fill, name nobody', async () => {
      let doc = await open(ALICE);
      await doc.forms.setValue(NAME, { value: 'Cleo' });
      const reset = await doc.forms.reset(NAME);
      const cleared = reset.fields.find((field) => field.name === 'name')!;
      expect([cleared.filledBy, cleared.filledByName, cleared.filledAt]).toEqual([
        null,
        null,
        null,
      ]);

      await doc.forms.setValue(NAME, { value: 'Cleo' });
      doc = await continueAs(doc, ANONYMOUS);
      try {
        const { field } = await doc.forms.setValue(NAME, { value: 'Someone' });
        expect([field.filledBy, field.filledByName, field.filledAt]).toEqual([null, null, null]);
      } finally {
        await doc.close();
      }
    });

    test("a script's value counts as filled in by the user whose fill ran it", async () => {
      const doc = await open(ALICE);
      try {
        const { results } = await doc.forms.applyEffects([
          { kind: 'setValue', ref: NAME, value: { value: 'Calculated' } },
        ]);
        expect(results[0]!.status).toBe('applied');
        expect(results[0]!.fields[0]!.filledBy).toBe('alice');
        expect((await fieldOf(doc, 'name')).filledBy).toBe('alice');
      } finally {
        await doc.close();
      }
    });

    test('undoing a fill puts the previous filler back', async () => {
      let doc = await open(ALICE);
      await doc.forms.setValue(NAME, { value: 'Cleo' });
      doc = await continueAs(doc, BOB);
      try {
        const filled = await doc.forms.setValue(NAME, { value: 'Bea' });
        expect(filled.field.filledBy).toBe('bob');
        await doc.apply({ undoOf: filled.meta.opId });
        const field = await fieldOf(doc, 'name');
        expect(field.filledBy).toBe('alice');
        expect(field.filledByName).toBe('Alice Author');
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
