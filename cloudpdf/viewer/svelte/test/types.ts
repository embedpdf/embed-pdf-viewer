/**
 * What `<CloudPDFViewer>` takes, checked by `pnpm typecheck`: every line marked
 * `@ts-expect-error` must fail to compile, or the check fails with an unused directive.
 */
import type { ComponentProps } from 'svelte';
import type { CloudPDFViewer } from '../src';

type Props = ComponentProps<typeof CloudPDFViewer>;

const baseUrl = 'https://api.cloudpdf.com';

export const props: Props[] = [
  { baseUrl, src: { token: 'eyJ…' }, style: 'height: 100vh' },
  { baseUrl, src: { token: async () => 'eyJ…' } },
  { baseUrl, src: { shareToken: 'shr_…' }, theme: 'dark', onready: (viewer) => viewer.documents },
  { baseUrl, src: { id: 'contract-42' } },
  { baseUrl, documents: [{ src: { token: 'eyJ…' }, name: 'Contract', active: true }] },
  // @ts-expect-error The cloud connection is required.
  { src: { id: 'contract-42' } },
  // @ts-expect-error A cloud document is named by its token, id or share link, not by URL.
  { baseUrl, src: '/report.pdf' },
  // @ts-expect-error Nor by a URL in `documents`.
  { baseUrl, documents: [{ src: '/report.pdf' }] },
  // @ts-expect-error The document is `src`: there is no `docToken`.
  { baseUrl, docToken: 'eyJ…' },
  // @ts-expect-error The token says who the user is and what they may do.
  { baseUrl, scope: ['document:read'] },
  // @ts-expect-error This door supplies the engine.
  { baseUrl, engine: () => null },
];
