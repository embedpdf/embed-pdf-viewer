import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SCRIPT_SECURITY_POLICY,
  PRELUDE_SOURCE,
  SCRIPT_EVENT_MATRIX,
  javaScriptProgramFromActionTree,
  type AcroJsVmGlobal,
  type ScriptFieldInput,
  type ScriptInput,
  type ScriptOutput,
} from '../src';

const ref = (name: string) => ({ kind: 'fqn' as const, name });

const field = (
  name: string,
  value: string,
  overrides: Partial<ScriptFieldInput> = {},
): ScriptFieldInput => ({
  ref: ref(name),
  name,
  family: 'text',
  value,
  defaultValue: value,
  display: 'visible',
  readOnly: false,
  required: false,
  ...overrides,
});

const input = (fields: ScriptFieldInput[], event: ScriptInput['event']): ScriptInput => ({
  document: { id: 'doc-1', fileName: 'proposal.pdf', pageCount: 2, pageNumber: 0 },
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
  fields,
  event,
});

function createVm(): AcroJsVmGlobal {
  const context = createContext({});
  runInContext(PRELUDE_SOURCE, context);
  return context as unknown as AcroJsVmGlobal;
}

/** Strip the VM realm's prototypes; the contract itself is JSON-only. */
const plain = (output: ScriptOutput): ScriptOutput => JSON.parse(JSON.stringify(output));

