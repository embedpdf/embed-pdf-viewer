import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentMeta } from '@embedpdf/core';
import {
  PRELUDE_SOURCE,
  type AcroJsVmGlobal,
  type ScriptBudget,
  type ScriptInput,
  type ScriptOutput,
} from '@embedpdf/core-acrojs';
import type { ScriptSandbox } from '@embedpdf/core-js-sandbox';
import type {
  DocumentHandle,
  FormEffect,
  FormFieldDTO,
  FormSnapshot,
  PdfActionTree,
} from '@embedpdf/engine-core/runtime';

import { createSerialMutationQueue } from '../src/mutationQueue';
import { createFormScriptingController } from '../src/scripting';

const ref = (fieldObjectNumber: number) => ({ kind: 'objectNumber' as const, fieldObjectNumber });

const action = (script: string): PdfActionTree => ({
  root: { type: 'javascript', subtype: 'JavaScript', script, next: [] },
  incomplete: false,
  warningFlags: 0,
  warnings: [],
});

const text = (
  fieldObjectNumber: number,
  name: string,
  value: string,
  actions?: FormFieldDTO['actions'],
): FormFieldDTO => ({
  ref: ref(fieldObjectNumber),
  fieldObjectNumber,
  name,
  family: 'text',
  origin: 'acroform',
  flags: { readOnly: false, required: false, noExport: false, raw: 0 },
  alternateName: null,
  mappingName: null,
  valueEntry: { kind: 'scalar', value },
  defaultValueEntry: { kind: 'scalar', value: '' },
  value,
  defaultValue: '',
  maxLength: null,
  multiline: false,
  password: false,
  comb: false,
  widgets: [{ annotObjectNumber: fieldObjectNumber, pageObjectNumber: 10 }],
  ...(actions ? { actions } : {}),
});

const pushbutton = (fieldObjectNumber: number, name: string): FormFieldDTO => ({
  ref: ref(fieldObjectNumber),
  fieldObjectNumber,
  name,
  family: 'pushbutton',
  origin: 'acroform',
  flags: { readOnly: false, required: false, noExport: false, raw: 0 },
  alternateName: null,
  mappingName: null,
  valueEntry: { kind: 'none' },
  defaultValueEntry: { kind: 'none' },
  widgets: [{ annotObjectNumber: fieldObjectNumber, pageObjectNumber: 10 }],
});

class NodeSandbox implements ScriptSandbox {
  private readonly vm: AcroJsVmGlobal;
  disposed = false;

  constructor() {
    const context = createContext({});
    runInContext(PRELUDE_SOURCE, context);
    this.vm = context as unknown as AcroJsVmGlobal;
  }

  boot(sources: string[], input: ScriptInput, budget?: ScriptBudget): ScriptOutput {
    return this.plain(this.vm.__acrojsBoot(sources, input, budget));
  }

  run(source: string, input: ScriptInput, budget?: ScriptBudget): ScriptOutput {
    return this.plain(this.vm.__acrojsRun(source, input, budget));
  }

  dispose(): void {
    this.disposed = true;
  }

  private plain(output: ScriptOutput): ScriptOutput {
    return JSON.parse(JSON.stringify(output));
  }
}

const documentMeta = (): DocumentMeta =>
  ({
    id: 'form-doc',
    name: 'proposal.pdf',
    pageCount: 1,
    pages: [{ pageObjectNumber: 10 }],
    revision: 0,
  }) as DocumentMeta;

function harness(snapshot: FormSnapshot, nameTreeScript?: string) {
  const batches: FormEffect[][] = [];
  const applyEffects = vi.fn(async (effects: FormEffect[]) => {
    batches.push(effects);
    return {
      results: effects.map((_, index) => ({
        index,
        status: 'applied' as const,
        fields: [],
        changedWidgets: [],
      })),
      changedWidgets: [],
      meta: {} as never,
    };
  });
  const readActions = vi.fn(async () => ({
    nameTreeScripts: nameTreeScript ? [{ name: 'library', action: action(nameTreeScript) }] : [],
    openAction: null,
  }));
  const doc = {
    id: 'form-doc',
    forms: { list: async () => snapshot, applyEffects },
    actions: { read: readActions },
    security: {
      identity: { user_id: 'alex', display_name: 'Alex Morgan', group_id: 'EmbedPDF' },
    },
  } as unknown as DocumentHandle;
  const sandbox = new NodeSandbox();
  const factory = vi.fn(async () => sandbox);
  const controller = createFormScriptingController({
    doc,
    document: documentMeta,
    config: {
      now: () => Date.UTC(2026, 6, 15, 9, 30, 0),
      utcOffsetMinutes: () => 180,
      randomSeed: () => 7,
      sandboxFactory: factory,
    },
  });
  return { controller, batches, applyEffects, readActions, factory, sandbox, snapshot };
}

