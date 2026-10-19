import { describe, expect, it, vi } from 'vitest';

import {
  attachTextBoxEditor,
  createTextBoxEditorFollower,
  freeTextBoxOf,
  ownTextBoxOf,
  textBoxEditorScaleOf,
  textBoxStyleOf,
  type TextBoxEditorAnnotation,
  type TextBoxEditorItem,
} from '../src/text-box-editor';
import { fakeEditor } from './helpers/fake-editor';

type Ref = { objectNumber: number };

/** The rich-text fake, with what the text box itself touches: focus, editability and scroll. */
function textBoxElement() {
  const { el } = fakeEditor();
  return Object.assign(el, {
    isConnected: true,
    contentEditable: 'inherit',
    scrollTop: 40,
    focus: vi.fn(),
  });
}

/** The annotation plugin's text-editing calls, recording the drafts. */
function textEditing(editingId: () => string | null = () => null) {
  const annotation: TextBoxEditorAnnotation<Ref> & { drafts: unknown[] } = {
    drafts: [],
    draftRichText: (ref, document) => annotation.drafts.push({ ref, document }),
    setTextSelection: vi.fn(),
    text: { toggleFormat: vi.fn() },
    getCssFontFamily: (family) => family,
    getEditingId: editingId,
  };
  return annotation;
}

function harness() {
  const element = textBoxElement();
  let editingId: string | null = null;
  const annotation = textEditing(() => editingId);
  const editor = attachTextBoxEditor(element as unknown as HTMLElement, annotation);
  return { element, annotation, editor, setEditingId: (id: string | null) => (editingId = id) };
}

const item = (editing: boolean, text = 'hello'): TextBoxEditorItem<Ref> => ({
  id: 'obj:7',
  ref: { objectNumber: 7 },
  richText: { paragraphs: [{ runs: [{ text }] }] },
  editing,
});

describe('attachTextBoxEditor', () => {
  it('keeps a press inside the box, with or without a text box yet', () => {
    const { element, editor } = harness();
    editor.update(null, 1);
    expect(element.contentEditable).toBe('false');
    expect(element.childNodes).toHaveLength(0);
    const press = { stopped: false, stopPropagation: () => (press.stopped = true) };
    element.dispatch('pointerdown', press);
    expect(press.stopped).toBe(true);
  });

  it('draws the text, and takes focus at the top when the plugin starts editing it', () => {
    const { element, editor } = harness();
    editor.update(item(false), 1);
    expect(element.contentEditable).toBe('false');
    expect(element.focus).not.toHaveBeenCalled();
    expect(element.childNodes).toHaveLength(1);

    editor.update(item(true), 1);
    expect(element.contentEditable).toBe('true');
    expect(element.focus).toHaveBeenCalledTimes(1);
    expect(element.scrollTop).toBe(0);

    // Typing restates the item: focus is not taken again while it stays edited.
    editor.update(item(true, 'hello!'), 1);
    expect(element.focus).toHaveBeenCalledTimes(1);
  });

  it('routes typing to the item’s annotation', () => {
    const { element, annotation, editor } = harness();
    editor.update(item(true), 1);
    element.childNodes[0]!.childNodes[0]!.nodeValue = 'hello world';
    element.dispatch('input');
    expect(annotation.drafts).toEqual([
      {
        ref: { objectNumber: 7 },
        document: { paragraphs: [{ runs: [{ text: 'hello world' }] }] },
      },
    ]);
  });

  it('takes focus back from a blur to nowhere while the plugin still edits the box', () => {
    const { element, editor, setEditingId } = harness();
    editor.update(item(true), 1);
    element.focus.mockClear();
    setEditingId('obj:7');
    element.dispatch('blur', { relatedTarget: null });
    expect(element.focus).toHaveBeenCalledTimes(1);
    // Focus that moves to another element, or an edit that ended, stays away.
    element.dispatch('blur', { relatedTarget: {} });
    setEditingId(null);
    element.dispatch('blur', { relatedTarget: null });
    expect(element.focus).toHaveBeenCalledTimes(1);
  });

  it('lets go of the element on detach', () => {
    const { element, editor } = harness();
    editor.update(item(false), 1);
    editor.detach();
    expect(element.listeners.get('pointerdown')?.size ?? 0).toBe(0);
    expect(element.listeners.get('blur')?.size ?? 0).toBe(0);
    expect(element.listeners.get('input')?.size ?? 0).toBe(0);
  });
});

