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

  protected plain(output: ScriptOutput): ScriptOutput {
    return JSON.parse(JSON.stringify(output));
  }
}

/** A sandbox whose every run reports a resource-budget fault. */
class BudgetFaultSandbox extends NodeSandbox {
  override run(source: string, input: ScriptInput): ScriptOutput {
    return {
      event: {
        rc: false,
        value: input.event.value ?? null,
        change: '',
        selStart: 0,
        selEnd: 0,
      },
      formEffects: [],
      uiEffects: [],
      diagnostics: [],
      error: { kind: 'budget', message: 'synthetic budget fault' },
    };
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

function harness(snapshot: FormSnapshot, sandbox: ScriptSandbox = new NodeSandbox()) {
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
  const doc = {
    id: 'form-doc',
    forms: { applyEffects },
    actions: { read: async () => ({ nameTreeScripts: [], openAction: null }) },
    security: { identity: { user_id: 'alex', display_name: 'Alex Morgan', group_id: 'EmbedPDF' } },
  } as unknown as DocumentHandle;
  const controller = createFormScriptingController({
    doc,
    document: documentMeta,
    config: {
      enabled: true,
      now: () => Date.UTC(2026, 6, 15, 9, 30, 0),
      utcOffsetMinutes: () => 180,
      randomSeed: () => 7,
    },
    sandboxFactory: vi.fn(async () => sandbox),
  });
  return { controller, batches, snapshot };
}

describe('script fault ladder', () => {
  it('a throwing keystroke script keeps the typed value and diagnoses', async () => {
    const snapshot: FormSnapshot = {
      formKind: 'acroform',
      needsAppearances: false,
      fields: [text(2, 'amount', '', { keystroke: action(`definitelyNotInstalled();`) })],
      calculationOrder: [],
    };
    const fx = harness(snapshot);

    const result = await fx.controller.commit(snapshot, ref(2), { type: 'text', value: '42' });

    expect(result.status).toBe('applied');
    expect(fx.batches[0]).toEqual([
      { kind: 'setValue', ref: ref(2), value: { type: 'text', value: '42' } },
    ]);
    expect(
      result.diagnostics.filter(
        ({ code, message }) => code === 'script-error' && message.includes('Keystroke'),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('AFNumber_Keystroke rejects a non-numeric commit through the two-pass pipeline', async () => {
    const snapshot: FormSnapshot = {
      formKind: 'acroform',
      needsAppearances: false,
      fields: [text(2, 'price', '', { keystroke: action(`AFNumber_Keystroke(2, 0, 0, 0, "", true);`) })],
      calculationOrder: [],
    };
    const fx = harness(snapshot);

    const rejected = await fx.controller.commit(snapshot, ref(2), { type: 'text', value: 'abc' });
    expect(rejected.status).toBe('rejected');
    expect(rejected.uiEffects).toContainEqual(
      expect.objectContaining({
        kind: 'alert',
        message: 'The value entered does not match the format of the field [ price ]',
        phase: 'user',
      }),
    );
    expect(fx.batches).toEqual([]);

    const accepted = await fx.controller.commit(snapshot, ref(2), {
      type: 'text',
      value: '1,234.56',
    });
    expect(accepted.status).toBe('applied');
    expect(fx.batches[0]).toEqual([
      { kind: 'setValue', ref: ref(2), value: { type: 'text', value: '1,234.56' } },
    ]);
  });

  it('a throwing validate script accepts the value instead of destroying it', async () => {
    const snapshot: FormSnapshot = {
      formKind: 'acroform',
      needsAppearances: false,
      fields: [text(2, 'qty', '', { validate: action(`explode();`) })],
      calculationOrder: [],
    };
    const fx = harness(snapshot);

    const result = await fx.controller.commit(snapshot, ref(2), { type: 'text', value: '7' });

    expect(result.status).toBe('applied');
    expect(fx.batches[0]).toEqual([
      { kind: 'setValue', ref: ref(2), value: { type: 'text', value: '7' } },
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'script-error' }),
    );
  });

  it('a throwing calculate skips that field while the /CO chain continues', async () => {
    const snapshot: FormSnapshot = {
      formKind: 'acroform',
      needsAppearances: false,
      fields: [
        text(2, 'amount', '3'),
        text(3, 'broken', 'stale', { calculate: action(`explode();`) }),
        text(4, 'total', '2', {
          calculate: action(`event.value = Number(getField('amount').value) * 2;`),
        }),
      ],
      calculationOrder: [ref(3), ref(4)],
    };
    const fx = harness(snapshot);

    const result = await fx.controller.commit(snapshot, ref(2), { type: 'text', value: '5' });

    expect(result.status).toBe('applied');
    expect(fx.batches[0]).toEqual([
      { kind: 'setValue', ref: ref(2), value: { type: 'text', value: '5' } },
      { kind: 'setValue', ref: ref(4), value: { type: 'text', value: '10' } },
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'script-error' }),
    );
  });

  it('a throwing format keeps the raw committed value', async () => {
    const snapshot: FormSnapshot = {
      formKind: 'acroform',
      needsAppearances: false,
      fields: [text(2, 'amount', '', { format: action(`kaboom();`) })],
      calculationOrder: [],
    };
    const fx = harness(snapshot);

    const result = await fx.controller.commit(snapshot, ref(2), { type: 'text', value: '7' });

    expect(result.status).toBe('applied');
    expect(fx.batches[0]).toEqual([
      { kind: 'setValue', ref: ref(2), value: { type: 'text', value: '7' } },
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'script-error' }),
    );
  });

  it('a resource-budget fault still fails the transaction', async () => {
    const snapshot: FormSnapshot = {
      formKind: 'acroform',
      needsAppearances: false,
      fields: [text(2, 'amount', '', { keystroke: action(`AFNumber_Keystroke(2, 0);`) })],
      calculationOrder: [],
    };
    const fx = harness(snapshot, new BudgetFaultSandbox());

    const result = await fx.controller.commit(snapshot, ref(2), { type: 'text', value: '5' });

    expect(result.status).toBe('failed');
    expect(result.error).toMatchObject({ kind: 'budget' });
    expect(fx.batches).toEqual([]);
  });
});
