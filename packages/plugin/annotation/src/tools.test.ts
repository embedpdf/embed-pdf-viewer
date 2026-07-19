import { describe, expect, it } from 'vitest';

import { buildToolRegistry, type AnnotationToolInput } from './tools';

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
      propsKind: 'strikeout',
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
      intent: 'ink-highlight',
      defaults: { color: '#ffcd45', strokeWidth: 14, blendMode: 'multiply' },
      ink: {
        groupStrokesMs: 800,
        straighten: { deviationThreshold: 0.15, axisSnapDegrees: 15 },
      },
    });
  });

  it('rejects unsupported defaults from untyped JavaScript/JSON configuration', () => {
    expect(() => buildToolRegistry([invalidCircleDefaults])).toThrow(
      "tool 'invalid-circle' does not support default 'lineEndings'",
    );
  });
});
