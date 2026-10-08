import { CHANGE_FIXTURE_PDF } from './runChangeConformance';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { FieldScriptWrite } from '../dto/PdfAction';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { DocumentEvent } from '../events/DocumentEvent';
import type { FormFieldDTO } from '../forms/field';
import type { FormFieldRef } from '../identity/FormFieldRef';

/**
 * A field's scripts, written through `create` and `update`, and the form's
 * calculation order, which follows the calculate scripts and moves by
 * neighbour. Undo puts both back. A field event takes JavaScript only, and
 * writing a script takes `doc.forms.script`.
 *
 * It runs on {@link CHANGE_FIXTURE_PDF}: the text field `name`, merged with
 * its widget, and no calculation order.
 */

export interface FormScriptConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** Open a fresh copy of {@link CHANGE_FIXTURE_PDF} with `scope`. */
  open: (engine: Engine, scope: readonly string[]) => Promise<DocumentHandle>;
}

const EVERYTHING = ['*'] as const;
const DESIGN_ONLY = ['doc.open', 'doc.render', 'doc.forms.modify'] as const;

const NAME: FormFieldRef = { kind: 'fqn', name: 'name' };
const script = (source: string): FieldScriptWrite => ({ type: 'javascript', script: source });
const CALCULATE = script('event.value = 1;');

