import { describe, expect, it } from 'vitest';

import type { FormFieldDTO } from '@embedpdf/engine-core/runtime';
import type { ActionDiagnostic, SubmitIntent } from '@embedpdf/plugin-actions/contract';

import { buildSubmitEntries, resolveFieldSelection } from '../src/field-selection';

/** Minimal field factory — only what selection + entry building touch. */
const field = (
  name: string,
  overrides: Partial<{
    family: string;
    noExport: boolean;
    valueEntry: FormFieldDTO['valueEntry'];
    fieldObjectNumber: number;
  }> = {},
): FormFieldDTO =>
  ({
    ref: { kind: 'objectNumber', fieldObjectNumber: overrides.fieldObjectNumber ?? 0 },
    fieldObjectNumber: overrides.fieldObjectNumber ?? 0,
    name,
    family: overrides.family ?? 'text',
    origin: 'acroform',
    flags: { readOnly: false, required: false, noExport: overrides.noExport ?? false, raw: 0 },
    alternateName: null,
    mappingName: null,
    valueEntry: overrides.valueEntry ?? { kind: 'scalar', value: `${name}-value` },
    defaultValueEntry: { kind: 'none' },
    widgets: [],
  }) as unknown as FormFieldDTO;

const intent = (overrides: Partial<SubmitIntent> = {}): SubmitIntent => ({
  url: 'https://home.test/x',
  fields: null,
  exclude: false,
  includeNoValueFields: false,
  format: 'fdf',
  method: 'post',
  flagsRaw: 0,
  ...overrides,
});

describe('resolveFieldSelection — the shared ISO selection (Tables 239-242)', () => {
  const all = [
    field('parent.c1'),
    field('parent.c2'),
    field('parentheses'), // the dot-prefix guard: NOT a descendant of `parent`
    field('other'),
    field('byNumber', { fieldObjectNumber: 42 }),
  ];

  it('a parent NAME selects its descendants (the exact-match bug, fixed)', () => {
    const { selected } = resolveFieldSelection(all, [{ kind: 'name', name: 'parent' }], false);
    expect(selected.map((f) => f.name)).toEqual(['parent.c1', 'parent.c2']);
  });

  it('exclude mode removes the same subtree', () => {
    const { selected } = resolveFieldSelection(all, [{ kind: 'name', name: 'parent' }], true);
    expect(selected.map((f) => f.name)).toEqual(['parentheses', 'other', 'byNumber']);
  });

  it('objectNumber targets select the field dictionary', () => {
    const { selected } = resolveFieldSelection(all, [{ kind: 'objectNumber', objectNumber: 42 }], false);
    expect(selected.map((f) => f.name)).toEqual(['byNumber']);
  });

  it('null = key absent = everything, flag ignored; [] include = NOTHING; [] exclude = everything', () => {
    expect(resolveFieldSelection(all, null, true).selected).toHaveLength(all.length);
    expect(resolveFieldSelection(all, [], false).selected).toHaveLength(0);
    expect(resolveFieldSelection(all, [], true).selected).toHaveLength(all.length);
  });
});

describe('buildSubmitEntries — the ISO dataset matrix', () => {
  const diagnostics = (): { list: ActionDiagnostic[]; diagnose: (d: ActionDiagnostic) => void } => {
    const list: ActionDiagnostic[] = [];
    return { list, diagnose: (d) => list.push(d) };
  };

  it('fields-absent submits everything eligible: NoExport and push-buttons SILENTLY out', () => {
    const { list, diagnose } = diagnostics();
    const entries = buildSubmitEntries(
      [
        field('plain'),
        field('secret', { noExport: true }),
        field('button', { family: 'pushbutton' }),
        field('sig', { family: 'signature' }),
      ],
      intent(),
      diagnose,
    );
    expect(entries).toEqual([{ name: 'plain', value: 'plain-value' }]);
    // Implicit sweeps are the ISO default — no diagnostic noise.
    expect(list).toEqual([]);
  });

  it('the NoExport veto beats an EXPLICIT include — and is diagnosed there', () => {
    const { list, diagnose } = diagnostics();
    const entries = buildSubmitEntries(
      [field('secret', { noExport: true }), field('plain')],
      intent({ fields: [{ kind: 'name', name: 'secret' }, { kind: 'name', name: 'plain' }] }),
      diagnose,
    );
    expect(entries).toEqual([{ name: 'plain', value: 'plain-value' }]);
    expect(list.some((d) => d.code === 'submit-entry-unsupported' && /NoExport/.test(d.message))).toBe(
      true,
    );
  });

  it('an explicitly listed push-button is DIAGNOSED, never silent', () => {
    const { list, diagnose } = diagnostics();
    const entries = buildSubmitEntries(
      [field('button', { family: 'pushbutton' })],
      intent({ fields: [{ kind: 'name', name: 'button' }] }),
      diagnose,
    );
    expect(entries).toEqual([]);
    expect(list.some((d) => d.code === 'submit-entry-unsupported')).toBe(true);
  });

  it('an unsupported /V shape is ALWAYS diagnosed (silent omission = data loss)', () => {
    const { list, diagnose } = diagnostics();
    const entries = buildSubmitEntries(
      [field('weird', { valueEntry: { kind: 'unsupported' } }), field('plain')],
      intent(),
      diagnose,
    );
    expect(entries).toEqual([{ name: 'plain', value: 'plain-value' }]);
    expect(list.some((d) => d.code === 'submit-entry-unsupported')).toBe(true);
  });

  it('IncludeNoValueFields turns valueless fields into name-only entries', () => {
    const { diagnose } = diagnostics();
    const valueless = field('empty', { valueEntry: { kind: 'none' } });
    expect(buildSubmitEntries([valueless], intent(), diagnose)).toEqual([]);
    expect(
      buildSubmitEntries([valueless], intent({ includeNoValueFields: true }), diagnose),
    ).toEqual([{ name: 'empty', value: null }]);
  });

  it('descendants ride an included parent; multi-select list boxes keep array values', () => {
    const { diagnose } = diagnostics();
    const entries = buildSubmitEntries(
      [
        field('parent.c1'),
        field('parent.c2', { valueEntry: { kind: 'array', values: ['a', 'b'] } }),
        field('other'),
      ],
      intent({ fields: [{ kind: 'name', name: 'parent' }] }),
      diagnose,
    );
    expect(entries).toEqual([
      { name: 'parent.c1', value: 'parent.c1-value' },
      { name: 'parent.c2', value: ['a', 'b'] },
    ]);
  });
});
