/**
 * The engine's faces a part of a layer draws text in, mounted while it's
 * there (`@embedpdf/web`'s `createFontMounts`, one set per component).
 */
import { createFontMounts, type MountableFontProgram } from '@embedpdf/web';
import { onScopeDispose, toValue, watchEffect, type MaybeRefOrGetter } from 'vue';

export function useFontMounts(programs: MaybeRefOrGetter<readonly MountableFontProgram[]>): void {
  const mounts = createFontMounts();
  onScopeDispose(() => mounts.release());
  watchEffect(() => mounts.mount(toValue(programs)));
}
