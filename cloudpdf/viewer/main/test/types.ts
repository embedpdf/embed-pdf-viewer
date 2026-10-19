/**
 * What `CloudPDF.init()` takes, checked by `pnpm typecheck`: every line marked
 * `@ts-expect-error` must fail to compile, or the check fails with an unused directive. The
 * framework wrappers' props are this config too.
 */
import type { InitOptions } from '../src/index';

const target = '#viewer';

export const options: InitOptions[] = [
  { target, src: { token: 'eyJ…' } },
  { target, src: { token: async () => 'eyJ…' } },
  { target, src: { shareToken: 'shr_…', sharePassword: 'secret' } },
  { target, src: { id: 'contract-42' }, engine: { token: 'eyJ…' } },
  { target, src: { token: 'eyJ…' }, engine: { baseUrl: 'https://pdf.example.com' } },
  { target, documents: [{ src: { token: 'eyJ…' }, name: 'Contract', active: true }] },
  // @ts-expect-error A cloud document is named by its token, id or share link, not by URL.
  { target, src: '/report.pdf' },
  // @ts-expect-error Where the engine connects is the engine's: `engine: { baseUrl }`.
  { target, baseUrl: 'https://pdf.example.com' },
  // @ts-expect-error The token says who the user is and what they may do.
  { target, identity: { displayName: 'Ada' } },
];
