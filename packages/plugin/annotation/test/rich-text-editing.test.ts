/**
 * The rich text editing policy at the capability boundary: what the editor's
 * document, selection and the property surface do to the model and the
 * engine — the same for every framework's glue.
 */
import type { AnnotationDTO, AnnotationFlags, AnnotationRef } from '@embedpdf/engine-core/runtime';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { annotationHarness } from './harness';

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
const REF: AnnotationRef = { kind: 'objectNumber', page: PAGE, annotObjectNumber: 30 };

const freeTextDTO = (
  contents: string,
  extra: Record<string, unknown> = {},
  paragraphs = contents.split('\r').map((line) => ({ runs: [{ text: line }] })),
): AnnotationDTO =>
  ({
    ref: REF,
    page: PAGE,
    index: 30,
    identityQuality: 'durable',
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
    color: { r: 0, g: 0, b: 0 },
    interiorColor: null,
    opacity: 1,
    strokeWidth: 1,
    borderStyle: 'solid',
    rectDifferences: null,
    rect: { left: 100, bottom: 700, right: 300, top: 740 },
    ...extra,
  }) as unknown as AnnotationDTO;

async function loaded(dto: AnnotationDTO) {
  const harness = annotationHarness({ crop: CROP });
  vi.useRealTimers();
  await harness.load([dto]);
  vi.useFakeTimers();
  expect(harness.model().order.length).toBe(1);
  const id = harness.model().order[0]!;
  harness.update.mockResolvedValue({ updated: dto, appearance: { changed: false } });
  return {
    ...harness,
    id,
    data: () => harness.model().byId[id]!.data as Extract<AnnotationDTO, { subtype: 'free-text' }>,
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
    harness.capability.beginTextEdit(REF);
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

  it('never re-ingests the commit echo (it may be behind the keyboard)', async () => {
    const harness = await loaded(freeTextDTO('hello'));
    harness.update.mockResolvedValue({
      updated: freeTextDTO('stale'),
      appearance: { changed: true },
    });
    harness.capability.beginTextEdit(REF);
    const paragraphs = [{ runs: [{ text: 'hel', style: { weight: 700 } }, { text: 'lo' }] }];
    harness.capability.draftRichText(REF, { paragraphs });
    vi.advanceTimersByTime(300);
    expect(harness.update).toHaveBeenCalledWith(REF, {
      subtype: 'free-text',
      richText: { paragraphs },
    });
    await vi.waitFor(() => expect(harness.update).toHaveBeenCalledTimes(1));
    expect(harness.data().contents).toBe('hello');
  });

  it('flushes the pending write and drops the selection on endTextEdit', async () => {
    const harness = await loaded(freeTextDTO('hello'));
    harness.capability.beginTextEdit(REF);
    harness.capability.setTextSelection(REF, { start: 1, end: 3 });
    expect(harness.state().textSelection).toEqual({ id: harness.id, start: 1, end: 3 });
    harness.capability.draftRichText(REF, { paragraphs: [{ runs: [{ text: 'bye' }] }] });
    harness.capability.endTextEdit();
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
    harness.capability.beginTextEdit(REF);
    harness.capability.setTextSelection(REF, { start: 0, end: 5 });
    harness.capability.updateSelection({ bold: true, fontColor: '#ff0000' });
    expect(harness.data().richText.paragraphs).toEqual([
      {
        runs: [{ text: 'hello', style: { weight: 700, color: '#FF0000' } }, { text: ' world' }],
      },
    ]);
    expect(harness.model().byId[harness.id]!.text!.bold).toBeUndefined(); // the body is untouched
    const props = harness.capability.getSelectionProps();
    expect(props.values).toMatchObject({ bold: true, fontColor: '#ff0000', italic: false });
    expect(props.mixed).toEqual([]);
    harness.capability.setTextSelection(REF, { start: 3, end: 8 });
    const across = harness.capability.getSelectionProps();
    expect(across.mixed.sort()).toEqual(['bold', 'fontColor']);
    vi.advanceTimersByTime(300);
    expect(harness.update).toHaveBeenCalledTimes(1);
    expect(harness.update.mock.calls[0]![1]).toMatchObject({
      richText: { paragraphs: expect.any(Array) },
    });
    expect(harness.update.mock.calls[0]![1].richText.body).toBeUndefined();
  });

  it('toggleTextFormat flips the range state; a caret or no editor restyles the body', async () => {
    const harness = await loaded(freeTextDTO('hello world'));
    harness.capability.beginTextEdit(REF);
    harness.capability.setTextSelection(REF, { start: 0, end: 5 });
    harness.capability.toggleTextFormat('italic');
    expect(harness.data().richText.paragraphs[0]!.runs[0]).toEqual({
      text: 'hello',
      style: { italic: true },
    });
    harness.capability.toggleTextFormat('italic');
    expect(harness.data().richText.paragraphs[0]!.runs[0]).toEqual({
      text: 'hello',
      style: { italic: false },
    });
    // A bare caret: the body takes the toggle, written as a rich body patch.
    harness.capability.setTextSelection(REF, { start: 2, end: 2 });
    harness.capability.toggleTextFormat('bold');
    expect(harness.model().byId[harness.id]!.text!.bold).toBe(true);
    expect(harness.capability.getSelectionProps().values.bold).toBe(true);
    expect(harness.capability.listTextItems(PAGE)[0]!.css.fontWeight).toBe(700);
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

  it('keeps non-text keys on the annotation and lands the text before them', async () => {
    const harness = await loaded(freeTextDTO('hello'));
    harness.capability.beginTextEdit(REF);
    harness.capability.draftRichText(REF, { paragraphs: [{ runs: [{ text: 'typed' }] }] });
    harness.capability.setTextSelection(REF, { start: 0, end: 5 });
    harness.capability.updateSelection({ opacity: 0.5, underline: true });
    expect(harness.model().byId[harness.id]!.style.opacity).toBe(0.5);
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
