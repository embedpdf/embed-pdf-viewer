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
  { target, src: { grant: 'grt_…', passphrase: 'secret' } },
  { target, src: { id: 'contract-42' }, engine: { token: 'eyJ…' } },
  { target, src: { token: 'eyJ…' }, engine: { baseUrl: 'https://pdf.example.com' } },
  { target, documents: [{ src: { token: 'eyJ…' }, name: 'Contract', active: true }] },
  // Who the page knows the user is: a grant takes it as the visitor's answers.
  { target, src: { grant: 'grt_…' }, identity: { displayName: 'Ada' } },
  // @ts-expect-error A cloud document is named by its token, id or grant, not by URL.
  { target, src: '/report.pdf' },
  // @ts-expect-error Where the engine connects is the engine's: `engine: { baseUrl }`.
  { target, baseUrl: 'https://pdf.example.com' },
  // @ts-expect-error The token says what the user may do.
  { target, scope: ['doc.open'] },
  // @ts-expect-error A grant's answers are the viewer's `identity`.
  { target, src: { grant: 'grt_…', visitor: { displayName: 'Ada' } } },
];
