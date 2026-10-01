/**
 * The capability as the annotation pages describe it: each Methods, State and
 * Events row does what its row says. The settings, the hover, the reads that
 * take a page as a ref or an index, the drawing order, the transfers, what a
 * tool does after it creates, and the comment checks.
 */
import { annotationKey, isPluginError, toPageRef } from '@embedpdf/core';
import type { AnnotationFlags, AnnotationRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it, vi } from 'vitest';

import { annotationState } from '../src/state';
import { annotationHarness, PAGE, type FileAnnotation } from './harness';

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

const ref = (objectNumber: number): AnnotationRef => ({
  kind: 'objectNumber',
  page: PAGE,
  objectNumber,
});

/** A filled square in the file's coordinates (y up): on the page, x 40..60, y 520..530. */
const square = (objectNumber: number, extra: Partial<FileAnnotation> = {}): FileAnnotation =>
  ({
    ref: ref(objectNumber),
    page: PAGE,
    index: objectNumber,
    identityQuality: 'durable',
    hasAppearance: true,
    nm: null,
    ...NO_FLAGS,
    contents: null,
    subject: null,
    author: null,
    createdAt: null,
    modifiedAt: null,
    blendMode: 'normal',
    subtype: 'square',
    rect: { left: 40, bottom: 270, right: 60, top: 280 },
    box: { left: 40, bottom: 270, right: 60, top: 280 },
    color: '#000000',
    strokeWidth: 1,
    opacity: 1,
    interiorColor: '#ff0000',
    ...extra,
  }) as FileAnnotation;

const keys = (annotations: readonly { ref: AnnotationRef }[]) =>
  annotations.map((annotation) => annotationKey(annotation.ref));

describe('settings', () => {
  it('reads what the app registered over the defaults, and the session snaps as they say', async () => {
    const harness = annotationHarness({
      config: { chrome: { accent: '#e91e63' }, snap: { alignmentThreshold: 10 } },
    });
    await harness.load([]);
    const settings = harness.capability.getSettings();
    expect(settings.chrome.accent).toBe('#e91e63');
    expect(settings.chrome.handles.shape).toBe('square'); // a default the app left alone
    expect(settings.afterCreate).toEqual({ select: true, tool: 'stay', editText: true });
    expect(harness.model().snap.alignmentThreshold).toBe(10);
  });

  it('updateSettings changes snapping at once, says what changed, and resetSettings goes back', async () => {
    const harness = annotationHarness();
    await harness.load([]);
    const changes: string[][] = [];
    harness.capability.onSettingsChanged(({ changed }) => changes.push([...changed]));
    harness.capability.updateSettings({ snap: { alignment: false } });
    expect(harness.model().snap.alignment).toBe(false);
    harness.capability.updateSettings({ chrome: { rotationHandle: { enabled: false } } });
    expect(harness.capability.getSettings().chrome.rotationHandle.offset).toBe(32); // merged
    harness.capability.resetSettings();
    expect(harness.model().snap.alignment).toBe(true);
    expect(changes).toEqual([['snap'], ['chrome'], ['chrome', 'snap']]);
  });

  it('without a rotation handle, the selection has none to draw or grab', async () => {
    const harness = annotationHarness({
      config: { chrome: { rotationHandle: { enabled: false } } },
    });
    await harness.load([square(20)]);
    harness.capability.selection.set([ref(20)]);
    const kinds = harness.capability.listChromeNodes(PAGE).map((node) => node.kind);
    expect(kinds).toContain('handle');
    expect(kinds).not.toContain('rotate-knob');
    expect(harness.capability.selection.getAnchor()?.rotationHandle).toBeUndefined();
  });
});

