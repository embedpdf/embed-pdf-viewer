/**
 * The docs-kit theme contract.
 *
 * Kit components style themselves with these CSS variables plus literal
 * values that are deliberately brand-shared (the dark code shell, the HTTP
 * method colours, status tints). Each site defines the variables once in its
 * global stylesheet, mapping its own palette onto the contract:
 *
 * ```css
 * :root {
 *   --dk-accent:          #0876FD;  // brand action colour (links, active states)
 *   --dk-heading:         #07204C;  // headings, strong text
 *   --dk-muted:           #5A6B92;  // secondary text
 *   --dk-border:          #E6EAF2;  // card / table borders
 *   --dk-accent-surface:  #ECF2FE;  // tinted chip / icon backgrounds
 * }
 * ```
 *
 * Hook classes such as `.dk-dark-scroll` (dark code panes' scrollbars) get
 * their baseline from the kit's own stylesheet — import it once per site:
 * `@import '@embedpdf/docs-kit/styles.css';` — and override after the
 * import if a brand ever needs to.
 *
 * Adding a variable to this contract is an API change: document it here and
 * set a value in BOTH sites' globals in the same commit.
 */
export const DOCS_KIT_TOKENS = [
  '--dk-accent',
  '--dk-heading',
  '--dk-muted',
  '--dk-border',
  '--dk-accent-surface',
] as const;

export type DocsKitToken = (typeof DOCS_KIT_TOKENS)[number];
