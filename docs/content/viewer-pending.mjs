/**
 * What holds a viewer page back once its code compiles: the behavior its prose promises that the
 * viewer doesn't have yet, by the id of the gap in the viewer's list of what's left, each with why.
 * A page with any entry stays "coming" for every framework, plain HTML included
 * (`scripts/publish-gate.mjs`), as a headless page does with a `pending` name in `reference.mjs`.
 *
 * Keyed by the page under `viewer/` (`customize/layout`). Remove an entry when the viewer does what
 * the page says; the publish gate fails on a page that doesn't exist or an entry with no reason.
 */
export const VIEWER_PENDING = {
  'quick-start': {
    A1: 'your button reachable with the keyboard',
  },
  setup: {
    P8: 'the browser floor the page states: Chrome and Edge 114, Firefox 125, Safari 17',
  },
  'self-hosting': {
    P10: 'the @embedpdf/viewer/portable entry for plain esbuild',
  },
  'customize/panels': {
    N4: 'the outline and attachments panels: the engine reads no outline, and no plugin lists the attached files',
  },
  'customize/translations': {
    P2: 'the config keys the page uses beyond strings and locale',
  },
  'features/index': {
    F3: 'a read viewer never loads a feature, the page says: its panels and dialogs are fetched in the background once the document shows, and the annotation tools start with the viewer',
  },
  'concepts/how-it-works': {
    F3: 'a read viewer never loads the form builder, the signature dialogs or the annotation tools, the page says: panels and dialogs are fetched in the background once the document shows, and the annotation tools start with the viewer',
  },
  'concepts/security': {
    S7: 'no CI check loads every example under the policy yet',
    F6: 'links open only http, https and mailto, the page says: tel links open too',
  },
};
