/**
 * What `<CloudPDFViewer>` takes, checked by `pnpm typecheck`: every line marked
 * `@ts-expect-error` must fail to compile, or the check fails with an unused directive.
 */
import type { ComponentProps } from 'svelte';
import type { CloudPDFViewer } from '../src';

type Props = ComponentProps<typeof CloudPDFViewer>;

const baseUrl = 'https://api.cloudpdf.com';

export const props: Props[] = [
  { baseUrl, docToken: 'eyJ…', style: 'height: 100vh' },
  { baseUrl, shareToken: 'shr_…', theme: 'dark', onready: (viewer) => viewer.documents },
  // @ts-expect-error The cloud connection is required.
  { docId: 'contract-42' },
  // @ts-expect-error A cloud document is named by its token or id, not by URL.
  { baseUrl, src: '/report.pdf' },
  // @ts-expect-error The token says who the user is and what they may do.
  { baseUrl, scope: ['document:read'] },
  // @ts-expect-error This door supplies the engine.
  { baseUrl, engine: () => null },
];
