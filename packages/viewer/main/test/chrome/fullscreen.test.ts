/**
 * Full Screen's choices: which way the viewer fills the screen on a page, and when its command
 * shows, shows as pressed and which icon it draws. What it does in a browser is in
 * `test/fullscreen.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import { FULLSCREEN_COMMAND, fullscreenCommandOf } from '../../../chrome/src/config/fullscreen';
import { fullscreenWayOf, type FullscreenState } from '../../../chrome/src/ui/fullscreen';

describe('fullscreenWayOf', () => {
  it("takes the browser's full screen wherever the page may use it, a frame too", () => {
    expect(fullscreenWayOf({ screen: true, topLevel: true, popover: true })).toBe('screen');
    expect(fullscreenWayOf({ screen: true, topLevel: false, popover: false })).toBe('screen');
  });

  it('fills the window of a page of its own without it, as on an iPhone', () => {
    expect(fullscreenWayOf({ screen: false, topLevel: true, popover: true })).toBe('window');
  });

  it('has no way in a frame that may not go full screen, or without popovers', () => {
    expect(fullscreenWayOf({ screen: false, topLevel: false, popover: true })).toBeNull();
    expect(fullscreenWayOf({ screen: false, topLevel: true, popover: false })).toBeNull();
  });
});

describe('the Full Screen command', () => {
  const box = {} as HTMLElement;
  const command = (state: FullscreenState, coversWindow = false) =>
    fullscreenCommandOf(box, state, coversWindow);
  const context = {} as Parameters<NonNullable<ReturnType<typeof command>['visible']>>[0];

  it('is view:fullscreen, labeled from the language packs', () => {
    const resolved = command({ way: 'screen', current: null });
    expect(resolved.id).toBe(FULLSCREEN_COMMAND);
    expect(resolved.id).toBe('view:fullscreen');
    expect(resolved.labelKey).toBe('commands.fullscreen');
  });

  it("shows wherever the browser's full screen is there, even when the viewer is the whole window", () => {
    expect(command({ way: 'screen', current: null }, true).visible!(context)).toBe(true);
  });

  it('shows with only the window to fill while the viewer is smaller than the window', () => {
    expect(command({ way: 'window', current: null }, false).visible!(context)).toBe(true);
    expect(command({ way: 'window', current: null }, true).visible!(context)).toBe(false);
    // Filling the window, it covers the window, and stays there to end it.
    expect(command({ way: 'window', current: 'window' }, true).visible!(context)).toBe(true);
  });

  it('hides where the viewer has no way to fill the screen', () => {
    expect(command({ way: null, current: null }).visible!(context)).toBe(false);
  });

  it('shows as pressed, with the exit icon, while the viewer fills the screen either way', () => {
    const idle = command({ way: 'screen', current: null });
    expect([idle.active!(context), idle.icon]).toEqual([false, 'fullscreen']);
    for (const current of ['screen', 'window'] as const) {
      const filling = command({ way: 'screen', current });
      expect([filling.active!(context), filling.icon]).toEqual([true, 'fullscreenExit']);
    }
  });
});
