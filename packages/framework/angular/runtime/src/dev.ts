/**
 * Development-time guardrails. Each warning fires once (by key), says what is wrong and what to
 * do instead, and stays quiet in production builds (Angular's `isDevMode()`).
 */
import { isDevMode } from '@angular/core';

const warned = new Set<string>();

/** Warn once per key. Quiet in production. */
export function devWarn(key: string, message: string): void {
  if (!isDevMode() || warned.has(key)) return;
  warned.add(key);
  console.warn(`[embedpdf] ${message}`);
}

/** For tests: forget every warning, so one can fire again. */
export function resetDevWarnings(): void {
  warned.clear();
}
