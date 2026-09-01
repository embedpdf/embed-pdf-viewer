/**
 * A document boot script failing must NEVER disable interactive filling —
 * the invariant behind the i-140 class of bugs (Adobe's `!ADBE::…VersChk…`
 * boilerplate calling APIs we don't emulate). A boot error degrades to a
 * `script-error` diagnostic; the user's own commit still applies. Boot-phase
 * UI effects are tagged so embedders can suppress doc-open nags.
 */
import { describe, expect, it, vi } from 'vitest';
import type { DocumentHandle, FormEffect, FormSnapshot } from '@embedpdf/engine-core/runtime';
import type { ScriptSandbox } from '@embedpdf/core-js-sandbox';
import type { ScriptInput, ScriptOutput } from '@embedpdf/core-acrojs';

import { createFormScriptingController } from '../src/scripting';

const okEvent = (value: unknown = '') => ({
  rc: true,
  value: value as never,
  change: '',
  selStart: 0,
  selEnd: 0,
});

const output = (over: Partial<ScriptOutput> = {}): ScriptOutput => ({
  event: okEvent(),
  formEffects: [],
  uiEffects: [],
  diagnostics: [],
  ...over,
});

/** A sandbox whose BOOT throws (script called an API we don't emulate). */
function failingBootSandbox(): ScriptSandbox {
  return {
    disposed: false,
    boot: () =>
      output({
        uiEffects: [{ kind: 'alert', message: 'This PDF requires a newer version…', icon: 1 }],
        error: { kind: 'exception', message: 'not a function' },
      }),
    run: (_source: string, input: ScriptInput) =>
      output({ event: okEvent((input.event as { value?: unknown }).value) }),
    dispose: () => {},
  } as unknown as ScriptSandbox;
}

function textField(objnum: number, name: string) {
  return {
    ref: { kind: 'objectNumber' as const, fieldObjectNumber: objnum },
    fieldObjectNumber: objnum,
    name,
    family: 'text' as const,
    origin: 'acroform' as const,
    flags: { readOnly: false, required: false, noExport: false, raw: 0 },
    alternateName: null,
    mappingName: null,
    widgets: [{ annotObjectNumber: objnum + 100, pageObjectNumber: 3 }],
    value: '',
    defaultValue: '',
    valueEntry: { kind: 'none' as const },
    defaultValueEntry: { kind: 'none' as const },
    maxLength: null,
    multiline: false,
    password: false,
    comb: false,
  };
}

function makeDoc(applied: FormEffect[][]) {
  return {
    id: 'diag-doc',
    security: { identity: null },
    actions: {
      read: async () => ({
        nameTreeScripts: [
          {
            name: '!ADBE::VersChk',
            action: {
              incomplete: false,
              root: {
                type: 'javascript',
                subtype: 'JavaScript',
                script: 'app.findComponent({cType:"Plugin"});',
                next: [],
              },
            },
          },
        ],
      }),
    },
    forms: {
      list: async () => snapshot(),
      applyEffects: vi.fn(async (effects: FormEffect[]) => {
        applied.push(effects);
        return { results: effects.map(() => ({ status: 'applied' as const })) };
      }),
    },
  } as unknown as DocumentHandle;
}

const snapshot = (): FormSnapshot =>
  ({
    formKind: 'acroform',
    needsAppearances: false,
    calculationOrder: [],
    fields: [textField(7, 'First_Name')],
  }) as unknown as FormSnapshot;

describe('FormScriptingController — boot failures degrade, never brick', () => {
  it('a throwing boot script still lets the user commit (and again after)', async () => {
    const applied: FormEffect[][] = [];
    const controller = createFormScriptingController({
      doc: makeDoc(applied),
      document: () => null,
      config: { sandboxFactory: async () => failingBootSandbox() },
    });

    const first = await controller.commit(
      { kind: 'objectNumber', fieldObjectNumber: 7 },
      { type: 'text', value: 'HELLO' },
    );
    expect(first.status).toBe('applied');
    expect(applied[0]).toEqual([
      {
        kind: 'setValue',
        ref: { kind: 'objectNumber', fieldObjectNumber: 7 },
        value: { type: 'text', value: 'HELLO' },
      },
    ]);
    // The failure is SURFACED, not swallowed — and not fatal.
    expect(first.diagnostics.some((d) => d.code === 'script-error')).toBe(true);
    // The bogus doc-open alert is tagged as boot-phase (suppressible).
    expect(first.uiEffects).toEqual([expect.objectContaining({ kind: 'alert', phase: 'boot' })]);

    // Boot ran once; the next commit neither retries nor fails.
    const second = await controller.commit(
      { kind: 'objectNumber', fieldObjectNumber: 7 },
      { type: 'text', value: 'WORLD' },
    );
    expect(second.status).toBe('applied');
    expect(second.diagnostics.some((d) => d.code === 'script-error')).toBe(false);
    controller.dispose();
  });

  it('a failing doc.actions.read also degrades to a diagnostic', async () => {
    const applied: FormEffect[][] = [];
    const doc = makeDoc(applied);
    (doc.actions as { read: () => Promise<never> }).read = async () => {
      throw new Error('actions unavailable');
    };
    const controller = createFormScriptingController({
      doc,
      document: () => null,
      config: { sandboxFactory: async () => failingBootSandbox() },
    });
    const result = await controller.commit(
      { kind: 'objectNumber', fieldObjectNumber: 7 },
      { type: 'text', value: 'HELLO' },
    );
    expect(result.status).toBe('applied');
    expect(result.diagnostics.some((d) => d.code === 'script-error')).toBe(true);
    controller.dispose();
  });
});
