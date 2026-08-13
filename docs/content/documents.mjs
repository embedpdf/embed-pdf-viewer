/**
 * The demo-document registry: which document each sample opens, per engine
 * flavor. A sample's source file carries the LOCAL form between
 * `// [!doc-source <key>]` markers; the sync generator swaps the whole block
 * for the flavor's form when emitting a cloud site's copy.
 *
 * Cloud share tokens reference grants on the docs demo tenant. Until the
 * seeding step provisions that tenant (phase 3 follow-up), the tokens are
 * placeholders — typechecked as ordinary strings, resolved at seed time.
 */
export const DEMO_DOCUMENTS = {
  ebook: {
    /** `const <name> = …` emitted for the cloud flavor. */
    cloudSource: (name) =>
      `const ${name}: OpenInput = { kind: 'share', shareToken: 'shr_demo_ebook' };`,
  },
};