describe('reads', () => {
  it('list takes pages as refs or indexes, and a kind; a page that isn’t there lists nothing', async () => {
    const harness = annotationHarness();
    await harness.load([square(20), square(21, { subtype: 'circle' } as never)]);
    expect(keys(harness.capability.list({ pages: [PAGE] }))).toHaveLength(2);
    expect(harness.capability.list({ pages: [0] })).toBe(
      harness.capability.list({ pages: [PAGE] }),
    );
    expect(keys(harness.capability.list({ subtype: 'square' }))).toEqual([annotationKey(ref(20))]);
    expect(harness.capability.list({ pages: [toPageRef(99)] })).toEqual([]);
  });

  it('getAt returns the record at a point, by ref or index, and null off it or off the document', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    expect(harness.capability.getAt(PAGE, { x: 50, y: 525 })?.ref).toEqual(ref(20));
    expect(harness.capability.getAt(0, { x: 50, y: 525 })?.ref).toEqual(ref(20));
    expect(harness.capability.getAt(PAGE, { x: 300, y: 100 })).toBeNull();
    expect(harness.capability.getAt(toPageRef(99), { x: 50, y: 525 })).toBeNull();
  });

  it('the hovered annotation is state: getHovered, onHoverChanged and the declared state follow it', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    const events: (AnnotationRef | null)[] = [];
    harness.capability.onHoverChanged(({ ref: hovered }) => events.push(hovered));
    harness.capability.hoverAt({ page: PAGE, point: { x: 50, y: 525 } });
    expect(harness.capability.getHovered()?.ref).toEqual(ref(20));
    expect(annotationState.read(harness.capability).hovered?.ref).toEqual(ref(20));
    harness.capability.hoverAt(null);
    expect(harness.capability.getHovered()).toBeNull();
    expect(events).toEqual([ref(20), null]);
  });

  it('the declared state has the status, the selection and what is typed in', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.capability.selection.set([ref(20)]);
    const state = annotationState.read(harness.capability);
    expect(state.status).toBe('ready');
    expect(keys(state.selected)).toEqual([annotationKey(ref(20))]);
    expect(state.editing).toBeNull();
    expect(annotationState.empty).toEqual({
      status: 'loading',
      selected: [],
      hovered: null,
      editing: null,
    });
  });
});

describe('the selection', () => {
  it('set, add, list and clear; selectAll takes a page index', async () => {
    const harness = annotationHarness();
    await harness.load([square(20), square(21)]);
    const { selection } = harness.capability;
    selection.set([ref(20)]);
    selection.add([ref(21)]);
    expect(keys(selection.list())).toEqual([annotationKey(ref(20)), annotationKey(ref(21))]);
    selection.clear();
    expect(selection.list()).toEqual([]);
    selection.selectAll(0);
    expect(selection.list()).toHaveLength(2);
    selection.selectAll(7); // no such page: nothing to select
    expect(selection.list()).toEqual([]);
  });

  it('selectInRect refuses a page that isn’t in the document', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    expect(() =>
      harness.capability.selection.selectInRect(toPageRef(99), {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      }),
    ).toThrow(expect.objectContaining({ code: 'not-found' }));
  });

  it('flags are properties: a selection reports them, and update writes them', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.capability.selection.set([ref(20)]);
    const { properties, values } = harness.capability.selection.getProperties();
    expect(properties.find((property) => property.key === 'color')?.control).toBe('color');
    expect(properties.find((property) => property.key === 'locked')?.control).toBe('flag');
    expect(values.locked).toBe(false);
    harness.update.mockResolvedValueOnce({ annotation: square(20, { locked: true }) });
    await harness.capability.selection.update({ locked: true });
    expect(harness.update).toHaveBeenCalledWith(ref(20), expect.objectContaining({ locked: true }));
  });
});

