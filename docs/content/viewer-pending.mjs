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
  index: {
    P2: 'the config keys the table shows: layout, disable, readOnly, theme.accent',
    T1: 'your accent color: theme.accent and the public --epdf-* tokens',
    I1: 'speaks the user language: the viewer ships English and Spanish',
  },
  'quick-start': {
    P2: 'theme.accent, disable and layout in the config',
    T1: 'the accent color',
    K1: 'a command with a label of its own',
    A1: 'your button reachable with the keyboard',
  },
  setup: {
    P2: 'theme.accent in the config',
    P7: 'shortcuts only in the viewer that has focus',
    P8: 'the browser floor the page states: Chrome and Edge 114, Firefox 125, Safari 17',
  },
  documents: {
    DOC1: 'documents entries with src, name, password and active',
    DOC3: 'a document that fails shows why in its tab, with Try again',
    DOC4: 'a warning before unsaved changes are lost',
    K3: 'your Mod+S wins over the built-in shortcut',
  },
  'self-hosting': {
    P10: 'the @embedpdf/viewer/portable entry for plain esbuild',
    F4: 'plugins.stamp.standard: the stamp library is stamps.defaultLibrary today',
  },
  'customize/commands': {
    K1: 'label directly, and functions that get get, viewer and documentId',
    K2: 'a command with a built-in id overrides only the fields it gives',
    K3: 'your shortcut wins over a built-in one with the same keys',
    K4: 'the ? shortcuts sheet',
    K5: 'icons as { paths, fill }, and a built-in name replaced',
    K7: 'the built-in commands the table lists',
  },
  'customize/menus': {
    L1: 'highlight, underline and strike out in the bar over selected text: it has Copy only',
    L14: 'the bar over a selection sits above it: today it sits below',
  },
  'customize/panels': {
    N4: 'the outline and attachments panels: the engine reads no outline, and no plugin lists the attached files',
    P7: 'Ctrl/Cmd+F for the search panel, once shortcuts reach only the viewer that has focus',
  },
  'customize/components': {
    K1: 'a command run that gets get, viewer and documentId, as the selected-text example writes it',
    T1: 'the viewer colors as --epdf-surface, --epdf-text and --epdf-border for your styles',
  },
  'customize/small-screens': {
    L7: 'the mode tabs as one dropdown on a phone: they shed behind a chevron instead',
  },
  'customize/theming': {
    T1: 'the public --epdf-* tokens and accent',
    T3: 'the parts the table lists',
  },
  'customize/translations': {
    I1: 'the thirteen languages and right-to-left: the viewer ships English and Spanish',
    I2: 'built-in labels keyed by their command id',
    P2: 'the config keys the page uses beyond strings and locale',
  },
  'features/index': {
    F1: 'the feature catalog matches the feature tree',
    F3: 'a feature code loads on first use',
  },
  'features/annotations': {
    F4: 'plugins.stamp.standard and quick',
  },
  'features/turning-off': {
    F1: 'the feature table matches the tree',
  },
  'features/forms-and-signatures': {
    F4: 'plugins.signature.kinds and fonts, and the default handwriting fonts',
    F5: 'the Form mode bar is form, and removing it keeps filling in',
    F6: 'form scripts with no network or window access, checked',
  },
  'code/plugins': {
    F4: 'viewer-only settings next to the plugin settings',
  },
  'concepts/how-it-works': {
    T3: 'the parts you reach with ::part()',
    F3: 'a feature code loads the first time someone uses it',
  },
  'concepts/security': {
    S7: 'no CI check loads every example under the policy yet',
    F6: 'link schemes, scripts without network, no certificate fetches, comments as text: unchecked',
  },
};
