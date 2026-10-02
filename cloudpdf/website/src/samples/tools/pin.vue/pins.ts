import type { PageRef } from '@embedpdf/vue/runtime';

// A pin, where it was dropped: its page, and a point in page coordinates.
export interface Pin {
  readonly id: number;
  readonly page: PageRef;
  readonly point: { readonly x: number; readonly y: number };
}
