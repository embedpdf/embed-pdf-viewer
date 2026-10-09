import type { Annotation, FontHandle } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import {
  applyStyleToRange,
  bodyFromTextStyle,
  faceForFont,
  isPlainRichText,
  locateOffset,
  normalizeRuns,
  paragraphsFromPlainText,
  plainTextOf,
  rangeHasStyle,
  richDocOf,
  richTextLength,
  splitRunsAt,
  styleAt,
} from '../src/richtext';
import type { TextStyle } from '../src/types';

const doc = () => ({
  paragraphs: [
    { runs: [{ text: 'Hello ' }, { text: 'bold', style: { weight: 700 } }, { text: ' world' }] },
    { runs: [{ text: 'second' }] },
  ],
});

describe('rich text algebra', () => {
  it('measures the plain projection with the paragraph separator', () => {
    expect(richTextLength(doc())).toBe('Hello bold world'.length + 1 + 'second'.length);
    expect(plainTextOf(doc())).toBe('Hello bold world\rsecond');
  });

  it('locates offsets, giving the separator to the earlier paragraph', () => {
    expect(locateOffset(doc(), 0)).toEqual({ paragraph: 0, offset: 0 });
    expect(locateOffset(doc(), 16)).toEqual({ paragraph: 0, offset: 16 });
    expect(locateOffset(doc(), 17)).toEqual({ paragraph: 1, offset: 0 });
    expect(locateOffset(doc(), 23)).toEqual({ paragraph: 1, offset: 6 });
  });

  it('splits a run at a boundary and keeps its delta on both halves', () => {
    const paragraph = splitRunsAt(doc().paragraphs[0]!, 8);
    expect(paragraph.runs).toEqual([
      { text: 'Hello ' },
      { text: 'bo', style: { weight: 700 } },
      { text: 'ld', style: { weight: 700 } },
      { text: ' world' },
    ]);
  });

  it('applies a delta to a range across runs and normalises the result', () => {
    const out = applyStyleToRange(doc(), { start: 3, end: 8 }, { italic: true });
    expect(out.paragraphs[0]!.runs).toEqual([
      { text: 'Hel' },
      { text: 'lo ', style: { italic: true } },
      { text: 'bo', style: { weight: 700, italic: true } },
      { text: 'ld', style: { weight: 700 } },
      { text: ' world' },
    ]);
  });

  it('applies across paragraphs and merges runs that become equal', () => {
    const out = applyStyleToRange(doc(), { start: 6, end: 23 }, { weight: 700 });
    expect(out.paragraphs[0]!.runs).toEqual([
      { text: 'Hello ' },
      { text: 'bold world', style: { weight: 700 } },
    ]);
    expect(out.paragraphs[1]!.runs).toEqual([{ text: 'second', style: { weight: 700 } }]);
  });

  it('clears a property so the range follows the body again', () => {
    const out = applyStyleToRange(doc(), { start: 6, end: 10 }, {}, ['weight']);
    expect(out.paragraphs[0]!.runs).toEqual([{ text: 'Hello bold world' }]);
  });

  it('ignores an empty range', () => {
    const input = doc();
    expect(applyStyleToRange(input, { start: 4, end: 4 }, { weight: 700 })).toBe(input);
  });

  it('reads the style at a caret: inside a run, at its end, at the start', () => {
    expect(styleAt(doc(), 7)).toEqual({ weight: 700 });
    expect(styleAt(doc(), 10)).toEqual({ weight: 700 });
    expect(styleAt(doc(), 6)).toEqual({});
    expect(styleAt(doc(), 0)).toEqual({});
  });

  it('tests a range for a style', () => {
    const bold = (style: { weight?: number }) => (style.weight ?? 400) >= 600;
    expect(rangeHasStyle(doc(), { start: 6, end: 10 }, bold)).toBe(true);
    expect(rangeHasStyle(doc(), { start: 4, end: 10 }, bold)).toBe(false);
    expect(rangeHasStyle(doc(), { start: 8, end: 8 }, bold)).toBe(true);
  });

  it('normalises: empty runs dropped, equal neighbours merged, empty paragraph kept', () => {
    const out = normalizeRuns({
      paragraphs: [
        {
          runs: [
            { text: 'a', style: { weight: 700 } },
            { text: '' },
            { text: 'b', style: { weight: 700 } },
          ],
        },
        { runs: [] },
        { runs: [{ text: 'c', style: { size: undefined } }] },
      ],
    });
    expect(out.paragraphs).toEqual([
      { runs: [{ text: 'ab', style: { weight: 700 } }] },
      { runs: [{ text: '' }] },
      { runs: [{ text: 'c' }] },
    ]);
  });

  it('knows a plain document from a rich one', () => {
    expect(isPlainRichText({ paragraphs: paragraphsFromPlainText('a\rb\nc') })).toBe(true);
    expect(isPlainRichText(doc())).toBe(false);
    expect(isPlainRichText({ paragraphs: [{ align: 'center', runs: [{ text: 'x' }] }] })).toBe(
      false,
    );
    expect(isPlainRichText({ body: { size: 12 }, paragraphs: [{ runs: [{ text: 'x' }] }] })).toBe(
      false,
    );
  });
});

describe('a free text’s document', () => {
  const text: TextStyle = {
    fontFamily: 'helvetica',
    fontSize: 12,
    fontColor: '#000000',
    textAlign: 'left',
  };
  const roboto: FontHandle = {
    key: 'roboto-bold',
    familyName: 'Roboto',
    weight: 700,
    italic: false,
    embeddingPermission: 'installable',
    editingAuthorized: true,
    instanced: false,
  };

  it('names the face of a standard font, a registered key, and an unknown family', () => {
    expect(faceForFont('helvetica-bold-oblique')).toEqual({
      family: 'Helvetica',
      weight: 700,
      italic: true,
    });
    expect(faceForFont('roboto-bold', () => [roboto])).toEqual({
      family: 'Roboto',
      weight: 700,
      italic: false,
    });
    expect(faceForFont('Mystery')).toEqual({ family: 'Mystery' });
  });

  it('synthesises a body from the /DA text style for an annotation without a rich body', () => {
    expect(bodyFromTextStyle({ ...text, fontFamily: 'times-bold', underline: true })).toMatchObject(
      { family: 'Times', weight: 700, italic: false, size: 12, decoration: ['underline'] },
    );
    expect(
      bodyFromTextStyle({ ...text, bold: true, italic: true, fontColor: '#ff0000' }),
    ).toMatchObject({
      family: 'Helvetica',
      weight: 700,
      italic: true,
      color: '#FF0000',
    });
    const annotation = {
      subtype: 'free-text',
      contents: 'a\rb',
      ...text,
    } as unknown as Annotation;
    const doc = richDocOf(annotation);
    expect(doc.paragraphs).toEqual([{ runs: [{ text: 'a' }] }, { runs: [{ text: 'b' }] }]);
    expect(doc.body.family).toBe('Helvetica');
  });
});