describe('the drawing order', () => {
  it('move shows the new order at once, then the engine’s, and fires onMoved', async () => {
    const harness = annotationHarness();
    await harness.load([square(20), square(21), square(22)]);
    let release!: () => void;
    harness.move.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ annotations: [square(22, { index: 0 } as never)] as FileAnnotation[] });
        }),
    );
    const moved: { refs: readonly AnnotationRef[]; toIndex: number }[] = [];
    harness.capability.onMoved(({ refs, toIndex }) => moved.push({ refs, toIndex }));

    const done = harness.capability.move([ref(22)], 0);
    // Shown before the engine answered.
    expect(keys(harness.capability.list())).toEqual(keys([square(22), square(20), square(21)]));
    release();
    await done;
    expect(keys(harness.capability.list())).toEqual(keys([square(22), square(20), square(21)]));
    expect(harness.state().moves).toEqual([]);
    expect(moved).toEqual([{ refs: [ref(22)], toIndex: 0 }]);
  });

  it('a refused move goes at once, and onWriteFailed says why', async () => {
    const harness = annotationHarness();
    await harness.load([square(20), square(21)]);
    harness.move.mockRejectedValueOnce(new Error('locked elsewhere'));
    const failed: readonly AnnotationRef[][] = [];
    harness.capability.onWriteFailed(({ refs }) => (failed as AnnotationRef[][]).push([...refs]));
    await expect(harness.capability.move([ref(21)], 0)).rejects.toSatisfy(isPluginError);
    expect(keys(harness.capability.list())).toEqual(keys([square(20), square(21)]));
    expect(failed).toEqual([[ref(21)]]);
  });

  it('move refuses annotations on two pages', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    // A new square on the second page, shown before the engine confirms it.
    harness.apply([
      {
        type: 'create',
        page: toPageRef(2),
        draft: { subtype: 'square', box: { x: 1, y: 1, width: 5, height: 5 }, nm: 'x' },
      },
    ]);
    await expect(
      harness.capability.move([ref(20), { kind: 'nm', page: toPageRef(2), nm: 'x' }], 0),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    expect(harness.move).not.toHaveBeenCalled();
  });
});

