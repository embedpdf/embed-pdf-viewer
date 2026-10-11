import { describe, expect, it, vi } from 'vitest';

import { pictureOrPainting, type LookState } from '../src/picture-or-painting';

const picture = { url: 'blob:picture', box: { x: 0, y: 0, width: 10, height: 10 }, version: 3 };
const look = (patch: Partial<LookState<string>>): LookState<string> => ({
  pending: false,
  picture,
  version: 3,
  loaded: true,
  paint: () => 'painting',
  ...patch,
});

describe('pictureOrPainting', () => {
  it('shows the picture while it is of the item’s version and nothing is pending', () => {
    const paint = vi.fn(() => 'painting');
    expect(pictureOrPainting(look({ paint }))).toEqual({ kind: 'picture', picture });
    // It never asks for the live drawing then.
    expect(paint).not.toHaveBeenCalled();
  });

  it('draws live while pending, and while the picture is of another version', () => {
    const painted = { kind: 'painting', painting: 'painting' };
    expect(pictureOrPainting(look({ pending: true }))).toEqual(painted);
    expect(pictureOrPainting(look({ version: 4 }))).toEqual(painted);
  });

  it('keeps the newest picture there is for an item with no live drawing, and nothing without one', () => {
    expect(pictureOrPainting(look({ version: 4, paint: () => null }))).toEqual({
      kind: 'picture',
      picture,
    });
    expect(pictureOrPainting(look({ pending: true, picture: null, paint: () => null }))).toBeNull();
  });

  it('draws only what is pending until the page has loaded its pictures', () => {
    const paint = vi.fn(() => 'painting');
    expect(pictureOrPainting(look({ loaded: false, picture: null, paint }))).toBeNull();
    expect(paint).not.toHaveBeenCalled();
    expect(pictureOrPainting(look({ loaded: false, picture: null, pending: true }))).toEqual({
      kind: 'painting',
      painting: 'painting',
    });
  });
});
