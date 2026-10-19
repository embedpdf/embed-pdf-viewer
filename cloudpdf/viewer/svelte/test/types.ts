/**
 * What the cloud `<PDFViewer>` takes, checked by `pnpm typecheck`: every line marked
 * `@ts-expect-error` must fail to compile, or the check fails with an unused directive.
 */
import type { ComponentProps } from 'svelte';
import type { PDFViewer } from '../src';

type Props = ComponentProps<typeof PDFViewer>;

export const props: Props[] = [
  { src: { token: 'eyJ…' }, style: 'height: 100vh' },
  { src: { token: async () => 'eyJ…' } },
  { src: { shareToken: 'shr_…' }, theme: 'dark', onready: (viewer) => viewer.documents },
  { src: { id: 'contract-42' }, engine: { token: 'eyJ…' } },
  { src: { token: 'eyJ…' }, engine: { baseUrl: 'https://pdf.example.com' } },
  { documents: [{ src: { token: 'eyJ…' }, name: 'Contract', active: true }] },
  // @ts-expect-error A cloud document is named by its token, id or share link, not by URL.
  { src: '/report.pdf' },
  // @ts-expect-error Nor by a URL in `documents`.
  { documents: [{ src: '/report.pdf' }] },
  // @ts-expect-error The document is `src`: there is no `docToken`.
  { docToken: 'eyJ…' },
  // @ts-expect-error Where the engine connects is the engine's: `engine: { baseUrl }`.
  { baseUrl: 'https://pdf.example.com' },
  // @ts-expect-error The token says who the user is and what they may do.
  { scope: ['document:read'] },
  // @ts-expect-error An engine is an engine, its settings, or a function that makes one.
  { engine: () => null },
];
