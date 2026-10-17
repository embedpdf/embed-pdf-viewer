/**
 * The engine's faces a part of a layer draws text in, mounted while it's
 * there (`@embedpdf/web`'s `createFontMounts`, one set per component).
 */
import { createFontMounts, type MountableFontProgram } from '@embedpdf/web';
import { useEffect, useState } from 'react';

export function useFontMounts(programs: readonly MountableFontProgram[]): void {
  const [mounts] = useState(() => createFontMounts());
  useEffect(() => () => mounts.release(), [mounts]);
  useEffect(() => mounts.mount(programs));
}
