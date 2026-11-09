import { describe, expect, it } from 'vitest';

import { resolvePageColors, type PageColors } from '../../src/dto/PageColors';
import { checkRenderUsage } from '../../src/dto/PageRender';
import { EngineErrorCode } from '../../src/errors/EngineErrorCode';

const refusal = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    const { code, details } = error as { code: string; details?: { field?: string } };
    return { code, field: details?.field };
  }
  return null;
};
const invalid = (field: string) => ({ code: EngineErrorCode.InvalidArg, field });

describe('resolvePageColors', () => {
  it("draws the page as the file has it for 'normal' and for nothing", () => {
    expect(resolvePageColors(undefined)).toBeNull();
    expect(resolvePageColors('normal')).toBeNull();
  });

  it("gives 'dark' and 'sepia' every color, with fills as outlines so a label stays readable", () => {
    for (const preset of ['dark', 'sepia'] as const) {
      expect(resolvePageColors(preset)).toMatchObject({
        convertFillToStroke: true,
        background: expect.stringMatching(/^#[0-9a-f]{6}$/),
        pathFill: expect.stringMatching(/^#[0-9a-f]{6}$/),
        pathStroke: expect.stringMatching(/^#[0-9a-f]{6}$/),
        textFill: expect.stringMatching(/^#[0-9a-f]{6}$/),
        textStroke: expect.stringMatching(/^#[0-9a-f]{6}$/),
      });
    }
    expect(resolvePageColors('dark')!.background).not.toBe(resolvePageColors('sepia')!.background);
  });

  it('gives a custom scheme white paper, black ink and no outlines for what it leaves out', () => {
    expect(resolvePageColors({})).toEqual({
      background: '#ffffff',
      pathFill: '#000000',
      pathStroke: '#000000',
      textFill: '#000000',
      textStroke: '#000000',
      convertFillToStroke: false,
    });
  });

  it('gives each of the four colors `text` when it is left out, and keeps one that is given', () => {
    expect(
      resolvePageColors({ background: '#1E1E1E', text: '#E8E6E3', pathStroke: '#ff0000' }),
    ).toEqual({
      background: '#1e1e1e',
      pathFill: '#e8e6e3',
      pathStroke: '#ff0000',
      textFill: '#e8e6e3',
      textStroke: '#e8e6e3',
      convertFillToStroke: false,
    });
    expect(resolvePageColors({ convertFillToStroke: true })!.convertFillToStroke).toBe(true);
  });

  it('refuses what is not a preset or an object of #rrggbb colors, naming the field', () => {
    const resolve = (pageColors: unknown) => () => resolvePageColors(pageColors as PageColors);
    expect(refusal(resolve('night'))).toEqual(invalid('pageColors'));
    expect(refusal(resolve(null))).toEqual(invalid('pageColors'));
    expect(refusal(resolve(['dark']))).toEqual(invalid('pageColors'));
    expect(refusal(resolve({ text: 'red' }))).toEqual(invalid('pageColors.text'));
    expect(refusal(resolve({ background: '#fff' }))).toEqual(invalid('pageColors.background'));
    expect(refusal(resolve({ pathFill: '#ff000080' }))).toEqual(invalid('pageColors.pathFill'));
    expect(refusal(resolve({ textStroke: 12 }))).toEqual(invalid('pageColors.textStroke'));
    expect(refusal(resolve({ convertFillToStroke: 'yes' }))).toEqual(
      invalid('pageColors.convertFillToStroke'),
    );
    expect(refusal(resolve({ colour: '#000000' }))).toEqual(invalid('pageColors.colour'));
  });
});

describe('checkRenderUsage and pageColors', () => {
  const print = { usage: 'print', viewport: { kind: 'dpi', dpi: 150 } } as const;

  it('a print picture is on white: it takes no pageColors', () => {
    expect(refusal(() => checkRenderUsage(print, null))).toBeNull();
    expect(refusal(() => checkRenderUsage({ ...print, pageColors: 'dark' }, null))).toEqual(
      invalid('pageColors'),
    );
  });

  it('a screen picture and a thumbnail take them', () => {
    expect(refusal(() => checkRenderUsage({ pageColors: 'dark' }, null))).toBeNull();
    expect(
      refusal(() =>
        checkRenderUsage({ viewport: { kind: 'thumbnail' }, pageColors: 'sepia' }, null),
      ),
    ).toBeNull();
  });
});