describe('AcroJS prelude', () => {
  it('boots name-tree functions once and keeps them for later field events', () => {
    const vm = createVm();
    const fields = [field('price', '12'), field('quantity', '3'), field('total', '0')];

    const boot = plain(
      vm.__acrojsBoot(
        [
          `function recalc() {
             event.value = Number(this.getField('price').value) * Number(this.getField('quantity').value);
           }`,
        ],
        input(fields, { kind: 'name-tree-boot' }),
      ),
    );
    expect(boot.error).toBeUndefined();

    const out = plain(
      vm.__acrojsRun(
        'recalc.call(this);',
        input(fields, {
          kind: 'field-calculate',
          target: ref('total'),
          source: ref('quantity'),
          value: '0',
        }),
      ),
    );
    expect(out.formEffects).toEqual([
      { kind: 'setValue', ref: ref('total'), value: { type: 'text', value: '36' } },
    ]);
  });

  it('returns validation rejection and alerts without committing form effects', () => {
    const vm = createVm();
    const out = plain(
      vm.__acrojsRun(
        `if (event.value.indexOf('@') < 1) {
           app.alert('Please enter a valid email.', 1);
           event.rc = false;
         }`,
        input([field('email', '')], {
          kind: 'field-validate',
          target: ref('email'),
          value: 'invalid',
        }),
      ),
    );

    expect(out.event.rc).toBe(false);
    expect(out.formEffects).toEqual([]);
    expect(out.uiEffects).toEqual([
      { kind: 'alert', message: 'Please enter a valid email.', icon: 1 },
    ]);
  });

  it('uses only the injected identity, clock and timezone for dynamic text', () => {
    const vm = createVm();
    const out = plain(
      vm.__acrojsRun(
        `event.value = identity.name + ' • ' + util.printd('mmm d, yyyy HH:MM', new Date());`,
        input([field('label', '')], {
          kind: 'field-format',
          target: ref('label'),
          value: '',
        }),
      ),
    );

    expect(out.formEffects).toEqual([
      {
        kind: 'setAppearanceText',
        ref: ref('label'),
        text: 'Alex Morgan • Jul 15, 2026 12:30',
      },
    ]);
  });

  it('runs the dynamic scripts embedded in the approval-stamp fixture', () => {
    const vm = createVm();
    const scripts = [
      {
        source: `var v = '';
          try { v = identity.name || identity.loginName || ''; } catch (e) {}
          if (!v) v = 'Name not configured';
          event.value = v;`,
        expected: 'Alex Morgan',
      },
      {
        source: `var v = '';
          try { v = identity.corporation || ''; } catch (e) {}
          if (!v) v = 'Company not configured';
          event.value = v;`,
        expected: 'EmbedPDF',
      },
      {
        source: `event.value = util.printd('mmm d, yyyy', new Date());`,
        expected: 'Jul 15, 2026',
      },
      {
        source: `var v = '';
          try {
            if (event.source && event.source.source)
              v = event.source.source.documentFileName || '';
          } catch (e) {}
          if (!v) v = 'Document';
          event.value = v;`,
        expected: 'proposal.pdf',
      },
    ];

    for (const { source, expected } of scripts) {
      const out = plain(
        vm.__acrojsRun(
          source,
          input([field('dynamic-label', '')], {
            kind: 'field-format',
            target: ref('dynamic-label'),
            value: '',
          }),
        ),
      );

      expect(out.error).toBeUndefined();
      expect(out.event.value).toBe(expected);
      expect(out.formEffects).toEqual([
        { kind: 'setAppearanceText', ref: ref('dynamic-label'), text: expected },
      ]);
    }
  });

  it('derives reset, value and display effects from the final field overlay', () => {
    const vm = createVm();
    const fields = [field('name', 'changed', { defaultValue: 'default' }), field('total', '0')];
    const out = plain(
      vm.__acrojsRun(
        `this.resetForm(['name']);
         var total = this.getField('total');
         total.value = '42';
         total.display = display.hidden;`,
        input(fields, { kind: 'name-tree-boot' }),
      ),
    );

    expect(out.formEffects).toEqual([
      { kind: 'reset', refs: [ref('name')] },
      { kind: 'setValue', ref: ref('total'), value: { type: 'text', value: '42' } },
      { kind: 'setDisplay', ref: ref('total'), display: 'hidden' },
    ]);
  });

  it('restores an original non-default value after resetting the field', () => {
    const vm = createVm();
    const fields = [field('total', '$680.00', { defaultValue: '$0.00' })];
    const out = plain(
      vm.__acrojsRun(
        `this.resetForm(['total']);
         this.getField('total').value = '$680.00';`,
        input(fields, { kind: 'name-tree-boot' }),
      ),
    );

    expect(out.formEffects).toEqual([
      { kind: 'reset', refs: [ref('total')] },
      {
        kind: 'setValue',
        ref: ref('total'),
        value: { type: 'text', value: '$680.00' },
      },
    ]);
  });

  it('implements the common AFSimple_Calculate helper', () => {
    const vm = createVm();
    const fields = [field('a', '$10.50'), field('b', '2'), field('total', '0')];
    const out = plain(
      vm.__acrojsRun(
        `AFSimple_Calculate('SUM', ['a', 'b']);`,
        input(fields, {
          kind: 'field-calculate',
          target: ref('total'),
          value: '0',
        }),
      ),
    );

    expect(out.formEffects[0]).toEqual({
      kind: 'setValue',
      ref: ref('total'),
      value: { type: 'text', value: '12.5' },
    });
  });

  it('discards every staged effect when the script throws', () => {
    const vm = createVm();
    const out = plain(
      vm.__acrojsRun(
        `getField('name').value = 'landed?';
         app.alert('also discarded');
         throw new Error('boom');`,
        input([field('name', 'before')], { kind: 'name-tree-boot' }),
      ),
    );

    expect(out.error).toMatchObject({ kind: 'exception', message: 'boom' });
    expect(out.formEffects).toEqual([]);
    expect(out.uiEffects).toEqual([]);
  });

  it('keeps submitForm inert and reports the policy decision', () => {
    const vm = createVm();
    const out = plain(
      vm.__acrojsRun(
        `this.submitForm({ cURL: 'https://example.com/collect' });`,
        input([], { kind: 'name-tree-boot' }),
      ),
    );

    expect(out.formEffects).toEqual([]);
    expect(out.diagnostics).toEqual([
      { code: 'blocked-network', message: 'submitForm is blocked by the scripting policy' },
    ]);
  });

  it('rejects an output that exceeds the effect budget', () => {
    const vm = createVm();
    const out = plain(
      vm.__acrojsRun(
        `getField('a').value = '1'; getField('b').value = '2';`,
        input([field('a', '0'), field('b', '0')], { kind: 'name-tree-boot' }),
        { maxEffects: 1 },
      ),
    );

    expect(out.error).toMatchObject({ kind: 'budget' });
    expect(out.formEffects).toEqual([]);
  });

  it('ships conservative defaults and the explicit V1 event matrix', () => {
    expect(DEFAULT_SCRIPT_SECURITY_POLICY.enabled).toBe(false);
    expect(DEFAULT_SCRIPT_SECURITY_POLICY.submitForm).toBe('blocked');
    expect(DEFAULT_SCRIPT_SECURITY_POLICY.executionOwner).toBe('originating-client-only');
    expect(SCRIPT_EVENT_MATRIX.field.calculate).toBe('execute-in-calculation-order');
    expect(SCRIPT_EVENT_MATRIX.annotation.widgetActivate).toBe('execute-on-originating-client');
    expect(SCRIPT_EVENT_MATRIX.annotation.other).toBe('preserve-only');
    expect(SCRIPT_EVENT_MATRIX.openAction).toBe('preserve-only');
  });

  it('linearizes complete /Next action trees without executing non-JavaScript nodes', () => {
    expect(
      javaScriptProgramFromActionTree({
        root: {
          type: 'javascript',
          subtype: 'JavaScript',
          script: 'root();',
          next: [
            { type: 'uri', subtype: 'URI', uri: 'https://example.test/', isMap: false, next: [] },
            {
              type: 'javascript',
              subtype: 'JavaScript',
              script: 'next();',
              next: [],
            },
          ],
        },
        incomplete: false,
        warningFlags: 0,
        warnings: [],
      }),
    ).toBe('root();\n;\nnext();');

    expect(() =>
      javaScriptProgramFromActionTree({
        root: null,
        incomplete: true,
        warningFlags: 4,
        warnings: ['incomplete'],
      }),
    ).toThrow(/incomplete/);
  });
});
