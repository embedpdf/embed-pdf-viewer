/**
 * @embedpdf/plugin-link — the navigation plane of PDF link annotations.
 * Standard layout: types.ts · reducer.ts · source.ts · capability.ts ·
 * effects.ts · link.plugin.ts.
 *
 * Two planes, one subtype: THIS plugin owns clicking links (per-page
 * clickable areas + `activate()`: GoTo → stage reveal via
 * `destinationToReveal`, URI → the framework opener, everything
 * executable-shaped reported but never executed). The ANNOTATION plugin owns
 * authoring them (the `link` prop through the one `setProps` path). The
 * active tool's `link-nav` tag decides which plane owns a click.
 */
export { linkPlugin } from './link.plugin';
export { LinkToken } from './types';
export type {
  LinkActivation,
  LinkActivateEvent,
  LinkCapability,
  LinkNavItem,
  LinkPluginConfig,
  LinkState,
  PdfDestination,
  PdfLinkTarget,
} from './types';
