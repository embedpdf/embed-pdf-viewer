// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';

import {
  claimClick,
  createFieldControlPress,
  fieldControlFor,
  fieldControlPlaceOf,
  isClickClaimed,
  runsActionOnClick,
} from '../src/form-controls';

/** A page layer at 2 pixels per point and 150% zoom, its top-left 10 pixels in, turned a quarter. */
const page = {
  toPixels: (point: { x: number; y: number }) => ({ x: 10 + point.x * 2, y: 10 + point.y * 2 }),
  rotation: 90,
  zoom: 1.5,
};

describe('which control draws a box', () => {
  const checkbox = { control: 'toggle', kind: 'checkbox' };
  const text = { control: 'text' };
  const toggles = { for: (widget: { control: string }) => widget.control === 'toggle' };
  const everything = { for: () => true };

  it('is the first one that matches', () => {
    expect(fieldControlFor(checkbox, [toggles, everything])).toBe(toggles);
    expect(fieldControlFor(text, [toggles, everything])).toBe(everything);
  });

  it('is none for a box no control matches, and without controls', () => {
    expect(fieldControlFor(text, [toggles])).toBeNull();
    expect(fieldControlFor(text, [])).toBeNull();
    expect(fieldControlFor(text, undefined)).toBeNull();
  });
});

describe("where a control of an app's own draws", () => {
  const upright = {
    box: { x: 100, y: 50, width: 40, height: 20 },
    rotation: 0,
    rect: { x: 100, y: 50, width: 40, height: 20 },
  };
  /** Turned a quarter: its frame's sides are its rect's, swapped, about the same middle. */
  const turned = {
    box: { x: 100, y: 50, width: 40, height: 20 },
    rotation: 90,
    rect: { x: 110, y: 40, width: 20, height: 40 },
  };

  it("hands the control the field's 100% size, its turn on screen and the zoom", () => {
    expect(fieldControlPlaceOf(upright, page).frame).toEqual({
      width: 80 / 1.5,
      height: 40 / 1.5,
      rotation: 90, // the page's turn
      scale: 1.5,
    });
    // A turned field adds its own quarter turn.
    expect(fieldControlPlaceOf(turned, page).frame.rotation).toBe(180);
  });

  it('draws the control at that size, scaled with the page from its corner', () => {
    expect(fieldControlPlaceOf(upright, page).frameStyle).toEqual({
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${80 / 1.5}px`,
      height: `${40 / 1.5}px`,
      transform: 'scale(1.5)',
      transformOrigin: '0 0',
    });
  });

  it("draws the layer's own control at the box's size on screen, the scale undone", () => {
    const place = fieldControlPlaceOf(upright, page);
    expect(place.nativeStyle).toMatchObject({
      width: '80px',
      height: '40px',
      transform: `scale(${1 / 1.5})`,
      transformOrigin: '0 0',
    });
    expect(place.nativeBox).toEqual({ left: 0, top: 0, width: 80, height: 40 });
  });

  it("fills the box with an upright widget's picture", () => {
    expect(fieldControlPlaceOf(upright, page).pictureStyle).toEqual({
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: '80px',
      height: '40px',
    });
  });

  it("puts a turned widget's picture where the widget stands, the box's turn undone", () => {
    // The box is 80 by 40 and turned 90; the widget stands 40 by 80, about the same middle.
    expect(fieldControlPlaceOf(turned, page).pictureStyle).toEqual({
      position: 'absolute',
      left: '20px',
      top: '-20px',
      width: '40px',
      height: '80px',
      transform: 'rotate(-90deg)',
    });
  });

  it('reads a widget without a turn as upright', () => {
    const place = fieldControlPlaceOf({ ...upright, rotation: null }, page);
    expect(place.pictureStyle.transform).toBeUndefined();
    expect(place.frame.rotation).toBe(90);
  });
});

describe("a click on a box and the widget's action", () => {
  it('runs it for every box but a signature field and a push button that takes no input', () => {
    const runs = (control: string, disabled = false) => runsActionOnClick({ control, disabled });
    expect(['text', 'toggle', 'choice', 'button'].map((control) => runs(control))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    // A read-only text field's action still runs, as in Acrobat.
    expect(runs('text', true)).toBe(true);
    expect(runs('button', true)).toBe(false);
    expect(runs('signature')).toBe(false);
  });

  it('writes the value first, then runs the action', async () => {
    const order: string[] = [];
    let written!: () => void;
    const write = vi.fn(
      (value: { checked: boolean }) =>
        new Promise<string>((resolve) => {
          written = () => {
            order.push(`wrote ${value.checked}`);
            resolve('applied');
          };
        }),
    );
    const press = createFieldControlPress(write, () => order.push('action'));
    const result = press.setValue({ checked: true });
    press.click();
    await Promise.resolve();
    expect(order).toEqual([]);
    written();
    await expect(result).resolves.toBe('applied');
    await Promise.resolve();
    expect(order).toEqual(['wrote true', 'action']);
  });

  it('runs the action after a write that fails, and at once for a click that writes nothing', async () => {
    const order: string[] = [];
    const press = createFieldControlPress(
      () => Promise.reject(new Error('refused')),
      () => order.push('action'),
    );
    press.click();
    await Promise.resolve();
    expect(order).toEqual(['action']);
    await expect(press.setValue(null)).rejects.toThrow('refused');
    press.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['action', 'action']);
  });

  it("a click the layer's own control dealt with is left alone", () => {
    const click = new MouseEvent('click');
    expect(isClickClaimed(click)).toBe(false);
    claimClick(click);
    expect(isClickClaimed(click)).toBe(true);
    expect(isClickClaimed(new MouseEvent('click'))).toBe(false);
  });
});
