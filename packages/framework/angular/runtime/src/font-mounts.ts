/**
 * The engine's faces a part of a template draws text in, mounted while it's there
 * (`@embedpdf/web`'s `createFontMounts`, one set per caller).
 */
import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, effect, inject, PLATFORM_ID } from '@angular/core';
import { createFontMounts, type MountableFontProgram } from '@embedpdf/web';

/**
 * Mount `programs()` while the caller lives, again when they change. Call it in an injection
 * context; on the server it does nothing.
 */
export function injectFontMounts(programs: () => readonly MountableFontProgram[]): void {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
  const mounts = createFontMounts();
  inject(DestroyRef).onDestroy(() => mounts.release());
  effect(() => mounts.mount(programs()));
}