describe('transfers', () => {
  it('export waits for pending writes, maps page indexes to refs, and needs doc.download', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    await harness.capability.export({ pages: [0] });
    expect(harness.exportBundle).toHaveBeenCalledWith({ pages: [PAGE] });
    harness.allows.mockImplementation((permission) => permission !== 'doc.download');
    await expect(harness.capability.export()).rejects.toMatchObject({
      code: 'permission-denied',
      permission: 'doc.download',
    });
    expect(harness.exportBundle).toHaveBeenCalledTimes(1);
  });

  it('import resolves the new annotations, the ref map and what was dropped', async () => {
    const harness = annotationHarness();
    await harness.load([]);
    const bundle = { version: 1 } as never;
    const result = await harness.capability.import(bundle, { attribution: 'stamp' });
    expect(harness.importBundle).toHaveBeenCalledWith(bundle, { attribution: 'stamp' });
    expect(result).toEqual({ annotations: [], refMap: [], dropped: [] });
  });

  it('downloadResource reads a resource’s bytes, and refuses one that isn’t here', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    await expect(harness.capability.downloadResource(ref(20), 'appearance')).resolves.toEqual(
      new Uint8Array([1]),
    );
    expect(harness.downloadResource).toHaveBeenCalledWith(ref(20), 'appearance');
    await expect(harness.capability.downloadResource(ref(99), 'file')).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('after a tool creates', () => {
  const draw = (harness: ReturnType<typeof annotationHarness>) => {
    harness.capability.createPointer('square', 'down', PAGE, { x: 100, y: 100 });
    harness.capability.createPointer('square', 'move', PAGE, { x: 200, y: 180 });
    harness.capability.createPointer('square', 'up', PAGE, { x: 200, y: 180 });
  };

  it('selects the new annotation and keeps the tool by default', async () => {
    const harness = annotationHarness();
    await harness.load([]);
    harness.create.mockImplementation(async () => ({ annotation: square(40) }));
    draw(harness);
    expect(harness.model().selected).toHaveLength(1);
    expect(harness.interaction.activateDefaultTool).not.toHaveBeenCalled();
  });

  it('selects nothing and goes back to the default tool when the setting says so', async () => {
    const harness = annotationHarness({
      config: { afterCreate: { select: false, tool: 'default' } },
    });
    await harness.load([]);
    harness.create.mockImplementation(async () => ({ annotation: square(40) }));
    draw(harness);
    expect(harness.model().order).toHaveLength(1);
    expect(harness.model().selected).toEqual([]);
    expect(harness.interaction.activateDefaultTool).toHaveBeenCalledOnce();
  });

  it('a tool’s own afterCreate wins over the setting', async () => {
    const harness = annotationHarness({
      config: {
        afterCreate: { select: false },
        tools: [{ id: 'square', afterCreate: { select: true } }],
      },
    });
    await harness.load([]);
    harness.create.mockImplementation(async () => ({ annotation: square(40) }));
    draw(harness);
    expect(harness.model().selected).toHaveLength(1);
  });

  it('code never selects unless it asks', async () => {
    const harness = annotationHarness();
    await harness.load([]);
    harness.create.mockImplementation(async () => ({ annotation: square(40) }));
    await harness.capability.create(0, {
      subtype: 'square',
      box: { x: 10, y: 10, width: 20, height: 20 },
    });
    expect(harness.model().selected).toEqual([]);
  });
});

describe('tools', () => {
  it('updateDefaults fires onDefaultsChanged with the tool’s defaults, once per change', async () => {
    const harness = annotationHarness();
    await harness.load([]);
    const seen = vi.fn();
    harness.capability.tools.onDefaultsChanged(seen);
    harness.capability.tools.updateDefaults('ink', { color: '#00a000' });
    harness.capability.tools.updateDefaults('ink', { color: '#00a000' }); // no change
    expect(seen).toHaveBeenCalledOnce();
    expect(seen.mock.calls[0]![0]).toMatchObject({ toolId: 'ink', defaults: { color: '#00a000' } });
    expect(harness.capability.tools.getDefaults('ink').color).toBe('#00a000');
  });

  it('defaults take any field of the kind, flags and contents included, and refuse others', () => {
    const harness = annotationHarness({
      config: {
        tools: [{ id: 'todo', extends: 'note', defaults: { contents: 'TODO', locked: true } }],
      },
    });
    expect(harness.capability.tools.getDefaults('todo')).toMatchObject({
      contents: 'TODO',
      locked: true,
    });
    expect(() =>
      annotationHarness({
        config: { tools: [{ id: 'square', defaults: { fontSize: 12 } as never }] },
      }),
    ).toThrow("tool 'square' does not support default 'fontSize'");
  });

  it('getProperties has the shape a selection’s has', () => {
    const harness = annotationHarness();
    const { properties, values, mixed } = harness.capability.tools.getProperties('ink');
    expect(properties.map((property) => property.key)).toContain('strokeWidth');
    expect(values.color).toBeDefined();
    expect(mixed).toEqual([]);
  });
});

describe('comments', () => {
  const note = (objectNumber: number, extra: Partial<FileAnnotation> = {}) =>
    ({
      ...square(objectNumber),
      subtype: 'text',
      icon: 'comment',
      contents: 'hello',
      reply: null,
      popup: null,
      state: null,
      stateModel: null,
      ...extra,
    }) as unknown as FileAnnotation;

  it('each verb has its own check', async () => {
    const harness = annotationHarness();
    await harness.load([note(20, { lockedContents: true } as never)]);
    const { comments } = harness.capability;
    expect(comments.canReply(ref(20))).toBe(true);
    expect(comments.canSetStatus(ref(20))).toBe(true);
    expect(comments.canSetMarked(ref(20))).toBe(true);
    expect(comments.canSetText(ref(20))).toBe(false); // lockedContents
    expect(comments.canDelete(ref(20))).toBe(true);
    expect(comments.canDeleteThread(ref(20))).toBe(true);
    harness.allowsAnnotationCreate.mockReturnValue(false);
    expect(comments.canReply(ref(20))).toBe(false);
    await expect(comments.reply(ref(20), 'no')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});