describe('text box geometry and style', () => {
  const css = {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#000',
    fontWeight: 700,
    fontStyle: 'italic',
    textDecoration: 'none',
    align: 'center' as const,
    padding: 2,
  };

  /** A page drawn `scale` pixels per point. */
  const pageAt = (scale: number) => ({
    toPixels: (point: { x: number; y: number }) => ({ x: point.x * scale, y: point.y * scale }),
  });
  const box = { x: 10, y: 10, width: 20, height: 5 };

  it('puts the layer’s box on the plate, the box inset by its padding, at the page’s scale', () => {
    // 10 pt at 2 px per point: 20 px text, legible as it is.
    const { style, scale } = freeTextBoxOf({ box, css, editing: false }, pageAt(2), 'blue');
    expect(scale).toBe(2);
    expect(style).toMatchObject({
      position: 'absolute',
      left: '24px',
      top: '24px',
      width: '32px',
      height: '2px',
      fontSize: '20px',
      overflowY: 'hidden',
      outline: 'none',
      cursor: 'default',
      transform: 'none',
      transformOrigin: '0 0',
      pointerEvents: 'none',
    });
  });

  it('lays small text out at 16 px, and draws the box back at the plate’s size', () => {
    // 10 pt at 0.8 px per point is 8 px on the page: laid out twice as big, drawn at half.
    const plain = { ...css, padding: 0 };
    const { style, scale } = freeTextBoxOf({ box, css: plain, editing: true }, pageAt(0.8), 'blue');
    expect(scale).toBe(1.6);
    expect(style).toMatchObject({
      left: '8px',
      top: '8px',
      width: '32px',
      height: '8px',
      fontSize: '16px',
      overflowY: 'auto',
      outline: '2px solid blue',
      cursor: 'text',
      transform: 'scale(0.5)',
      pointerEvents: 'auto',
    });
  });

  it('turns a turned box about the plate’s centre, once drawn back at the plate’s size', () => {
    const plain = { ...css, padding: 0 };
    const { style } = freeTextBoxOf(
      { box, css: plain, rot: 90, editing: false },
      pageAt(0.8),
      'blue',
    );
    expect(style.transform).toBe(
      'translate(8px, 2px) rotate(90deg) translate(-8px, -2px) scale(0.5)',
    );
    expect(
      freeTextBoxOf({ box, css, rot: 90, editing: false }, pageAt(2), 'blue').style.transform,
    ).toBe('translate(16px, 1px) rotate(90deg) translate(-16px, -1px)');
  });

  it('fills your element’s parent, and lays small text out at 16 px drawn back at its size', () => {
    expect(ownTextBoxOf({ css, editing: false }, 2)).toEqual({
      scale: 2,
      style: {
        ...textBoxStyleOf(css, 2),
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        transform: 'none',
        transformOrigin: '0 0',
      },
    });
    const small = ownTextBoxOf({ css, editing: true }, 0.8);
    expect(small.scale).toBe(1.6);
    expect(small.style).toMatchObject({
      fontSize: '16px',
      width: '200%',
      height: '200%',
      transform: 'scale(0.5)',
      pointerEvents: 'auto',
    });
  });

  it('sizes the body font in pixels, with no line height of its own', () => {
    expect(textBoxStyleOf(css, 1.5)).toEqual({
      fontFamily: 'Helvetica',
      fontSize: '15px',
      color: '#000',
      fontWeight: 700,
      fontStyle: 'italic',
      textDecoration: 'none',
      textAlign: 'center',
    });
  });
});

describe('createTextBoxEditorFollower', () => {
  const asHtml = (element: ReturnType<typeof textBoxElement>) => element as unknown as HTMLElement;

  it('attaches once there are an element and a plugin, with the box at once', () => {
    const follower = createTextBoxEditorFollower<Ref>();
    const element = textBoxElement();
    const annotation = textEditing();
    follower.follow(null, annotation, item(false), 1);
    follower.follow(asHtml(element), null, item(false), 1);
    expect(element.childNodes).toHaveLength(0);
    expect(element.listeners.get('pointerdown')?.size ?? 0).toBe(0);

    follower.follow(asHtml(element), annotation, item(false), 1);
    expect(element.childNodes).toHaveLength(1);
    expect(element.contentEditable).toBe('false');
    expect(element.listeners.get('pointerdown')?.size).toBe(1);
  });

  it('hands every change of the box to the same editor', () => {
    const follower = createTextBoxEditorFollower<Ref>();
    const element = textBoxElement();
    const annotation = textEditing();
    follower.follow(asHtml(element), annotation, item(false), 1);
    follower.follow(asHtml(element), annotation, item(true), 1);
    expect(element.contentEditable).toBe('true');
    expect(element.focus).toHaveBeenCalledTimes(1);
    expect(element.listeners.get('pointerdown')?.size).toBe(1);
  });

  it('attaches again for another plugin or element, and lets go on detach', () => {
    const follower = createTextBoxEditorFollower<Ref>();
    const first = textBoxElement();
    const second = textBoxElement();
    follower.follow(asHtml(first), textEditing(), item(false), 1);
    // Another document's plugin: the same element, attached again.
    follower.follow(asHtml(first), textEditing(), item(false), 1);
    expect(first.listeners.get('pointerdown')?.size).toBe(1);

    const annotation = textEditing();
    follower.follow(asHtml(second), annotation, item(false), 1);
    expect(first.listeners.get('pointerdown')?.size ?? 0).toBe(0);
    expect(second.listeners.get('pointerdown')?.size).toBe(1);

    follower.detach();
    expect(second.listeners.get('pointerdown')?.size ?? 0).toBe(0);
    // A detached follower attaches again on the next call.
    follower.follow(asHtml(second), annotation, item(false), 1);
    expect(second.listeners.get('pointerdown')?.size).toBe(1);
  });
});

describe('textBoxEditorScaleOf', () => {
  const page = {
    viewScale: 3,
    toPixels: (point: { x: number; y: number }) => ({ x: point.x * 2, y: point.y * 2 }),
  };
  const box = { x: 10, y: 10, width: 20, height: 5 };

  it('is the box’s pixels per point on the page, over the look’s scale', () => {
    expect(textBoxEditorScaleOf({ box }, page, 1)).toBe(2);
    expect(textBoxEditorScaleOf({ box }, page, 4)).toBe(0.5);
  });

  it('is the page’s view scale without a box with width', () => {
    expect(textBoxEditorScaleOf(null, page, 1)).toBe(3);
    expect(textBoxEditorScaleOf({ box: { ...box, width: 0 } }, page, 2)).toBe(1.5);
  });
});
