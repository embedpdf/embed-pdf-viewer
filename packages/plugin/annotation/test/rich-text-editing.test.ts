/**
 * The rich text editing policy at the capability boundary: what the editor's
 * document, selection and the property surface do to the model and the
 * engine — the same for every framework's glue.
 */
import { styleOf, textOf } from '@embedpdf/core-annotation';
import type {
  Annotation,
  AnnotationFlags,
  AnnotationRef,
  RichTextParagraph,
} from '@embedpdf/engine-core/runtime';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { annotationHarness, type FileAnnotation } from './harness';

const PON = 1;
const PAGE = toPageRef(PON);
const CROP = { left: 0, bottom: 0, right: 600, top: 800 };
const NO_FLAGS: AnnotationFlags = {
  invisible: false,
  hidden: false,
  print: true,
  noZoom: false,
  noRotate: false,
  noView: false,
  readOnly: false,
  locked: false,
  toggleNoView: false,
  lockedContents: false,
};
const REF: AnnotationRef = { kind: 'objectNumber', page: PAGE, objectNumber: 30 };

const freeTextDTO = (
  contents: string,
  extra: Record<string, unknown> = {},
  paragraphs: RichTextParagraph[] = contents
    .split('\n')
    .map((line) => ({ runs: [{ text: line }] })),
): FileAnnotation =>
  ({
    ref: REF,
    page: PAGE,
    hasAppearance: true,
    appearanceState: null,
    nm: null,
    ...NO_FLAGS,
    contents,
    subject: null,
    author: null,
    createdAt: null,
    modifiedAt: null,
    blendMode: 'normal',
    subtype: 'free-text',
    intent: 'free-text',
    fontFamily: 'helvetica',
    fontSize: 12,
    textAlign: 'left',
    richText: {
      body: {
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
      },
      paragraphs,
    },
    color: '#000000',
    interiorColor: null,
    opacity: 1,
    strokeWidth: 1,
    borderStyle: 'solid',
    rect: { left: 100, bottom: 700, right: 300, top: 740 },
    box: { left: 100, bottom: 700, right: 300, top: 740 },
    ...extra,
  }) as unknown as FileAnnotation;

async function loaded(dto: FileAnnotation) {
  const harness = annotationHarness({ crop: CROP });
  vi.useRealTimers();
  await harness.load([dto]);
  vi.useFakeTimers();
  expect(harness.model().order.length).toBe(1);
  const id = harness.model().order[0]!;
  harness.update.mockResolvedValue({ annotation: dto, appearance: { changed: false } });
  return {
    ...harness,
    id,
    data: () =>
      harness.model().byId[id]!.annotation as Extract<Annotation, { subtype: 'free-text' }>,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the editor document', () => {
  it('applies rich paragraphs optimistically and commits them, debounced', async () => {
    const harness = await loaded(freeTextDTO('hello'));
    harness.capability.text.begin(REF);
    harness.capability.draftRichText(REF, { paragraphs: [{ runs: [{ text: 'hello world' }] }] });
    expect(harness.data().contents).toBe('hello world');
    expect(harness.capability.listTextItems(PAGE)[0]!.richText.paragraphs).toEqual([
      { runs: [{ text: 'hello world' }] },
    ]);
    expect(harness.update).not.toHaveBeenCalled(); // debounced
    vi.advanceTimersByTime(300);
    // One engine, one path: plain text commits as rich paragraphs too.
    expect(harness.update).toHaveBeenCalledWith(REF, {
      subtype: 'free-text',
      richText: { paragraphs: [{ runs: [{ text: 'hello world' }] }] },
    });
    // The editor's metrics are the rich engine's from the start: line
    // advance 1.2 × size, text inset 2 × the border width.
    const item = harness.capability.listTextItems(PAGE)[0]!;
    expect(item.css.padding).toBe(2);
  });

  it('never takes in the echo of a commit the keyboard is ahead of', async () => {
    const harness = await loaded(freeTextDTO('hello'));
    let answer!: () => void;
    harness.update.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = () =>
            resolve({ annotation: freeTextDTO('hello'), appearance: { changed: true } });
        }),
    );
    harness.capability.text.begin(REF);
    const paragraphs = [{ runs: [{ text: 'hel', style: { weight: 700 } }, { text: 'lo' }] }];
    harness.capability.draftRichText(REF, { paragraphs });
    vi.advanceTimersByTime(300);
    expect(harness.update).toHaveBeenCalledWith(REF, {
      subtype: 'free-text',
      richText: { paragraphs },
    });
    // Typing goes on while the first commit is on its way; then its echo lands.
    harness.capability.draftRichText(REF, { paragraphs: [{ runs: [{ text: 'hello!' }] }] });
    answer();
    await harness.ctx.changes.whenSettled();
    expect(harness.data().contents).toBe('hello!');
  });

  it('flushes the pending write and drops the selection on text.end', async () => {
    const harness = await loaded(freeTextDTO('hello'));
    harness.capability.text.begin(REF);
    harness.capability.setTextSelection(REF, { start: 1, end: 3 });
    expect(harness.state().textSelection).toEqual({ id: harness.id, start: 1, end: 3 });
    harness.capability.draftRichText(REF, { paragraphs: [{ runs: [{ text: 'bye' }] }] });
    harness.capability.text.end();
    expect(harness.update).toHaveBeenCalledTimes(1);
    expect(harness.update).toHaveBeenCalledWith(REF, {
      subtype: 'free-text',
      richText: { paragraphs: [{ runs: [{ text: 'bye' }] }] },
    });
    expect(harness.state().textSelection).toBeNull();
    expect(harness.model().editing).toBeNull();
    vi.advanceTimersByTime(300);
    expect(harness.update).toHaveBeenCalledTimes(1); // the debounce was cancelled, not doubled
  });
});

