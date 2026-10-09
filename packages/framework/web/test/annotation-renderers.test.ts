import { describe, expect, it, vi } from 'vitest';

import {
  annotationDrawingOf,
  editingTextKeyOf,
  layerTextBoxesOf,
  lookRendererFor,
  registerRendererBehaviors,
  rendererBehaviorId,
  type RendererEntry,
} from '../src/annotation-renderers';

interface Note {
  id: string;
  kind: string;
}

/** A behavior registry like the annotation plugin's: registered behaviors, engaged when they say so. */
function registry() {
  const behaviors = new Map<
    string,
    { id: string; matches(note: Note): boolean; engaged(note: Note): boolean }
  >();
  return {
    behaviors,
    registerBehavior: vi.fn(
      (behavior: { id: string; matches(note: Note): boolean; engaged(note: Note): boolean }) => {
        behaviors.set(behavior.id, behavior);
        return () => behaviors.delete(behavior.id);
      },
    ),
    getBehaviorFor(note: Note) {
      for (const behavior of behaviors.values()) {
        if (behavior.matches(note) && behavior.engaged(note)) return { id: behavior.id };
      }
      return null;
    },
  };
}

const note: Note = { id: 'a', kind: 'note' };
const square: Note = { id: 'b', kind: 'square' };

describe('registerRendererBehaviors', () => {
  it('registers once per entry however many pages mount, and unregisters with the last', () => {
    const plugin = registry();
    const renderers: RendererEntry<Note>[] = [
      { id: 'notes', for: (record) => record.kind === 'note', interactive: true },
      { for: (record) => record.kind === 'square' },
    ];
    const firstPage = registerRendererBehaviors(plugin, renderers, () => 'pointer');
    const secondPage = registerRendererBehaviors(plugin, renderers, () => 'pointer');
    expect(plugin.registerBehavior).toHaveBeenCalledTimes(1);
    expect(rendererBehaviorId(plugin, renderers[0]!)).toBe('notes');
    expect(rendererBehaviorId(plugin, renderers[1]!)).toBeNull();
    firstPage();
    expect(plugin.behaviors.has('notes')).toBe(true);
    secondPage();
    expect(plugin.behaviors.has('notes')).toBe(false);
    expect(rendererBehaviorId(plugin, renderers[0]!)).toBeNull();
  });

  it('asks an interactive function with the active tool, whenever it matters', () => {
    const plugin = registry();
    let tool = 'pointer';
    const renderers: RendererEntry<Note>[] = [
      { for: () => true, interactive: ({ toolId }) => toolId === 'pan' },
    ];
    const release = registerRendererBehaviors(plugin, renderers, () => tool);
    expect(plugin.getBehaviorFor(note)).toBeNull();
    tool = 'pan';
    expect(plugin.getBehaviorFor(note)).toEqual({ id: rendererBehaviorId(plugin, renderers[0]!) });
    release();
  });
});

describe('annotationDrawingOf', () => {
  it('draws the layer’s own look when nothing claims the annotation', () => {
    expect(annotationDrawingOf(note, registry(), undefined, false)).toEqual({
      kind: 'native',
      inert: false,
    });
  });

  it('lets a look draw without the pointer, and its text box take the keys while typed in', () => {
    const look = { for: (record: Note) => record.kind === 'note' };
    expect(annotationDrawingOf(note, registry(), [look], false)).toEqual({
      kind: 'look',
      entry: look,
      interactive: false,
      inert: true,
    });
    expect(annotationDrawingOf(note, registry(), [look], true)).toMatchObject({ inert: false });
    expect(lookRendererFor(square, [look])).toBeNull();
  });

  it('gives an engaged behavior’s renderer the annotation, before any look', () => {
    const plugin = registry();
    plugin.registerBehavior({ id: 'form', matches: () => true, engaged: () => true });
    const owner = { behavior: 'form' };
    const look = { for: () => true };
    expect(annotationDrawingOf(note, plugin, [look, owner], false)).toEqual({
      kind: 'owned',
      entry: owner,
    });
    // Engaged with no renderer of yours: the behavior's plugin owns the input.
    expect(annotationDrawingOf(note, plugin, [look], false)).toEqual({
      kind: 'native',
      inert: true,
    });
  });

  it('lets an interactive look take the pointer while its behavior is engaged', () => {
    const plugin = registry();
    const look = { for: () => true, interactive: true };
    const release = registerRendererBehaviors(plugin, [look], () => 'pointer');
    expect(annotationDrawingOf(note, plugin, [look], false)).toEqual({
      kind: 'look',
      entry: look,
      interactive: true,
      inert: false,
    });
    release();
  });
});

describe('text boxes', () => {
  type Ref = { objectNumber: number };
  const keyOf = (ref: Ref) => `obj:${ref.objectNumber}`;
  const text = (objectNumber: number | null, editing = false) => ({
    id: `text:${objectNumber}`,
    ref: objectNumber === null ? null : { objectNumber },
    editing,
  });
  const itemOf = (objectNumber: number, annotation: Note | null) => ({
    ref: { objectNumber },
    annotation,
  });

  it('names the text box being typed in by its key', () => {
    expect(editingTextKeyOf([text(1), text(2, true)], keyOf)).toBe('obj:2');
    expect(editingTextKeyOf([text(1), text(null, true)], keyOf)).toBeNull();
    expect(editingTextKeyOf([], keyOf)).toBeNull();
  });

  it('leaves out the text boxes a look draws, and keeps the rest', () => {
    const texts = [text(1), text(2), text(null)];
    const items = [itemOf(1, note), itemOf(2, square)];
    const looks: RendererEntry<Note>[] = [
      { behavior: 'form-fill' },
      { for: (annotation) => annotation.kind === 'note' },
    ];
    expect(layerTextBoxesOf(texts, items, looks, keyOf)).toEqual([text(2), text(null)]);
  });

  it('hands the same list back when no look could draw one', () => {
    const texts = [text(1)];
    const items = [itemOf(1, note)];
    expect(layerTextBoxesOf(texts, items, undefined, keyOf)).toBe(texts);
    expect(layerTextBoxesOf(texts, items, [{ behavior: 'form-fill' }], keyOf)).toBe(texts);
  });
});
