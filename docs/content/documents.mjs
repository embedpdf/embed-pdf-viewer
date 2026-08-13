/**
 * The demo-document registry: which document each sample opens, per engine
 * flavor. A sample's source file carries the LOCAL form between
 * `// [!doc-source <key>]` markers; the sync generator swaps the whole block
 * for the flavor's form when emitting a cloud site's copy.
 *
 * Cloud share tokens reference live grants on engine.cloudpdf.com, managed
 * in the dashboard — revoking or editing a grant retargets every docs code
 * panel (and, later, live demo) at the next renewal.
 */
export const DEMO_DOCUMENTS = {
  ebook: {
    /** `const <name> = …` emitted for the cloud flavor. */
    cloudSource: (name) =>
      `const ${name}: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };`,
  },
};
