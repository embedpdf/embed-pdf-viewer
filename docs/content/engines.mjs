/**
 * The engine-flavor manifest (DOCS-PLATFORM-ARCHITECTURE.md): everything the
 * sync generator substitutes when it emits a site's copy of a sample.
 * "Fork what teaches, template what provisions" — these lines ARE the
 * provisioning, so they are defined once, here, never per sample.
 */
export const ENGINES = {
  local: {
    package: '@embedpdf/engine',
    importLine: "import { localEngine } from '@embedpdf/engine';",
    // The CALL is the swap unit (not a whole statement) so every framework's
    // binding shape works: `const engine = …`, Angular's `readonly engine = …`.
    factoryCall: 'localEngine()',
    // Stamp libraries are PDFs opened in the browser (`// [!asset-engine]`
    // block): on the local flavor the ONE engine does both jobs.
    assetEngine: { importLine: null, factoryCall: 'engine' },
  },
  cloud: {
    package: '@cloudpdf/engine',
    importLine: "import { cloudEngine } from '@cloudpdf/engine';",
    // The docs demo deployment (live; share grants managed in the dashboard).
    factoryCall: "cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' })",
    // The document lives on the server; the stamp library still opens in the
    // browser, so the cloud sample carries a local engine for it.
    assetEngine: {
      importLine: "import { localEngine } from '@embedpdf/engine';",
      factoryCall: 'localEngine()',
    },
  },
};
