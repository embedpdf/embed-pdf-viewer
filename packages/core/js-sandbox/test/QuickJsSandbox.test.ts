import { createContext, runInContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_SCRIPT_BUDGET,
  type AcroJsVmGlobal,
  type ScriptBudget,
  type ScriptInput,
  type ScriptOutput,
} from '@embedpdf/core-acrojs';
import { PRELUDE_SOURCE as builtPreludeSource } from '../../acrojs/dist/index.js';
import { createQuickJsSandbox, type ScriptSandbox } from '../src';

const ref = (name: string) => ({ kind: 'fqn' as const, name });

const input = (kind: ScriptInput['event']['kind'] = 'field-format'): ScriptInput => ({
  document: { id: 'doc-quickjs', fileName: 'proposal.pdf', pageCount: 2, pageNumber: 0 },
  identity: {
    name: 'Alex Morgan',
    loginName: 'alex',
    corporation: 'EmbedPDF',
    email: 'alex@example.com',
  },
  environment: {
    nowMs: Date.UTC(2026, 6, 15, 9, 30, 0),
    utcOffsetMinutes: 180,
    randomSeed: 7,
  },
  fields: [
    {
      ref: ref('dynamic-label'),
      name: 'dynamic-label',
      family: 'text',
      value: '',
      defaultValue: '',
      display: 'visible',
      readOnly: false,
      required: false,
    },
  ],
  event: { kind, target: ref('dynamic-label'), value: '' },
});

const budget = (overrides: Partial<ScriptBudget>): ScriptBudget => ({
  ...DEFAULT_SCRIPT_BUDGET,
  ...overrides,
});

function runInNode(source: string): ScriptOutput {
  const context = createContext({});
  runInContext(builtPreludeSource, context);
  const vm = context as unknown as AcroJsVmGlobal;
  return JSON.parse(JSON.stringify(vm.__acrojsRun(source, input())));
}

const sandboxes: ScriptSandbox[] = [];

async function sandbox(): Promise<ScriptSandbox> {
  const value = await createQuickJsSandbox({ preludeSource: builtPreludeSource });
  sandboxes.push(value);
  return value;
}

afterEach(() => {
  for (const value of sandboxes.splice(0)) value.dispose();
});

describe('QuickJsSandbox', () => {
  it('runs the built prelude with the same result as the Node reference realm', async () => {
    const source = `event.value = identity.name + ' • ' +
      util.printd('mmm d, yyyy', new Date()) + ' • ' + Math.random().toFixed(6);`;
    const vm = await sandbox();

    expect(vm.run(source, input())).toEqual(runInNode(source));
  });

  it('keeps name-tree functions and returns top-level boot effects', async () => {
    const vm = await sandbox();
    const boot = vm.boot(
      [
        `function stampLabel() { event.value = identity.corporation; }
         getField('dynamic-label').value = 'initialized';`,
      ],
      input('name-tree-boot'),
    );

    expect(boot.formEffects).toEqual([
      {
        kind: 'setValue',
        ref: ref('dynamic-label'),
        value: { type: 'text', value: 'initialized' },
      },
    ]);
    expect(vm.run(`stampLabel.call(this);`, input()).event.value).toBe('EmbedPDF');
  });

  it('does not expose browser or Node host capabilities', async () => {
    const vm = await sandbox();
    const out = vm.run(
      `event.value = typeof fetch + '/' + typeof XMLHttpRequest + '/' + typeof process;`,
      input(),
    );

    expect(out.event.value).toBe('undefined/undefined/undefined');
  });

  it('interrupts runaway code and never reuses the faulted runtime', async () => {
    const vm = await sandbox();
    const out = vm.run(`while (true) {}`, input(), budget({ maxExecutionMs: 10 }));

    expect(out.error?.kind).toBe('budget');
    expect(out.formEffects).toEqual([]);
    expect(vm.disposed).toBe(true);
    expect(() => vm.run(`event.value = 'again';`, input())).toThrow(/disposed/);
  });

  it('enforces memory and stack budgets as terminal faults', async () => {
    const memoryVm = await sandbox();
    const memoryOut = memoryVm.run(
      `var chunks = [];
       while (true) chunks.push(new Array(10000).fill('01234567890123456789'));`,
      input(),
      budget({ maxExecutionMs: 1000, maxMemoryBytes: 2 * 1024 * 1024 }),
    );
    expect(memoryOut.error?.kind).toBe('budget');
    expect(memoryVm.disposed).toBe(true);

    const stackVm = await sandbox();
    const stackOut = stackVm.run(
      `function recurse() { return recurse(); } recurse();`,
      input(),
      budget({ maxStackBytes: 32 * 1024 }),
    );
    expect(stackOut.error?.kind).toBe('budget');
    expect(stackVm.disposed).toBe(true);
  });

  it('rejects oversized output without returning partial effects', async () => {
    const vm = await sandbox();
    const out = vm.run(
      `event.value = new Array(10000).join('x');`,
      input(),
      budget({ maxOutputBytes: 512 }),
    );

    expect(out.error?.kind).toBe('budget');
    expect(out.formEffects).toEqual([]);
    expect(vm.disposed).toBe(true);
  });

  it('releases every QuickJS result handle across repeated runs', async () => {
    const vm = await sandbox();
    for (let index = 0; index < 200; index += 1) {
      expect(vm.run(`event.value = String(${index});`, input()).error).toBeUndefined();
    }

    expect(() => vm.dispose()).not.toThrow();
  });
});
