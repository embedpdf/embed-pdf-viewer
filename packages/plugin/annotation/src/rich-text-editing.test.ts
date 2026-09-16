/**
 * The rich text editing policy at the capability boundary: what the editor's
 * document, selection and the property surface do to the model and the
 * engine — the same for every framework's glue.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnotationDTO, AnnotationFlags, AnnotationRef } from '@embedpdf/engine-core/runtime';
import type { PluginContext } from '@embedpdf/core';

import { createAnnotationCapability } from './capability';
import { annotationReducer, initialAnnotationState } from './reducer';
import type { AnnotationAction, AnnotationState } from './types';

const PON = 1;
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
const REF: AnnotationRef = { kind: 'objectNumber', pageObjectNumber: PON, annotObjectNumber: 30 };

const freeTextDTO = (
  contents: string,
  extra: Record<string, unknown> = {},
  paragraphs = contents.split('\r').map((line) => ({ runs: [{ text: line }] })),
): AnnotationDTO =>
  ({
    ref: REF,
    pageObjectNumber: PON,
    index: 30,
    identityQuality: 'durable',
    nm: null,
    flags: NO_FLAGS,
    contents,
    subject: null,
    author: null,
    created: null,
    modified: null,
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

function harness() {
  let state = initialAnnotationState();
  const update = vi.fn();
  const list = vi.fn();
  const ctx = {
    getState: () => state,
    dispatch: (action: AnnotationAction) => {
      state = annotationReducer(state, action);
    },
    document: () => ({ pages: [{ pageObjectNumber: PON, boxes: { crop: CROP } }] }),
    doc: {
      page: () => ({ annotations: { update, list } }),
      security: {
        allows: () => true,
        identity: { user_id: 'me' },
        allowsAnnotationCreate: () => true,
        allowsAnnotationMutation: () => true,
        allowsAnnotationGroupAssignment: () => true,
      },
    },
    engine: { fonts: { list: () => [] } },
    tryGet: () => null,
  } as unknown as PluginContext<AnnotationState, AnnotationAction>;
  return { capability: createAnnotationCapability(ctx), update, list, state: () => state };
}

async function loaded(dto: AnnotationDTO) {
  const h = harness();
  h.list.mockResolvedValueOnce({ annotations: [dto] });
  await h.capability.reloadPage(PON);
  await vi.waitFor(() => expect(h.state().model.order.length).toBe(1));
  const id = h.state().model.order[0]!;
  h.update.mockResolvedValue({ updated: dto, appearance: { changed: false } });
  return {
    ...h,
    id,
    data: () => h.state().model.byId[id]!.data as Extract<AnnotationDTO, { subtype: 'free-text' }>,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the editor document', () => {
  it('applies rich paragraphs optimistically and commits them, debounced', async () => {
    const h = await loaded(freeTextDTO('hello'));
    h.capability.beginTextEdit(REF);
    h.capability.setRichText(REF, { paragraphs: [{ runs: [{ text: 'hello world' }] }] });
    expect(h.data().contents).toBe('hello world');
    expect(h.capability.textItems(PON)[0]!.richText.paragraphs).toEqual([
      { runs: [{ text: 'hello world' }] },
    ]);
    expect(h.update).not.toHaveBeenCalled(); // debounced
    vi.advanceTimersByTime(300);
    // One engine, one path: plain text commits as rich paragraphs too.
    expect(h.update).toHaveBeenCalledWith(REF, {
      subtype: 'free-text',
      richText: { paragraphs: [{ runs: [{ text: 'hello world' }] }] },
    });
    // The editor's metrics are the rich engine's from the start: line
    // advance 1.2 × size, text inset 2 × the border width.
    const item = h.capability.textItems(PON)[0]!;
    expect(item.css.lineHeight).toBeCloseTo(14.4);
    expect(item.css.padding).toBe(2);
  });

  it('never re-ingests the commit echo (it may be behind the keyboard)', async () => {
    const h = await loaded(freeTextDTO('hello'));
    h.update.mockResolvedValue({ updated: freeTextDTO('stale'), appearance: { changed: true } });
    h.capability.beginTextEdit(REF);
    const paragraphs = [{ runs: [{ text: 'hel', style: { weight: 700 } }, { text: 'lo' }] }];
    h.capability.setRichText(REF, { paragraphs });
    vi.advanceTimersByTime(300);
    expect(h.update).toHaveBeenCalledWith(REF, { subtype: 'free-text', richText: { paragraphs } });
    await vi.waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    expect(h.data().contents).toBe('hello');
  });

  it('flushes the pending write and drops the selection on endTextEdit', async () => {
    const h = await loaded(freeTextDTO('hello'));
    h.capability.beginTextEdit(REF);
    h.capability.setTextSelection(REF, { start: 1, end: 3 });
    expect(h.state().textSelection).toEqual({ id: h.id, start: 1, end: 3 });
    h.capability.setRichText(REF, { paragraphs: [{ runs: [{ text: 'bye' }] }] });
    h.capability.endTextEdit();
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith(REF, {
      subtype: 'free-text',
      richText: { paragraphs: [{ runs: [{ text: 'bye' }] }] },
    });
    expect(h.state().textSelection).toBeNull();
    expect(h.state().model.editing).toBeNull();
    vi.advanceTimersByTime(300);
    expect(h.update).toHaveBeenCalledTimes(1); // the debounce was cancelled, not doubled
  });
});

describe('the property surface while editing', () => {
  it('restyles the RANGE when the editor holds one, and reports it', async () => {
    const h = await loaded(freeTextDTO('hello world'));
    h.capability.beginTextEdit(REF);
    h.capability.setTextSelection(REF, { start: 0, end: 5 });
    h.capability.updateSelection({ bold: true, fontColor: '#ff0000' });
    expect(h.data().richText.paragraphs).toEqual([
      {
        runs: [{ text: 'hello', style: { weight: 700, color: '#FF0000' } }, { text: ' world' }],
      },
    ]);
    expect(h.state().model.byId[h.id]!.text!.bold).toBeUndefined(); // the body is untouched
    const props = h.capability.getSelectionProps();
    expect(props.values).toMatchObject({ bold: true, fontColor: '#ff0000', italic: false });
    expect(props.mixed).toEqual([]);
    h.capability.setTextSelection(REF, { start: 3, end: 8 });
    const across = h.capability.getSelectionProps();
    expect(across.mixed.sort()).toEqual(['bold', 'fontColor']);
    vi.advanceTimersByTime(300);
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update.mock.calls[0]![1]).toMatchObject({
      richText: { paragraphs: expect.any(Array) },
    });
    expect(h.update.mock.calls[0]![1].richText.body).toBeUndefined();
  });

  it('toggleTextFormat flips the range state; a caret or no editor restyles the body', async () => {
    const h = await loaded(freeTextDTO('hello world'));
    h.capability.beginTextEdit(REF);
    h.capability.setTextSelection(REF, { start: 0, end: 5 });
    h.capability.toggleTextFormat('italic');
    expect(h.data().richText.paragraphs[0]!.runs[0]).toEqual({
      text: 'hello',
      style: { italic: true },
    });
    h.capability.toggleTextFormat('italic');
    expect(h.data().richText.paragraphs[0]!.runs[0]).toEqual({
      text: 'hello',
      style: { italic: false },
    });
    // A bare caret: the body takes the toggle, written as a rich body patch.
    h.capability.setTextSelection(REF, { start: 2, end: 2 });
    h.capability.toggleTextFormat('bold');
    expect(h.state().model.byId[h.id]!.text!.bold).toBe(true);
    expect(h.capability.getSelectionProps().values.bold).toBe(true);
    expect(h.capability.textItems(PON)[0]!.css.fontWeight).toBe(700);
    const bodyWrite = h.update.mock.calls.find((c) => c[1].richText?.body);
    // The COMPLETE body rides along: a partial one would mean engine
    // defaults and reset the size, face and colour.
    expect(bodyWrite?.[1]).toMatchObject({
      subtype: 'free-text',
      richText: {
        body: { weight: 700, italic: false, decoration: [], size: 12, family: 'Helvetica' },
      },
    });
  });

  it('keeps non-text keys on the annotation and lands the text before them', async () => {
    const h = await loaded(freeTextDTO('hello'));
    h.capability.beginTextEdit(REF);
    h.capability.setRichText(REF, { paragraphs: [{ runs: [{ text: 'typed' }] }] });
    h.capability.setTextSelection(REF, { start: 0, end: 5 });
    h.capability.updateSelection({ opacity: 0.5, underline: true });
    expect(h.state().model.byId[h.id]!.style.opacity).toBe(0.5);
    // order: the (flushed) text write, then the opacity write
    expect(h.update.mock.calls.map((c) => Object.keys(c[1]).sort().join(','))).toEqual([
      'richText,subtype',
      'opacity,subtype',
    ]);
    expect(h.update.mock.calls[0]![1].richText.paragraphs[0].runs[0]).toEqual({
      text: 'typed',
      style: { decoration: ['underline'] },
    });
  });
});
