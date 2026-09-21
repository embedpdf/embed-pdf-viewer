import type { Annot, TextStyle } from '@embedpdf/core-annotation';
import type { FontHandle, RichTextDocument } from '@embedpdf/engine-core/runtime';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import {
  bodyFromTextStyle,
  cssFontFamilyForFace,
  cssFontFamilyForFont,
  faceForFont,
  fontForFace,
  rangeProps,
  richDocOf,
  runDeltaForProps,
  textCommitPatch,
} from './rich-text';

const roboto: FontHandle = {
  key: 'roboto-bold',
  familyName: 'Roboto',
  weight: 700,
  italic: false,
  embeddingPermission: 'installable',
  editingAuthorized: true,
  instanced: false,
};
const robotoRegular: FontHandle = { ...roboto, key: 'roboto', weight: 400 };
const fonts = () => [roboto, robotoRegular];

const body: RichTextDocument['body'] = {
  family: 'Helvetica',
  weight: 400,
  italic: false,
  size: 12,
  color: '#000000',
  decoration: [],
  script: 'normal',
  letterSpacing: 0,
  horizontalScale: 1,
  align: 'left',
  dir: 'ltr',
};

const text: TextStyle = {
  fontFamily: 'helvetica',
  fontSize: 12,
  fontColor: '#000000',
  textAlign: 'left',
};

const annot = (extra: Partial<Annot> = {}): Annot =>
  ({
    id: 'a',
    ref: null,
    page: toPageRef(1),
    subtype: 'freeText',
    geom: { t: 'text', rect: { x: 0, y: 0, width: 100, height: 20 } },
    style: {
      color: '#000000',
      interiorColor: null,
      strokeWidth: 1,
      opacity: 1,
      blendMode: 'normal',
      border: { kind: 'solid' },
    },
    text,
    source: 'vector',
    apVersion: 0,
    ...extra,
  }) as unknown as Annot;

describe('faces', () => {
  it('maps standard fonts, registered keys and unknown families both ways', () => {
    expect(faceForFont('helvetica-bold-oblique')).toEqual({
      family: 'Helvetica',
      weight: 700,
      italic: true,
    });
    expect(faceForFont('roboto-bold', fonts)).toEqual({
      family: 'Roboto',
      weight: 700,
      italic: false,
    });
    expect(faceForFont('Mystery')).toEqual({ family: 'Mystery' });
    expect(fontForFace({ family: 'Helvetica', weight: 700, italic: true })).toBe(
      'helvetica-bold-oblique',
    );
    expect(fontForFace({ family: 'Times New Roman', weight: 400 })).toBe('times-roman');
    expect(fontForFace({ family: 'Symbol', weight: 700 })).toBe('symbol');
    expect(fontForFace({ family: 'roboto', weight: 600 }, fonts)).toBe('roboto-bold');
    expect(fontForFace({ family: 'roboto', weight: 400 }, fonts)).toBe('roboto');
    expect(fontForFace({ family: 'Mystery' })).toBe('Mystery');
  });

  it('gives the DOM a CSS family for a font key and for a face family', () => {
    expect(cssFontFamilyForFont('times-bold')).toBe('"Times New Roman", Times, serif');
    expect(cssFontFamilyForFont('roboto')).toBe('"roboto", sans-serif');
    expect(cssFontFamilyForFace('Arial')).toBe('Helvetica, Arial, sans-serif');
    expect(cssFontFamilyForFace('Roboto', fonts)).toBe('"roboto-bold"'); // the mounted key
    expect(cssFontFamilyForFace('Mystery')).toBe('"Mystery", sans-serif');
  });
});

describe('documents', () => {
  it('synthesises a body from the /DA text style for a draft without a DTO', () => {
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
    const doc = richDocOf(annot({ data: { subtype: 'free-text', contents: 'a\rb' } } as never));
    expect(doc.paragraphs).toEqual([{ runs: [{ text: 'a' }] }, { runs: [{ text: 'b' }] }]);
    expect(doc.body.family).toBe('Helvetica');
  });

  it('commits the rich paragraphs, with paragraph properties equal to the body stripped', () => {
    const plain = [{ runs: [{ text: 'hello' }] }];
    const styled = [{ runs: [{ text: 'hel', style: { weight: 700 } }, { text: 'lo' }] }];
    const a = annot({ data: { subtype: 'free-text' } } as never);
    expect(textCommitPatch(a, plain)).toEqual({ richText: { paragraphs: plain } });
    expect(textCommitPatch(a, styled)).toEqual({ richText: { paragraphs: styled } });
    // Paragraph align/dir equal to the body's (the editor round-trips what it
    // renders) are not overrides; a differing one is kept.
    const echoed = [{ align: 'left' as const, dir: 'ltr' as const, runs: [{ text: 'hello' }] }];
    expect(textCommitPatch(a, echoed)).toEqual({ richText: { paragraphs: plain } });
    const centred = [{ align: 'center' as const, dir: 'ltr' as const, runs: [{ text: 'hello' }] }];
    expect(textCommitPatch(a, centred)).toEqual({
      richText: { paragraphs: [{ align: 'center', runs: [{ text: 'hello' }] }] },
    });
  });
});

describe('props ↔ runs', () => {
  it('turns the range keys into a run delta and leaves the rest for the body', () => {
    expect(
      runDeltaForProps(
        {
          bold: true,
          italic: false,
          underline: true,
          fontSize: 9,
          fontColor: '#00ff00',
          opacity: 0.5,
        },
        fonts,
      ),
    ).toEqual({
      delta: { weight: 700, italic: false, decoration: ['underline'], size: 9, color: '#00FF00' },
      rest: { opacity: 0.5 },
    });
    expect(runDeltaForProps({ fontFamily: 'roboto-bold' }, fonts).delta).toEqual({
      family: 'Roboto',
      weight: 700,
      italic: false,
    });
    expect(runDeltaForProps({ bold: false, underline: false }).delta).toEqual({
      weight: 400,
      decoration: [],
    });
  });

  it('reads a range back against the body: agreeing values, else mixed', () => {
    const doc: RichTextDocument = {
      body,
      paragraphs: [
        {
          runs: [
            { text: 'bold ', style: { weight: 700 } },
            { text: 'plain ', style: { color: '#FF0000' } },
            { text: 'big', style: { size: 20, italic: true } },
          ],
        },
      ],
    };
    const whole = rangeProps(doc, { start: 0, end: 14 });
    expect(whole.values).toMatchObject({
      fontFamily: 'helvetica',
      fontSize: 12,
      fontColor: '#000000',
      bold: true,
      italic: false,
      underline: false,
    });
    expect(whole.mixed.sort()).toEqual(['bold', 'fontColor', 'fontSize', 'italic']);
    const first = rangeProps(doc, { start: 1, end: 4 });
    expect(first.values).toMatchObject({ fontFamily: 'helvetica', bold: true });
    expect(first.mixed).toEqual([]);
    const last = rangeProps(doc, { start: 11, end: 14 });
    expect(last.values).toMatchObject({ fontFamily: 'helvetica', fontSize: 20, italic: true });
  });
});
