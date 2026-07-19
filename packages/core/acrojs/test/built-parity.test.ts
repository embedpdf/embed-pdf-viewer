import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

import { PRELUDE_SOURCE as builtPreludeSource } from '../dist/index.js';
import { PRELUDE_SOURCE as sourcePreludeSource } from '../src';
import type { AcroJsVmGlobal, ScriptInput, ScriptOutput } from '../src';

const scriptInput: ScriptInput = {
  document: { id: 'doc-parity', fileName: 'parity.pdf', pageCount: 1, pageNumber: 0 },
  identity: {
    name: 'Parity User',
    loginName: 'parity',
    corporation: 'EmbedPDF',
    email: 'parity@example.com',
  },
  environment: {
    nowMs: Date.UTC(2026, 6, 15, 9, 30, 0),
    utcOffsetMinutes: 180,
    randomSeed: 17,
  },
  fields: [
    {
      ref: { kind: 'fqn', name: 'label' },
      name: 'label',
      family: 'text',
      value: '',
      defaultValue: '',
      display: 'visible',
      readOnly: false,
      required: false,
    },
  ],
  event: {
    kind: 'field-format',
    target: { kind: 'fqn', name: 'label' },
    value: '',
  },
};

function run(prelude: string): ScriptOutput {
  const context = createContext({});
  runInContext(prelude, context);
  const vm = context as unknown as AcroJsVmGlobal;
  return JSON.parse(
    JSON.stringify(
      vm.__acrojsRun(
        `event.value = identity.name + ' • ' + util.printd('mmm d, yyyy', new Date());`,
        scriptInput,
      ),
    ),
  );
}

describe('published prelude artifact', () => {
  it('has the same observable contract as the source prelude', () => {
    expect(run(builtPreludeSource)).toEqual(run(sourcePreludeSource));
  });
});
