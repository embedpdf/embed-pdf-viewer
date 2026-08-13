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
    factoryLine: 'const engine = localEngine();',
  },
  cloud: {
    package: '@cloudpdf/engine',
    importLine: "import { cloudEngine } from '@cloudpdf/engine';",
    // The docs demo deployment (live; share grants managed in the dashboard).
    factoryLine: "const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });",
  },
};
