'use client';

import type { LocalEngine } from '@embedpdf/engine';
import { useEffect } from 'react';

let engine: Promise<LocalEngine> | null = null;

/**
 * The engine every tool page shares: PDFium in a worker on this device, so no file leaves it.
 * Loaded the first time a tool needs it (the page itself ships without it) and kept for the
 * visit, so the next tool finds it warm.
 */
export function toolEngine(): Promise<LocalEngine> {
  return (engine ??= import('@embedpdf/engine').then(({ localEngine }) => localEngine()));
}

/**
 * Load and start the engine once the page is idle, so a file dropped a moment later doesn't
 * wait for it. The drop zone works before then: a dropped file just waits for the engine.
 */
export function useWarmEngine(): void {
  useEffect(() => {
    const warm = () => void toolEngine().then((ready) => ready.warmup());
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(warm, 300);
    return () => window.clearTimeout(handle);
  }, []);
}
