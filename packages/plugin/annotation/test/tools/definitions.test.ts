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

  it('rejects unsupported defaults from untyped JavaScript/JSON configuration', () => {
    expect(() => buildToolRegistry([invalidCircleDefaults])).toThrow(
      "tool 'invalid-circle' does not support default 'lineEndings'",
    );
  });
});