describe('the property surface while editing', () => {
  it('restyles the RANGE when the editor holds one, and reports it', async () => {
    const harness = await loaded(freeTextDTO('hello world'));
    harness.capability.text.begin(REF);
    harness.capability.setTextSelection(REF, { start: 0, end: 5 });
    harness.capability.text.toggleFormat('bold');
    harness.capability.selection.update({ fontColor: '#ff0000' });
    // As the engine will read it back: colours in lowercase.
    expect(harness.data().richText.paragraphs).toEqual([
      {
        runs: [{ text: 'hello', style: { weight: 700, color: '#ff0000' } }, { text: ' world' }],
      },
    ]);
    expect(textOf(harness.model().byId[harness.id]!.annotation)!.bold).toBeUndefined(); // the body is untouched
    const props = harness.capability.selection.getProperties();
    expect(props.values).toMatchObject({ bold: true, fontColor: '#ff0000', italic: false });
    expect(props.mixed).toEqual([]);
    harness.capability.setTextSelection(REF, { start: 3, end: 8 });
    const across = harness.capability.selection.getProperties();
    expect([...across.mixed].sort()).toEqual(['bold', 'fontColor']);
    vi.advanceTimersByTime(300);
    expect(harness.update).toHaveBeenCalledTimes(1);
    expect(harness.update.mock.calls[0]![1]).toMatchObject({
      richText: { paragraphs: expect.any(Array) },
    });
    expect(harness.update.mock.calls[0]![1].richText.body).toBeUndefined();
  });

  it('toggleTextFormat flips the range state; with no editor it formats all the text', async () => {
    const harness = await loaded(freeTextDTO('hello world'));
    harness.capability.text.begin(REF);
    harness.capability.setTextSelection(REF, { start: 0, end: 5 });
    harness.capability.text.toggleFormat('italic');
    expect(harness.data().richText.paragraphs[0]!.runs[0]).toEqual({
      text: 'hello',
      style: { italic: true },
    });
    harness.capability.text.toggleFormat('italic');
    expect(harness.data().richText.paragraphs[0]!.runs[0]).toEqual({
      text: 'hello',
      style: { italic: false },
    });
    // No editor: all the box's text takes the toggle, written as a rich body patch.
    await harness.capability.text.end();
    harness.capability.selection.select([REF]);
    harness.capability.text.toggleFormat('bold');
    expect(textOf(harness.model().byId[harness.id]!.annotation)!.bold).toBe(true);
    expect(harness.capability.selection.getProperties().values.bold).toBe(true);
    expect(harness.capability.listTextItems(PAGE)[0]!.css.fontWeight).toBe(700);
    await harness.ctx.changes.whenSettled();
    const bodyWrite = harness.update.mock.calls.find((call) => call[1].richText?.body);
    // The complete body rides along: a partial one would mean engine
    // defaults and reset the size, face and colour.
    expect(bodyWrite?.[1]).toMatchObject({
      subtype: 'free-text',
      richText: {
        body: { weight: 700, italic: false, decoration: [], size: 12, family: 'Helvetica' },
      },
    });
  });

  it('a toggle over words that disagree turns the format on', async () => {
    const harness = await loaded(
      freeTextDTO('hello world', {}, [
        { runs: [{ text: 'hello', style: { weight: 700 } }, { text: ' world' }] },
      ]),
    );
    harness.capability.text.begin(REF);
    harness.capability.setTextSelection(REF, { start: 0, end: 11 });
    expect(harness.capability.selection.getProperties().mixed).toContain('bold');
    harness.capability.text.toggleFormat('bold');
    expect(harness.data().richText.paragraphs).toEqual([
      { runs: [{ text: 'hello world', style: { weight: 700 } }] },
    ]);
  });

  it('keeps non-text keys on the annotation and lands the text before them', async () => {
    const harness = await loaded(freeTextDTO('hello'));
    harness.capability.text.begin(REF);
    harness.capability.draftRichText(REF, { paragraphs: [{ runs: [{ text: 'typed' }] }] });
    harness.capability.setTextSelection(REF, { start: 0, end: 5 });
    harness.capability.text.toggleFormat('underline');
    harness.capability.selection.update({ opacity: 0.5 });
    expect(styleOf(harness.model().byId[harness.id]!.annotation).opacity).toBe(0.5);
    await harness.ctx.changes.whenSettled();
    // order: the (flushed) text write, then the opacity write
    expect(harness.update.mock.calls.map((call) => Object.keys(call[1]).sort().join(','))).toEqual([
      'richText,subtype',
      'opacity,subtype',
    ]);
    expect(harness.update.mock.calls[0]![1].richText.paragraphs[0].runs[0]).toEqual({
      text: 'typed',
      style: { decoration: ['underline'] },
    });
  });
});

