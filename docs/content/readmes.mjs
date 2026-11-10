/**
 * The packages whose README is written from the docs (`scripts/readmes.mjs`;
 * docs/conventions/docs-architecture.md, "Package READMEs").
 *
 * Each entry names the page the README is cut from, under `docs/content` and as its sidebar
 * routes it (`headless/quick-start`). `framework` is the framework the page is shown for: one of
 * the four on a headless page, those or `vanilla` on a viewer page, none on an engine page.
 * `section` names a `##` section of the page by its heading; the README then shows that section
 * in place of the page's opening.
 *
 * An `@embedpdf/*` package gets embedpdf.com's form of the page and its code, a `@cloudpdf/*`
 * package cloudpdf.com's.
 */
export const READMES = {
  '@embedpdf/react': { page: 'headless/quick-start', framework: 'react' },
};
