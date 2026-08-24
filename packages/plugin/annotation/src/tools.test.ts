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

  it('gives each measure tool the geometry of the tool it extends', () => {
    const reg = buildToolRegistry();
    expect(reg.get('measure-distance')?.subtype).toBe('line');
    expect(reg.get('measure-perimeter')?.subtype).toBe('polyline');
    expect(reg.get('measure-area-polygon')?.subtype).toBe('polygon');
    expect(reg.get('measure-area-rect')?.subtype).toBe('square');
    expect(reg.get('measure-area-ellipse')?.subtype).toBe('circle');
  });

  it('gives each measure tool the mode its geometry can actually report', () => {
    const reg = buildToolRegistry();
    const mode = (id: string) => reg.get(id)?.defaults?.measurement?.mode;
    expect(mode('measure-distance')).toBe('distance');
    expect(mode('measure-perimeter')).toBe('perimeter');
    expect(mode('measure-area-polygon')).toBe('area');
    expect(mode('measure-area-rect')).toBe('area');
    expect(mode('measure-area-ellipse')).toBe('area');
  });

  it('keeps its own defaults key so calibrating one measure tool cannot leak', () => {
    const reg = buildToolRegistry();
    // Same subtype as the plain `line` tool, but a distinct preset — otherwise
    // arming Distance would restyle every line the user draws.
    expect(reg.get('measure-distance')?.preset).toBe('measure-distance');
    expect(reg.get('line')?.defaults?.measurement).toBeUndefined();
  });

  it('makes measurements DRAWN, never click-placed at a default size', () => {
    const reg = buildToolRegistry();
    for (const id of [
      'measure-distance',
      'measure-perimeter',
      'measure-area-polygon',
      'measure-area-rect',
      'measure-area-ellipse',
    ]) {
      // `false` is the explicit drag-only state (`capability.ts` gates the
      // click path on falsiness), not an accidental absence.
      expect(reg.get(id)?.clickCreate, id).toBe(false);
    }
    // The tool it extends DOES click-create — so this is a real override, not
    // an accident of the base tool.
    expect(reg.get('line')?.clickCreate).toBeDefined();
  });

  it('lets an embedder pre-calibrate a measure tool by extending it', () => {
    const reg = buildToolRegistry([
      {
        id: 'measure-distance',
        defaults: {
          measurement: {
            mode: 'distance',
            scale: { value: 10, unit: 'ft', pagePoints: 72 },
            unit: 'ft',
            precision: { type: 'decimal', places: 1 },
          },
        },
      },
    ]);
    expect(reg.get('measure-distance')?.defaults?.measurement).toMatchObject({
      scale: { value: 10, unit: 'ft', pagePoints: 72 },
      unit: 'ft',
    });
    // The inherited geometry survives the defaults-only override.
    expect(reg.get('measure-distance')?.subtype).toBe('line');
  });

  it('rejects a measurement default on a kind that cannot carry one', () => {
    expect(() =>
      buildToolRegistry([
        {
          id: 'bad-ink',
          subtype: 'ink',
          // @ts-expect-error ink annotations cannot be measurements
          defaults: { measurement: { mode: 'distance' } },
        },
      ]),
    ).toThrow("tool 'bad-ink' does not support default 'measurement'");
  });

  it('rejects unsupported defaults from untyped JavaScript/JSON configuration', () => {
    expect(() => buildToolRegistry([invalidCircleDefaults])).toThrow(
      "tool 'invalid-circle' does not support default 'lineEndings'",
    );
  });
});