/** "cheese is very good", "very" bold: offsets 10 to 14. */
const VERY_GOOD: RichTextParagraph[] = [
  { runs: [{ text: 'cheese is ' }, { text: 'very', style: { weight: 700 } }, { text: ' good' }] },
];
const veryGood = () => freeTextDTO('cheese is very good', {}, VERY_GOOD);

describe('the caret', () => {
  it('reads the text typed next: the style of the text before it', async () => {
    const harness = await loaded(veryGood());
    harness.capability.text.begin(REF);
    harness.capability.setTextSelection(REF, { start: 12, end: 12 });
    expect(harness.capability.selection.getProperties().values.bold).toBe(true);
    harness.capability.setTextSelection(REF, { start: 14, end: 14 }); // right after "very"
    expect(harness.capability.selection.getProperties().values.bold).toBe(true);
    harness.capability.setTextSelection(REF, { start: 5, end: 5 });
    expect(harness.capability.selection.getProperties().values.bold).toBe(false);
  });

  it('takes a format for the text typed next, and writes nothing until it is typed', async () => {
    const harness = await loaded(veryGood());
    harness.capability.text.begin(REF);
    harness.capability.setTextSelection(REF, { start: 14, end: 14 });
    await harness.capability.text.toggleFormat('bold');
    expect(harness.capability.selection.getProperties().values.bold).toBe(false);
    expect(harness.data().richText.paragraphs).toEqual(VERY_GOOD);
    vi.advanceTimersByTime(300);
    expect(harness.update).not.toHaveBeenCalled();
    // The browser types "t" into the bold word; it lands regular, and the
    // caret after it reads regular, so typing goes on regular.
    harness.capability.draftRichText(REF, {
      paragraphs: [
        {
          runs: [
            { text: 'cheese is ' },
            { text: 'veryt', style: { weight: 700 } },
            { text: ' good' },
          ],
        },
      ],
    });
    const typed = [
      {
        runs: [
          { text: 'cheese is ' },
          { text: 'very', style: { weight: 700 } },
          { text: 't', style: { weight: 400 } },
          { text: ' good' },
        ],
      },
    ];
    expect(harness.data().richText.paragraphs).toEqual(typed);
    expect(harness.state().textSelection).toEqual({ id: harness.id, start: 15, end: 15 });
    expect(harness.capability.selection.getProperties().values.bold).toBe(false);
    vi.advanceTimersByTime(300);
    expect(harness.update).toHaveBeenCalledWith(REF, {
      subtype: 'free-text',
      richText: { paragraphs: typed },
    });
  });

  it('a font, size or color at a caret is for the text typed next too', async () => {
    const harness = await loaded(veryGood());
    harness.capability.text.begin(REF);
    harness.capability.setTextSelection(REF, { start: 5, end: 5 });
    await harness.capability.selection.update({ fontColor: '#ff0000', fontSize: 18 });
    expect(harness.capability.selection.getProperties().values).toMatchObject({
      fontColor: '#ff0000',
      fontSize: 18,
    });
    expect(harness.data().richText.body.size).toBe(12); // the box is untouched
    harness.capability.draftRichText(REF, {
      paragraphs: [
        {
          runs: [
            { text: 'cheesXe is ' },
            { text: 'very', style: { weight: 700 } },
            { text: ' good' },
          ],
        },
      ],
    });
    expect(harness.data().richText.paragraphs[0]!.runs.slice(0, 3)).toEqual([
      { text: 'chees' },
      { text: 'X', style: { size: 18, color: '#ff0000' } },
      { text: 'e is ' },
    ]);
  });

  it('drops the chosen style when the caret moves; a line break carries it on', async () => {
    const harness = await loaded(veryGood());
    harness.capability.text.begin(REF);
    harness.capability.setTextSelection(REF, { start: 12, end: 12 });
    await harness.capability.text.toggleFormat('underline');
    // The editor reporting the caret where it is keeps the style.
    harness.capability.setTextSelection(REF, { start: 12, end: 12 });
    expect(harness.capability.selection.getProperties().values.underline).toBe(true);
    harness.capability.setTextSelection(REF, { start: 13, end: 13 });
    harness.capability.setTextSelection(REF, { start: 12, end: 12 });
    expect(harness.capability.selection.getProperties().values.underline).toBe(false);

    // Italic at the end, then Enter: the new line's caret has it, and so does its text.
    harness.capability.setTextSelection(REF, { start: 19, end: 19 });
    await harness.capability.text.toggleFormat('italic');
    const first = VERY_GOOD[0]!;
    harness.capability.draftRichText(REF, { paragraphs: [first, { runs: [{ text: '' }] }] });
    expect(harness.state().textSelection).toEqual({
      id: harness.id,
      start: 20,
      end: 20,
      typing: { italic: true },
    });
    harness.capability.setTextSelection(REF, { start: 20, end: 20 });
    expect(harness.capability.selection.getProperties().values.italic).toBe(true);
    harness.capability.draftRichText(REF, { paragraphs: [first, { runs: [{ text: 'x' }] }] });
    expect(harness.data().richText.paragraphs[1]).toEqual({
      runs: [{ text: 'x', style: { italic: true } }],
    });
  });
});

