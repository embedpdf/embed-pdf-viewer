import type { PageRef } from '@embedpdf/vue/runtime';

export const COLORS = ['#e5484d', '#2f80ed', '#30a46c', '#1a2748'];

// A pen in the current color, with its tip at the bottom left.
export const penIcon = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="M3 21l1.6-5.6L16.2 3.8a2.2 2.2 0 0 1 3.1 3.1L7.7 18.5z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;

export interface Dot {
  readonly id: number;
  readonly page: PageRef;
  readonly point: { readonly x: number; readonly y: number };
  readonly color: string;
}