export function runFormScriptConformance(
  runner: ConformanceTestRunner,
  opts: FormScriptConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`form script conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const withDoc = async (
      body: (doc: DocumentHandle) => Promise<void>,
      scope: readonly string[] = EVERYTHING,
    ) => {
      const doc = await opts.open(engine, scope);
      try {
        await body(doc);
      } finally {
        await doc.close();
      }
    };

    const fieldOf = async (doc: DocumentHandle, name: string): Promise<FormFieldDTO> => {
      const field = (await doc.forms.list()).fields.find((f) => f.name === name);
      if (!field) throw new Error(`no field '${name}'`);
      return field;
    };

    /** The script an event runs, or null. */
    const scriptOf = (field: FormFieldDTO, event: 'keystroke' | 'format' | 'validate' | 'calculate') => {
      const root = field.actions?.[event]?.root;
      return root?.type === 'javascript' ? root.script : null;
    };

    /** The calculation order, by field name. */
    const orderOf = async (doc: DocumentHandle): Promise<string[]> => {
      const { fields, calculationOrder } = await doc.forms.list();
      return calculationOrder.map((ref) => {
        const field = ref && fields.find((f) => JSON.stringify(f.ref) === JSON.stringify(ref));
        return field ? field.name : '?';
      });
    };

    const createCalculated = async (doc: DocumentHandle, name: string) =>
      doc.forms.create({ family: 'text', name, actions: { calculate: CALCULATE } });

    const outcome = (attempt: Promise<unknown>) =>
      attempt.then(
        () => 'resolved',
        (error: unknown) => (EngineError.is(error) ? error.code : String(error)),
      );

    test("create writes a field's scripts; a calculate script puts it in the order", async () => {
      await withDoc(async (doc) => {
        const created = await doc.forms.create({
          family: 'text',
          name: 'total',
          readOnly: true,
          actions: {
            calculate: CALCULATE,
            format: { ...script('AFNumber_Format(2, 0, 0, 0, "", true);'), next: [script('x = 1;')] },
          },
        });
        expect(scriptOf(created.field, 'calculate')).toBe('event.value = 1;');
        expect(created.calculationOrder?.map((ref) => ref.kind)).toEqual(['objectNumber']);

        const total = await fieldOf(doc, 'total');
        expect(scriptOf(total, 'format')).toBe('AFNumber_Format(2, 0, 0, 0, "", true);');
        expect(total.actions?.format?.root?.next.map((n) => n.type)).toEqual(['javascript']);
        expect(scriptOf(total, 'keystroke')).toBe(null);
        expect(await orderOf(doc)).toEqual(['total']);
      });
    });

    test('update sets, replaces and removes scripts; an event left out keeps its own', async () => {
      await withDoc(async (doc) => {
        await doc.forms.update(NAME, { actions: { format: script('a();') } });
        await doc.forms.update(NAME, { actions: { format: script('b();'), validate: script('c();') } });
        let name = await fieldOf(doc, 'name');
        expect([scriptOf(name, 'format'), scriptOf(name, 'validate')]).toEqual(['b();', 'c();']);

        await doc.forms.update(NAME, { actions: { format: null } });
        name = await fieldOf(doc, 'name');
        expect([scriptOf(name, 'format'), scriptOf(name, 'validate')]).toEqual([null, 'c();']);
        // No calculate script, no place in the order.
        expect(await orderOf(doc)).toEqual([]);
      });
    });

    test('the order follows the calculate scripts: added at the end, gone with the script or the field', async () => {
      await withDoc(async (doc) => {
        await createCalculated(doc, 'a');
        await createCalculated(doc, 'b');
        const updated = await doc.forms.update(NAME, { actions: { calculate: CALCULATE } });
        expect(updated.calculationOrder?.length).toBe(3);
        expect(await orderOf(doc)).toEqual(['a', 'b', 'name']);

        await doc.forms.update(NAME, { actions: { calculate: null } });
        expect(await orderOf(doc)).toEqual(['a', 'b']);
        const deleted = await doc.forms.delete({ kind: 'fqn', name: 'a' });
        expect(deleted.calculationOrder?.length).toBe(1);
        expect(await orderOf(doc)).toEqual(['b']);
      });
    });

    test('reorderCalculations moves fields by neighbour and publishes the whole order', async () => {
      await withDoc(async (doc) => {
        const a = (await createCalculated(doc, 'a')).field.ref;
        await createCalculated(doc, 'b');
        const c = (await createCalculated(doc, 'c')).field.ref;
        const heard: DocumentEvent[] = [];
        const unsubscribe = doc.events.subscribe((event) => heard.push(event));
        try {
          const moved = await doc.forms.reorderCalculations([c], { before: a });
          expect(moved.calculationOrder.length).toBe(3);
          expect(await orderOf(doc)).toEqual(['c', 'a', 'b']);
          expect(heard.some((event) => event.type === 'forms.calculationsReordered')).toBe(true);

          await doc.forms.reorderCalculations([a], 'end');
          expect(await orderOf(doc)).toEqual(['c', 'b', 'a']);
        } finally {
          unsubscribe();
        }
        // A field not in the order, and a neighbour among the moved, are refused.
        expect(await outcome(doc.forms.reorderCalculations([NAME], 'start'))).toBe(
          EngineErrorCode.NotFound,
        );
        expect(await outcome(doc.forms.reorderCalculations([a], { after: a }))).toBe(
          EngineErrorCode.InvalidArg,
        );
      });
    });

    test('undo puts the scripts and the order back; redo does them again', async () => {
      await withDoc(async (doc) => {
        await createCalculated(doc, 'a');
        const b = (await createCalculated(doc, 'b')).field.ref;

        const scripted = await doc.forms.update(NAME, {
          actions: { calculate: CALCULATE, format: script('f();') },
        });
        expect(await orderOf(doc)).toEqual(['a', 'b', 'name']);
        const undo = await doc.apply({ undoOf: scripted.meta.opId });
        let name = await fieldOf(doc, 'name');
        expect([scriptOf(name, 'calculate'), scriptOf(name, 'format')]).toEqual([null, null]);
        expect(await orderOf(doc)).toEqual(['a', 'b']);
        await doc.apply({ undoOf: undo.meta.opId });
        name = await fieldOf(doc, 'name');
        expect(scriptOf(name, 'format')).toBe('f();');
        expect(await orderOf(doc)).toEqual(['a', 'b', 'name']);

        const moved = await doc.forms.reorderCalculations([NAME], { before: b });
        expect(await orderOf(doc)).toEqual(['a', 'name', 'b']);
        await doc.apply({ undoOf: moved.meta.opId });
        expect(await orderOf(doc)).toEqual(['a', 'b', 'name']);

        const deleted = await doc.forms.delete({ kind: 'fqn', name: 'a' });
        expect(await orderOf(doc)).toEqual(['b', 'name']);
        await doc.apply({ undoOf: deleted.meta.opId });
        expect(await orderOf(doc)).toEqual(['a', 'b', 'name']);
      });
    });

    test('a field event takes JavaScript only', async () => {
      await withDoc(async (doc) => {
        const notAScript = { type: 'uri', uri: 'https://example.com' } as unknown as FieldScriptWrite;
        expect(await outcome(doc.forms.update(NAME, { actions: { format: notAScript } }))).toBe(
          EngineErrorCode.InvalidArg,
        );
        expect(scriptOf(await fieldOf(doc, 'name'), 'format')).toBe(null);
      });
    });

    test('writing a script takes doc.forms.script; removing one does not', async () => {
      await withDoc(async (doc) => {
        await doc.forms.update(NAME, { actions: { format: script('f();') } });
      });
      await withDoc(async (doc) => {
        expect(doc.security.allows('doc.forms.script')).toBe(false);
        const refused = [
          await outcome(doc.forms.update(NAME, { actions: { format: script('f();') } })),
          await outcome(
            doc.forms.create({ family: 'text', name: 'x', actions: { calculate: CALCULATE } }),
          ),
          await outcome(
            doc.apply({
              ops: [{ type: 'forms.update', field: NAME, patch: { actions: { validate: script('v();') } } }],
            }),
          ),
        ];
        expect(refused.every((code) => code === EngineErrorCode.Forbidden)).toBe(true);
        // A field without scripts, and a removal, need only doc.forms.modify.
        await doc.forms.create({ family: 'text', name: 'plain' });
        await doc.forms.update(NAME, { actions: { format: null } });
      }, DESIGN_ONLY);
    });
  });
}