describe('a selected text box', () => {
  /** "Paid in full", "in full" bold and blue. */
  const paid = () =>
    freeTextDTO('Paid in full', {}, [
      { runs: [{ text: 'Paid ' }, { text: 'in full', style: { weight: 700, color: '#0000ff' } }] },
    ]);

  it('reads all its text: a format is on only when all of it has it', async () => {
    const harness = await loaded(paid());
    harness.capability.selection.select([REF]);
    const props = harness.capability.selection.getProperties();
    expect(props.values.bold).toBe(false); // the first word's, as a range reads
    expect([...props.mixed].sort()).toEqual(['bold', 'fontColor']);
    harness.capability.text.toggleFormat('bold');
    expect(harness.data().richText.body.weight).toBe(700);
    expect(harness.data().richText.paragraphs).toEqual([
      { runs: [{ text: 'Paid ' }, { text: 'in full', style: { color: '#0000ff' } }] },
    ]);
    expect(harness.capability.selection.getProperties().mixed).toEqual(['fontColor']);
  });

  it('styles all its text: a word with its own color follows the box', async () => {
    const harness = await loaded(paid());
    harness.capability.selection.select([REF]);
    const written = harness.capability.selection.update({ fontColor: '#cc0000' });
    const following = [{ runs: [{ text: 'Paid ' }, { text: 'in full', style: { weight: 700 } }] }];
    expect(harness.data().richText.paragraphs).toEqual(following);
    const props = harness.capability.selection.getProperties();
    expect(props.values.fontColor).toBe('#cc0000');
    expect(props.mixed).toEqual(['bold']);
    await written;
    // One write: the box's color, and its words without colors of their own.
    expect(harness.update).toHaveBeenCalledTimes(1);
    expect(harness.update.mock.calls[0]![1]).toMatchObject({
      subtype: 'free-text',
      fontColor: '#cc0000',
      richText: { paragraphs: following },
    });
  });
});