describe('form scripting transaction', () => {
  it('boots once, validates, calculates through the overlay, formats, and applies one batch', async () => {
    const snapshot: FormSnapshot = {
      formKind: 'acroform',
      needsAppearances: false,
      fields: [
        text(1, 'status', ''),
        text(2, 'amount', '1', {
          validate: action(`if (Number(event.value) < 0) event.rc = false;`),
        }),
        text(3, 'total', '2', {
          calculate: action(`event.value = Number(getField('amount').value) * 2;`),
          format: action(`event.value = '$' + event.value;`),
        }),
      ],
      calculationOrder: [ref(3)],
    };
    const fx = harness(snapshot, `getField('status').value = 'initialized';`);

    const result = await fx.controller.commit(ref(2), { type: 'text', value: '3' });

    expect(result.status).toBe('applied');
    expect(fx.readActions).toHaveBeenCalledTimes(1);
    expect(fx.factory).toHaveBeenCalledTimes(1);
    expect(fx.batches).toEqual([
      [
        { kind: 'setValue', ref: ref(1), value: { type: 'text', value: 'initialized' } },
        { kind: 'setValue', ref: ref(2), value: { type: 'text', value: '3' } },
        { kind: 'setValue', ref: ref(3), value: { type: 'text', value: '6' } },
        { kind: 'setAppearanceText', ref: ref(3), text: '$6' },
      ],
    ]);
  });

  it('surfaces validation rejection without sending the proposed value', async () => {
    const snapshot: FormSnapshot = {
      formKind: 'acroform',
      needsAppearances: false,
      fields: [
        text(2, 'email', '', {
          validate: action(
            `if (event.value.indexOf('@') < 1) { app.alert('Invalid email'); event.rc = false; }`,
          ),
        }),
      ],
      calculationOrder: [],
    };
    const fx = harness(snapshot);

    const result = await fx.controller.commit(ref(2), {
      type: 'text',
      value: 'invalid',
    });

    expect(result.status).toBe('rejected');
    expect(result.uiEffects).toEqual([
      { kind: 'alert', message: 'Invalid email', icon: 0, phase: 'user' },
    ]);
    expect(fx.applyEffects).not.toHaveBeenCalled();
  });

  it('uses a keystroke script to transform a full replacement commit', async () => {
    const snapshot: FormSnapshot = {
      formKind: 'acroform',
      needsAppearances: false,
      fields: [
        text(2, 'code', 'old', {
          keystroke: action(`event.change = event.change.toUpperCase();`),
        }),
      ],
      calculationOrder: [],
    };
    const fx = harness(snapshot);

    await fx.controller.commit(ref(2), { type: 'text', value: 'abc' });

    expect(fx.batches[0]).toEqual([
      { kind: 'setValue', ref: ref(2), value: { type: 'text', value: 'ABC' } },
    ]);
  });

  it('executes widget activation in the same isolated transaction and surfaces UI effects', async () => {
    const snapshot: FormSnapshot = {
      formKind: 'acroform',
      needsAppearances: false,
      fields: [text(1, 'status', ''), pushbutton(2, 'summary')],
      calculationOrder: [],
    };
    const fx = harness(snapshot);

    const result = await fx.controller.activate(ref(2),
      action(`
        getField('status').value = event.name + ':' + event.type;
        app.alert('Summary ready');
        this.pageNum = 1;
      `),
    );

    expect(result.status).toBe('applied');
    expect(result.uiEffects).toEqual([
      { kind: 'alert', message: 'Summary ready', icon: 0, phase: 'user' },
      { kind: 'gotoPage', page: 1, phase: 'user' },
    ]);
    expect(fx.batches).toEqual([
      [
        {
          kind: 'setValue',
          ref: ref(1),
          value: { type: 'text', value: 'Mouse Up:Field' },
        },
      ],
    ]);
  });

  it('DEGRADES a name-tree boot exception — the user still fills (never bricks)', async () => {
    // The i-140 class of bug: Adobe's `!ADBE::…VersChk…` boilerplate throwing
    // (an API we don't emulate) used to poison every commit. The invariant
    // now: a boot failure is a `script-error` DIAGNOSTIC; the user's own
    // value still commits, on this transaction and every later one.
    const snapshot: FormSnapshot = {
      formKind: 'acroform',
      needsAppearances: false,
      fields: [text(2, 'value', '')],
      calculationOrder: [],
    };
    const fx = harness(snapshot, `throw new Error('boot failed');`);

    const first = await fx.controller.commit(ref(2), { type: 'text', value: 'a' });
    const second = await fx.controller.commit(ref(2), { type: 'text', value: 'b' });

    expect(first.status).toBe('applied');
    expect(first.error).toBeUndefined();
    expect(
      first.diagnostics.some((d) => d.code === 'script-error' && d.message.includes('boot failed')),
    ).toBe(true);
    expect(second.status).toBe('applied');
    expect(second.diagnostics.some((d) => d.code === 'script-error')).toBe(false);
    expect(fx.readActions).toHaveBeenCalledTimes(1); // boot never retried
    expect(fx.applyEffects).toHaveBeenCalledTimes(2); // both user values landed
  });
});

describe('form mutation queue', () => {
  it('serializes overlapping operations and continues after a rejection', async () => {
    const enqueue = createSerialMutationQueue();
    const order: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = enqueue(async () => {
      order.push('first:start');
      await held;
      order.push('first:end');
      throw new Error('expected');
    });
    const second = enqueue(async () => {
      order.push('second');
      return 2;
    });
    await Promise.resolve();
    expect(order).toEqual(['first:start']);
    release();

    await expect(first).rejects.toThrow('expected');
    await expect(second).resolves.toBe(2);
    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });
});
