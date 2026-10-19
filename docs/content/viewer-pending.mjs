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
  'customize/panels': {
    N4: 'the attachments panel: no plugin lists the attached files',
  },
};
