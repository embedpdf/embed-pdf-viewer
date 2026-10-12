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
    L7: 'the phone layout: panels and menus as sheets',
    P2: 'the config keys the table shows: layout, disable, readOnly, theme.accent',
    T1: 'your accent color: theme.accent and the public --epdf-* tokens',
    I1: 'speaks the user language: the viewer ships English and Spanish',
    A1: 'works with a keyboard and a screen reader: the toolbars and menus do, panels and dialogs not yet',
    H3: 'the headless hooks inside your own components',
  },
  'quick-start': {
    P2: 'theme.accent, disable and layout in the config',
    T1: 'the accent color',
    K1: 'a command with a label of its own',
    C1: 'a slot for your own toolbar item',
    C4: 'ToolbarItem in each framework',
    A1: 'your button reachable with the keyboard',
  },
  setup: {
    P2: 'plugins and theme.accent in the config',
    P3: 'ViewerConfig, and every key typed, from every framework package',
    P6: 'every framework package safe to import on the server',
    P7: 'shortcuts only in the viewer that has focus',
    P8: 'the browser floor the page states: Chrome and Edge 114, Firefox 125, Safari 17',
  },
  documents: {
    DOC1: 'documents entries with src, name, password and active',
    DOC2: 'drop a PDF, or Open in the document menu, to open it as a tab',
    DOC3: 'a document that fails shows why in its tab, with Try again',
    DOC4: 'a warning before unsaved changes are lost',
    K3: 'your Mod+S wins over the built-in shortcut',
  },
  'self-hosting': {
    P2: 'engine.fonts in the inventory: fonts are annotations.fonts today',
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
    L8: 'menus as sheets on a phone, with submenus sliding in over them',
    L14: 'the bar over a selection sits above it: today it sits below',
    C3: 'Menu and MenuItem for your own menu',
  },
  'customize/panels': {
    N1: 'panels in the layout: addPanel, panel, removePanel',
    N2: 'dock, overlay and sheet',
    N3: 'a docked panel width you drag, remembered',
    N4: 'the outline and attachments panels',
    N5: 'the header switches between panels on one side',
    R1: 'a panel whose feature is turned off is gone',
    A1: 'overlays and sheets take and return focus',
  },
  'customize/components': {
    C1: 'slots item:<id>, panel:<id> and the header, footer, tabs and empty regions',
    C2: 'useToolbarItem() and the data-* attributes on your element',
    C3: 'Button, Menu and MenuItem, and their elements for plain HTML',
    C4: 'ToolbarItem, Panel and Region in each framework',
    C5: 'your item in the toolbar keyboard order',
    H3: 'the headless hooks inside the viewer',
    P3: 'useCommand and the components exported from every framework package',
  },
  'customize/small-screens': {
    L7: 'the phone layout, 44 px touch targets, and keeping clear of the notch and home bar',
    L8: 'menus as sheets on a phone',
    N2: 'sheets with a handle, drag to close, list sheets that close on pick',
  },
  'customize/theming': {
    T1: 'the public --epdf-* tokens and accent',
    T3: 'the parts the table lists',
  },
  'customize/translations': {
    I1: 'the thirteen languages and right-to-left: the viewer ships English and Spanish',
    I2: 'built-in labels keyed by their command id',
    I3: 'titleKey for panels and mode bars',
    P2: 'the config keys the page uses beyond strings and locale',
  },
  'features/index': {
    F1: 'the feature catalog matches the feature tree',
    F3: 'a feature code loads on first use',
    P2: 'plugins and identity in the config',
  },
  'features/annotations': {
    P2: 'plugins.annotation, engine.fonts and the other plugin settings',
    F4: 'plugins.stamp.standard and quick',
  },
  'features/turning-off': {
    F1: 'the feature table matches the tree',
  },
  'features/forms-and-signatures': {
    P2: 'plugins.form and plugins.signature',
    F4: 'plugins.signature.kinds and fonts, and the default handwriting fonts',
    F5: 'the Form mode bar is form, and removing it keeps filling in',
    F6: 'form scripts with no network or window access, checked',
  },
  'code/viewer': {
    H5: 'usePDFViewer() and the Viewer type',
    P2: 'onReady and onDocumentChange on the Vue, Svelte and Angular wrappers, which do not exist yet',
    H6: 'after unmount, listeners stop and calls reject',
  },
  'code/plugins': {
    P2: 'plugins in the config',
    H3: 'the headless hooks inside your own components',
    H4: 'a plugin of your own in plugins',
    F4: 'viewer-only settings next to the plugin settings',
  },
  'concepts/how-it-works': {
    A1: 'labeled panels, and dialogs that trap focus, as the Accessibility section says',
    C1: 'slots for your components: item, panel and the regions',
    H3: 'your components inside the viewer use the headless hooks',
    T3: 'the parts you reach with ::part()',
    F3: 'a feature code loads the first time someone uses it',
    P6: 'the wrapper renders an empty element on the server',
  },
  'concepts/security': {
    S7: 'no CI check loads every example under the policy yet',
    F6: 'link schemes, scripts without network, no certificate fetches, comments as text: unchecked',
    P2: 'plugins.actions in the config',
  },
};
