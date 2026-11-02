/**
 * The engine's faces a part of a layer draws text in, mounted while it's there (`@embedpdf/web`'s
 * `createFontMounts`, one set per component). Call it while a component is created.
 */
import { createFontMounts, type MountableFontProgram } from '@embedpdf/web';
import { valueOf, type MaybeGetter } from './values.svelte';

export function useFontMounts(programs: MaybeGetter<readonly MountableFontProgram[]>): void {
  const mounts = createFontMounts();
  $effect(() => () => mounts.release());
  $effect(() => {
    mounts.mount(valueOf(programs));
  });
}
