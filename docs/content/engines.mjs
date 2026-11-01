/**
 * The engine-flavor manifest (docs/conventions/docs-architecture.md): everything the
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
    // The ready-made viewer: its packages (`@embedpdf/viewer`, and `-react`,
    // `-vue`, `-svelte`, `-angular` after it), the CDN script a plain HTML
    // page loads, and the name that script's default export goes by. The
    // component names are the same in both flavors.
    viewer: {
      package: '@embedpdf/viewer',
      cdnScript: 'https://cdn.jsdelivr.net/npm/@embedpdf/viewer@3/dist/embedpdf.js',
      defaultImport: 'EmbedPDF',
    },
  },
  cloud: {
    package: '@cloudpdf/engine',
    importLine: "import { cloudEngine } from '@cloudpdf/engine';",
    // CloudPDF SaaS, the engine's default, where the docs' demo documents live (grants
    // managed in the dashboard).
    factoryCall: 'cloudEngine()',
    // The document lives on the server; the stamp library still opens in the
    // browser, so the cloud sample carries a local engine for it.
    assetEngine: {
      importLine: "import { localEngine } from '@embedpdf/engine';",
      factoryCall: 'localEngine()',
    },
    // The same viewer with the cloud engine as its default (one viewer, two doors).
    viewer: {
      package: '@cloudpdf/viewer',
      cdnScript: 'https://cdn.jsdelivr.net/npm/@cloudpdf/viewer@3/dist/cloudpdf.js',
      defaultImport: 'CloudPDF',
    },
  },
};
