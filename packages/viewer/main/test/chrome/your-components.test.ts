/**
 * The pure parts of your own components in the chrome: where an item sits, as the attributes on
 * your element; which bar's edge a slotted element is in, for the viewer's own components inside
 * it; and the list of those components a delivery keeps per viewer.
 */
import { describe, expect, it } from 'vitest';

import {
  TOOLBAR_ITEM_CONTEXT_ATTRIBUTES,
  toolbarItemEdgeOf,
  writeToolbarItemContext,
} from '../../../chrome/src/ui/item-context';
import {
  createPlacedComponents,
  type PlacedComponent,
} from '../../../chrome/src/ui/placed-components';
import { createSlottedEdges } from '../../../chrome/src/ui/slotted-edges';

/** An element's attributes, without a DOM. */
function fakeElement(parent: Element | null = null): Element & { attributes: Map<string, string> } {
  const attributes = new Map<string, string>();
  return {
    attributes,
    parentElement: parent,
    getRootNode: () => ({}),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    removeAttribute: (name: string) => void attributes.delete(name),
  } as unknown as Element & { attributes: Map<string, string> };
}

describe('the item context', () => {
  it('names a floating bar `float`, whichever half it floats in, and a bar over a selection `selection`', () => {
    expect(toolbarItemEdgeOf('top')).toBe('top');
    expect(toolbarItemEdgeOf('end')).toBe('end');
    expect(toolbarItemEdgeOf('float-top')).toBe('float');
    expect(toolbarItemEdgeOf('float-bottom')).toBe('float');
    expect(toolbarItemEdgeOf('selection')).toBe('selection');
  });

  it('writes each field as its data attribute, and no variant for an item without its own', () => {
    const element = fakeElement();
    writeToolbarItemContext(element, {
      orientation: 'vertical',
      edge: 'start',
      variant: 'short',
      size: 'medium',
    });
    expect(Object.fromEntries(element.attributes)).toEqual({
      'data-orientation': 'vertical',
      'data-edge': 'start',
      'data-variant': 'short',
      'data-size': 'medium',
    });
    writeToolbarItemContext(element, {
      orientation: 'horizontal',
      edge: 'top',
      variant: null,
      size: 'expanded',
    });
    expect(element.attributes.has(TOOLBAR_ITEM_CONTEXT_ATTRIBUTES.variant)).toBe(false);
    expect(element.attributes.get(TOOLBAR_ITEM_CONTEXT_ATTRIBUTES.edge)).toBe('top');
  });
});

describe('createSlottedEdges', () => {
  it("gives an element the edge of the slotted element it's in, else the main bar's", () => {
    const edges = createSlottedEdges();
    const slotted = fakeElement();
    const inside = fakeElement(fakeElement(slotted));
    let changes = 0;
    edges.subscribe(() => (changes += 1));
    expect(edges.edgeOf(inside)).toBe('top');

    edges.set(slotted, 'float-bottom');
    expect(edges.edgeOf(inside)).toBe('float-bottom');
    edges.set(slotted, 'float-bottom');
    expect(changes).toBe(1);
  });
});

describe('createPlacedComponents', () => {
  const button = (host: HTMLElement, command: string): PlacedComponent => ({
    kind: 'button',
    host,
    root: {} as ShadowRoot,
    command,
    icon: null,
    label: null,
  });

  it('keeps one entry per element, replaced in place, and says when it changes', () => {
    const placed = createPlacedComponents();
    const first = {} as HTMLElement;
    const second = {} as HTMLElement;
    let changes = 0;
    const stop = placed.subscribe(() => (changes += 1));

    placed.place(button(first, 'zoom:in'));
    placed.place(button(second, 'zoom:out'));
    placed.place(button(first, 'tool:pan'));
    expect(
      placed.list().map((component) => component.kind === 'button' && component.command),
    ).toEqual(['tool:pan', 'zoom:out']);

    placed.remove(first);
    placed.remove(first);
    expect(placed.list()).toHaveLength(1);
    expect(changes).toBe(4);
    stop();
    placed.remove(second);
    expect(changes).toBe(4);
  });
});
