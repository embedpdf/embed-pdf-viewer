import { describe, expect, it, vi } from 'vitest';
import { pageLayersOf, partsDrawnTwice, pictureLayerOptionsOf } from '../src/page-layers';

const tick = () => Promise.resolve();

describe('page layers', () => {
  it('keeps each page apart, and one object per page', () => {
    const a = {};
    const b = {};
    expect(pageLayersOf(a)).toBe(pageLayersOf(a));
    pageLayersOf(a).paint('annotations');
    expect(pageLayersOf(a).painted().annotations).toBe(true);
    expect(pageLayersOf(b).painted().annotations).toBe(false);
  });

  it('counts painters: a part is painted until the last one leaves', () => {
    const layers = pageLayersOf({});
    const first = layers.paint('formFields');
    const second = layers.paint('formFields');
    first();
    first();
    expect(layers.painted().formFields).toBe(true);
    second();
    expect(layers.painted().formFields).toBe(false);
  });

  it('answers with the same object for the same answer', () => {
    const layers = pageLayersOf({});
    const before = layers.painted();
    const release = layers.paint('annotations');
    const during = layers.painted();
    expect(during).not.toBe(before);
    layers.paint('annotations');
    expect(layers.painted()).toBe(during);
    release();
    expect(layers.painted()).toBe(during);
    // A layer that leaves and comes back gives the same answer as before.
    const again = layers.paint('formFields');
    const both = layers.painted();
    again();
    layers.paint('formFields');
    expect(layers.painted()).toBe(both);
    expect(pageLayersOf({}).painted()).toBe(before);
  });

  it('tells subscribers a microtask later, once per batch of changes', async () => {
    const layers = pageLayersOf({});
    const listener = vi.fn();
    const unsubscribe = layers.subscribe(listener);
    const release = layers.paint('annotations');
    layers.paint('formFields');
    expect(listener).not.toHaveBeenCalled();
    await tick();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    release();
    await tick();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('pictureLayerOptionsOf', () => {
  const nothing = { annotations: false, formFields: false };
  const both = { annotations: true, formFields: true };
  const reader = { annotations: true, formFields: true };

  it('draws each part nobody paints, when the user may read it', () => {
    expect(pictureLayerOptionsOf(nothing, {}, reader)).toEqual({
      includeAnnotations: true,
      includeFormFields: true,
    });
    expect(pictureLayerOptionsOf(nothing, {}, { annotations: false, formFields: true })).toEqual({
      includeAnnotations: false,
      includeFormFields: true,
    });
  });

  it('leaves out what a layer on the page paints, and still draws the other part', () => {
    expect(pictureLayerOptionsOf(both, {}, reader)).toEqual({
      includeAnnotations: false,
      includeFormFields: false,
    });
    expect(pictureLayerOptionsOf({ annotations: true, formFields: false }, {}, reader)).toEqual({
      includeAnnotations: false,
      includeFormFields: true,
    });
  });

  it('lets the props decide', () => {
    expect(pictureLayerOptionsOf(both, { annotations: true }, reader)).toEqual({
      includeAnnotations: true,
      includeFormFields: false,
    });
    expect(pictureLayerOptionsOf(nothing, { formFields: false }, reader)).toEqual({
      includeAnnotations: true,
      includeFormFields: false,
    });
  });

  it('names what the props draw twice', () => {
    expect(partsDrawnTwice(both, { annotations: true, formFields: false })).toEqual([
      'annotations',
    ]);
    expect(partsDrawnTwice(nothing, { annotations: true, formFields: true })).toEqual([]);
  });
});
