import { describe, expect, it } from 'vitest';

import { buildToolRegistry, type AnnotationToolInput } from '../../src/tools/definitions';

const invalidCircleDefaults: AnnotationToolInput = {
  id: 'invalid-circle',
  subtype: 'circle',
  // @ts-expect-error line endings are not an authoring default for circles
  defaults: { lineEndings: { end: 'open-arrow' } },
};

describe('annotation tool registry', () => {
  it('declares Replace Text as a strikeout-backed text-edit recipe', () => {
    const tool = buildToolRegistry().get('replace-text');
    expect(tool).toMatchObject({
      id: 'replace-text',
      subtype: 'strikeout',
      preset: 'replace-text',
      fieldsKind: 'strikeout',
      selection: { kind: 'text-edit', operation: 'replace' },
      defaults: { color: '#ef4444' },
    });
  });

  it('inherits the selection recipe when an embedder extends Replace Text', () => {
    const tool = buildToolRegistry([{ id: 'legal-replace', extends: 'replace-text' }]).get(
      'legal-replace',
    );
    expect(tool?.selection).toEqual({ kind: 'text-edit', operation: 'replace' });
    expect(tool?.subtype).toBe('strikeout');
  });

  it('declares Ink Highlight as an explicit Ink preset and inherits stroke grouping', () => {
    const tool = buildToolRegistry().get('ink-highlight');
    expect(tool).toMatchObject({
      subtype: 'ink',
      defaults: {
        intent: 'ink-highlight',
        color: '#ffcd45',
        strokeWidth: 14,
        blendMode: 'multiply',
      },
      ink: {
        groupStrokesMs: 800,
        straighten: { deviationThreshold: 0.15, axisSnapDegrees: 15 },
      },
    });
  });

  it('gives the note and attachment tools a plain plus: their ghost is the icon', () => {
    const tools = buildToolRegistry();
    for (const id of ['note', 'attachment']) {
      expect(tools.get(id)).toMatchObject({ cursor: 'crosshair', ghost: { opacity: 0.5 } });
    }
  });

  it('resolves `ghost`: true is half see-through, an opacity is kept, and extends inherit it', () => {
    const tools = buildToolRegistry([
      { id: 'square', ghost: true },
      { id: 'note', ghost: { opacity: 0.3 } },
      { id: 'todo', extends: 'note' },
      { id: 'quiet-note', extends: 'note', ghost: false },
    ]);
    expect(tools.get('square')?.ghost).toEqual({ opacity: 0.5 });
    expect(tools.get('circle')?.ghost).toBe(false); // drag-first: off unless asked
    expect(tools.get('note')?.ghost).toEqual({ opacity: 0.3 });
    expect(tools.get('todo')?.ghost).toEqual({ opacity: 0.3 });
    expect(tools.get('quiet-note')?.ghost).toBe(false);
  });

  it('keeps `meta` as your own data: only the calibrate tool, and tools extending it, capture', () => {
    const tools = buildToolRegistry([
      { id: 'labelled', extends: 'line', meta: { label: 'Line', capture: true } },
      { id: 'my-calibrate', extends: 'calibrate' },
    ]);
    expect(tools.get('labelled')).toMatchObject({
      capture: false,
      meta: { label: 'Line', capture: true },
    });
    expect(tools.get('calibrate')?.capture).toBe(true);
    expect(tools.get('calibrate')?.meta).toBeUndefined();
    expect(tools.get('my-calibrate')?.capture).toBe(true);
    expect(tools.get('line')?.capture).toBe(false);
  });

  it('changes only the built-in a change names, never the built-ins made from it', () => {
    const tools = buildToolRegistry([
      { id: 'ink', defaults: { opacity: 0.5 }, meta: { label: 'Blue pen' } },
      { id: 'line', defaults: { color: '#0000ff' }, cursor: 'pen' },
      { id: 'polygon', defaults: { interiorColor: '#ffff00' } },
      { id: 'polyline', defaults: { color: '#00ff00' } },
    ]);
    expect(tools.get('ink')).toMatchObject({
      defaults: { opacity: 0.5 },
      meta: { label: 'Blue pen' },
    });
    expect(tools.get('ink-highlight')?.defaults?.opacity).toBeUndefined();
    expect(tools.get('ink-highlight')?.meta).toBeUndefined();
    expect(tools.get('line')).toMatchObject({ defaults: { color: '#0000ff' }, cursor: 'pen' });
    for (const id of ['distance', 'calibrate']) {
      expect(tools.get(id)).toMatchObject({ defaults: { color: '#e5484d' }, cursor: 'crosshair' });
    }
    expect(tools.get('area')?.defaults?.interiorColor).toBeUndefined();
    expect(tools.get('perimeter')?.defaults?.color).toBe('#e5484d');
  });

  it('`extends` copies the tool as the entries before it left it, except its `meta`', () => {
    const tools = buildToolRegistry([
      {
        id: 'ink',
        defaults: { strokeWidth: 3 },
        ink: { groupStrokesMs: 0 },
        meta: { label: 'Pen' },
      },
      { id: 'thick-pen', extends: 'ink', defaults: { strokeWidth: 10 } },
    ]);
    expect(tools.get('thick-pen')).toMatchObject({
      subtype: 'ink',
      defaults: { color: '#ef4444', strokeWidth: 10 },
      ink: { groupStrokesMs: 0 },
    });
    expect(tools.get('thick-pen')?.meta).toBeUndefined();
  });

  it('a change written after a tool was copied does not reach the copy', () => {
    const tools = buildToolRegistry([
      { id: 'red-pen', extends: 'ink', defaults: { color: '#ff0000' } },
      { id: 'ink', defaults: { strokeWidth: 2 } },
    ]);
    expect(tools.get('ink')?.defaults?.strokeWidth).toBe(2);
    expect(tools.get('red-pen')?.defaults).toMatchObject({ color: '#ff0000', strokeWidth: 6 });
  });

  it('refuses `extends` of a tool not defined before the entry', () => {
    expect(() =>
      buildToolRegistry([
        { id: 'b', extends: 'a' } as unknown as AnnotationToolInput,
        { id: 'a', subtype: 'square' },
      ]),
    ).toThrow("tool 'b' extends 'a', which isn't defined before it");
  });

  it('merges a change into the tool it names, `meta` and preset included', () => {
    const tools = buildToolRegistry([
      { id: 'ink', meta: { label: 'Pen' } },
      { id: 'ink', meta: { icon: 'pen' } },
      { id: 'insert-text', defaults: { color: '#000000' } },
    ]);
    expect(tools.get('ink')?.meta).toEqual({ label: 'Pen', icon: 'pen' });
    expect(tools.get('insert-text')).toMatchObject({
      preset: 'caret',
      defaults: { color: '#000000' },
    });
  });

  it('puts a tool made with `extends` in place of the one with its id', () => {
    const tools = buildToolRegistry([
      { id: 'pen', subtype: 'ink', meta: { label: 'Pen' } },
      { id: 'pen', extends: 'line' },
    ]);
    expect(tools.get('pen')?.subtype).toBe('line');
    expect(tools.get('pen')?.meta).toBeUndefined();
  });

  it('rejects unsupported defaults from untyped JavaScript/JSON configuration', () => {
    expect(() => buildToolRegistry([invalidCircleDefaults])).toThrow(
      "tool 'invalid-circle' does not support default 'lineEndings'",
    );
  });
});
