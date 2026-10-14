/**
 * `#inline-transport` (`package.json` `imports`): the engine host and PDFium's runtime in this
 * thread. A browser gets the self-contained `workers/inline-transport.js` (from
 * `src/transport/inline-browser.ts`), Node `workers/inline-transport.node.js` (from
 * `src/transport/InlineTransport.ts`), both built by `scripts/build-workers.mjs`. This
 * declaration lets the package typecheck before its own build has run.
 */
declare module '#inline-transport' {
  export const createInlineTransport: typeof import('../transport/inline-browser').createInlineTransport;
}
