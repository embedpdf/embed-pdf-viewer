/**
 * The field tools as a table: the built-in ones, what the `tools` setting makes of them, and
 * what a tool with a purpose or a format places. Every tool that was there before places what
 * it placed.
 */
import type { PageRef } from '@embedpdf/engine-core/runtime';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { FORM_TOOL_BY_ID, FORM_TOOLS, resolveFormTools } from '../src/tools/definitions';
import { toolDraft } from '../src/tools/handlers';

const PAGE: PageRef = toPageRef(3);
const WIDGET = { page: PAGE, rect: { x: 10, y: 10, width: 160, height: 24 } };

describe('the field tools', () => {
  it('keeps the seven tools it had, adds one per kind of value and two image tools', () => {
    expect(FORM_TOOLS.map((tool) => tool.id)).toEqual([
      'form-text',
      'form-checkbox',
      'form-radio',
      'form-combobox',
      'form-listbox',
      'form-button',
      'form-signature',
      'form-initials',
      'form-image',
      'form-name',
      'form-email',
      'form-organization',
      'form-organization-title',
      'form-date-signed',
    ]);
    // The first six say nothing about what their fields start with; the signature tool's
    // fields say what they're for.
    for (const tool of FORM_TOOLS.slice(0, 6)) expect(tool).not.toHaveProperty('field');
    expect(toolDraft(FORM_TOOL_BY_ID.get('form-text')!, 'text_1', WIDGET)).toEqual({
      kind: 'text',
      name: 'text_1',
      widgets: [WIDGET],
    });
    expect(toolDraft(FORM_TOOL_BY_ID.get('form-signature')!, 'signature_1', WIDGET)).toEqual({
      kind: 'signature',
      name: 'signature_1',
      widgets: [WIDGET],
      purpose: 'signature',
    });
  });

  it('places an image field: a push button whose box shows its image alone, with no caption', () => {
    const initials = FORM_TOOL_BY_ID.get('form-initials')!;
    const image = FORM_TOOL_BY_ID.get('form-image')!;
    expect(initials).toMatchObject({
      fieldKind: 'pushbutton',
      clickCreate: { width: 72, height: 36 },
      defaults: { layout: 'image' },
      field: { purpose: 'initials' },
    });
    expect(image).toMatchObject({
      fieldKind: 'pushbutton',
      clickCreate: { width: 120, height: 90 },
      defaults: { layout: 'image' },
    });
    expect(image).not.toHaveProperty('field');
    const placed = { ...WIDGET, layout: 'image' as const };
    expect(toolDraft(initials, 'pushbutton_1', placed)).toEqual({
      kind: 'pushbutton',
      name: 'pushbutton_1',
      widgets: [placed],
      purpose: 'initials',
    });
    // A button that isn't an image field keeps its caption.
    expect(toolDraft(FORM_TOOL_BY_ID.get('form-button')!, 'pushbutton_2', WIDGET)).toEqual({
      kind: 'pushbutton',
      name: 'pushbutton_2',
      widgets: [{ ...WIDGET, caption: 'Button' }],
    });
  });

  it('a value tool is the text tool with a purpose: the same size, look and kind', () => {
    const text = FORM_TOOL_BY_ID.get('form-text')!;
    for (const purpose of ['name', 'email', 'organization', 'organization-title']) {
      const tool = FORM_TOOL_BY_ID.get(`form-${purpose}`)!;
      expect(tool).toEqual({ ...text, id: `form-${purpose}`, field: { purpose } });
      const buyer = { kind: 'group', groupId: 'buyer' } as const;
      expect(toolDraft(tool, 'text_1', WIDGET, buyer)).toEqual({
        kind: 'text',
        name: 'text_1',
        widgets: [WIDGET],
        purpose,
        groupId: 'buyer',
      });
    }
    expect(toolDraft(FORM_TOOL_BY_ID.get('form-date-signed')!, 'text_1', WIDGET)).toEqual({
      kind: 'text',
      name: 'text_1',
      widgets: [WIDGET],
      purpose: 'date-signed',
      format: { kind: 'date', pattern: 'yyyy-mm-dd' },
      readOnly: true,
    });
    expect(FORM_TOOL_BY_ID.get('form-date-signed')!.clickCreate).toEqual({
      width: 100,
      height: 24,
    });
  });

  it('with no entries the document’s tools are the built-in ones, the same objects', () => {
    const tools = resolveFormTools();
    expect([...tools.keys()]).toEqual(FORM_TOOLS.map((tool) => tool.id));
    for (const tool of FORM_TOOLS) expect(tools.get(tool.id)).toBe(tool);
  });

  it('an entry with `extends` adds a tool, and one without changes the tool that has its id', () => {
    const tools = resolveFormTools([
      {
        id: 'form-company-number',
        extends: 'form-text',
        field: { purpose: 'company-number', required: true },
        defaults: { color: '#1d4ed8' },
      },
      // A tool listed before it: it starts from the app's own.
      { id: 'form-vat', extends: 'form-company-number', field: { purpose: 'vat' } },
      { id: 'form-date-signed', field: { format: { kind: 'date', pattern: 'dd/mm/yyyy' } } },
      { id: 'form-checkbox', clickCreate: { width: 14, height: 14 } },
    ]);
    const text = FORM_TOOL_BY_ID.get('form-text')!;
    expect(tools.get('form-company-number')).toEqual({
      ...text,
      id: 'form-company-number',
      defaults: { ...text.defaults, color: '#1d4ed8' },
      field: { purpose: 'company-number', required: true },
    });
    // What an entry gives goes over what the tool had, member by member.
    expect(tools.get('form-vat')!.field).toEqual({ purpose: 'vat', required: true });
    expect(tools.get('form-vat')!.defaults.color).toBe('#1d4ed8');
    expect(tools.get('form-date-signed')!.field).toEqual({
      purpose: 'date-signed',
      format: { kind: 'date', pattern: 'dd/mm/yyyy' },
      readOnly: true,
    });
    expect(tools.get('form-checkbox')!.clickCreate).toEqual({ width: 14, height: 14 });
    // The built-in table is not written to, and the tools nobody named are the same objects.
    expect(FORM_TOOL_BY_ID.get('form-checkbox')!.clickCreate).toEqual({ width: 18, height: 18 });
    expect(tools.get('form-text')).toBe(text);
    expect([...tools.keys()].slice(-2)).toEqual(['form-company-number', 'form-vat']);
  });

  it('refuses an entry that names no tool, and a field no field of its kind can have', () => {
    expect(() => resolveFormTools([{ id: 'form-mine' }])).toThrowError(
      /'form-mine' is not a field tool: give it `extends`/,
    );
    expect(() => resolveFormTools([{ id: 'form-mine', extends: 'form-nothing' }])).toThrowError(
      /extends 'form-nothing', which isn't a field tool listed before it/,
    );
    expect(() =>
      resolveFormTools([
        { id: 'form-first', extends: 'form-second' },
        { id: 'form-second', extends: 'form-text' },
      ]),
    ).toThrowError(/'form-first' extends 'form-second'/);
    // `extends` adds a tool: under the id of a tool there is, it would replace that one unasked.
    expect(() => resolveFormTools([{ id: 'form-text', extends: 'form-checkbox' }])).toThrowError(
      /'form-text' extends 'form-checkbox', but 'form-text' is a field tool already: leave `extends` out to change it/,
    );
    expect(() =>
      resolveFormTools([
        { id: 'form-mine', extends: 'form-text' },
        { id: 'form-mine', extends: 'form-text', field: { purpose: 'mine' } },
      ]),
    ).toThrowError(/'form-mine' is a field tool already/);
    expect(() => resolveFormTools([{ id: 'form-name', extends: 'form-name' }])).toThrowError(
      /'form-name' is a field tool already/,
    );
    expect(() =>
      resolveFormTools([
        {
          id: 'form-tick-date',
          extends: 'form-checkbox',
          field: { format: { kind: 'date', pattern: 'dd/mm/yyyy' } } as never,
        },
      ]),
    ).toThrowError(/tool 'form-tick-date': 'format' does not apply to a checkbox field/);
    expect(() =>
      resolveFormTools([
        {
          id: 'form-bad-date',
          extends: 'form-text',
          field: { format: { kind: 'date', pattern: 'yyyymmdd' } },
        },
      ]),
    ).toThrowError(/tool 'form-bad-date':/);
    expect(() =>
      resolveFormTools([{ id: 'form-padded', extends: 'form-text', field: { purpose: ' x ' } }]),
    ).toThrowError(/tool 'form-padded': a field's purpose is 1 to 256 characters/);
  });
});
