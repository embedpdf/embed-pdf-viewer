/**
 * The `--epdf-*` CSS variables that theme EmbedPDF, and the CSS value each
 * painted part uses. Every paint setting (a color, a line width, a dash, a
 * shadow, an opacity) can also come from a variable, and any variable wins over
 * any setting: a part looks for its own variable, then the variables of the
 * parts its default follows (another part, its plugin's accent, the viewer's
 * accent), and only then uses its setting's value. Parts you style yourself
 * have no setting, only a variable and a built-in look.
 *
 * {@link EPDF_VARIABLES} is plain data with no imports, so a script can read the
 * list without a browser.
 */

/**
 * A part other parts' defaults follow: an accent, or a part whose setting is
 * another part's default, such as the handles the rotation handle looks like.
 */
export type EpdfFollowedVariable =
  | 'accent'
  | 'annotation-accent'
  | 'annotation-handle-fill'
  | 'annotation-handle-stroke';

/** One themable part, named by its variable without the `--epdf-` prefix. */
export interface EpdfVariableDefinition {
  /**
   * The setting the variable overrides, as `<plugin>.<path>`: `viewer.` for the
   * viewer's own settings, `[]` for every entry of a list. Absent for a part you
   * style yourself, which only has CSS.
   */
  readonly setting?: string;
  /**
   * The part whose setting is this part's default, looked up right after the
   * part's own variable, and followed in turn: the rotation handle's stroke
   * follows the handles' stroke, which follows the annotation accent, which
   * follows the viewer's. So `--epdf-annotation-handle-stroke` reaches the
   * rotation handle before any accent does.
   */
  readonly follows?: EpdfFollowedVariable;
  /** A translucent default, the accent it follows at this percent: see {@link mixAccent}. */
  readonly accentPercent?: number;
  /**
   * The CSS value of each keyword, for a setting that takes keywords instead of
   * a CSS value.
   */
  readonly keywords?: Readonly<Record<string, string>>;
  /** What the part paints when neither its setting nor a variable is set. */
  readonly default: string;
}

/**
 * A dash variable holds an SVG dash array, while its setting says `'solid'` or
 * `'dashed'`: solid has no dashes, and dashed is 4 pixels on, 3 off.
 */
const DASH_KEYWORDS = { solid: 'none', dashed: '4 3' } as const;

/** Every theming variable, in the order the theming page lists them. */
export const EPDF_VARIABLES = {
  // ── the viewer ──
  accent: { setting: 'viewer.accent', default: '#3858e9' },
  'page-background': { setting: 'viewer.page.background', default: '#ffffff' },
  'page-shadow': { setting: 'viewer.page.shadow', default: '0 6px 18px rgb(0 0 0 / 0.18)' },

  // ── annotations: annotationPlugin({ chrome }) and each tool ──
  'annotation-accent': {
    setting: 'annotation.chrome.accent',
    follows: 'accent',
    default: '#3858e9',
  },
  'annotation-outline': {
    setting: 'annotation.chrome.outline.color',
    follows: 'annotation-accent',
    default: '#3858e9',
  },
  'annotation-outline-width': { setting: 'annotation.chrome.outline.width', default: '1' },
  'annotation-outline-dash': {
    setting: 'annotation.chrome.outline.style',
    keywords: DASH_KEYWORDS,
    default: 'none',
  },
  'annotation-handle-fill': { setting: 'annotation.chrome.handles.fill', default: '#ffffff' },
  'annotation-handle-stroke': {
    setting: 'annotation.chrome.handles.stroke',
    follows: 'annotation-accent',
    default: '#3858e9',
  },
  'annotation-rotation-handle-fill': {
    setting: 'annotation.chrome.rotationHandle.fill',
    follows: 'annotation-handle-fill',
    default: '#ffffff',
  },
  'annotation-rotation-handle-stroke': {
    setting: 'annotation.chrome.rotationHandle.stroke',
    follows: 'annotation-handle-stroke',
    default: '#3858e9',
  },
  'annotation-guide': { setting: 'annotation.chrome.guides.color', default: '#e91e63' },
  'annotation-rotation-guide': {
    setting: 'annotation.chrome.guides.rotationColor',
    follows: 'annotation-accent',
    default: '#3858e9',
  },
  'annotation-guide-width': { setting: 'annotation.chrome.guides.width', default: '1.5' },
  'annotation-guide-dash': {
    setting: 'annotation.chrome.guides.style',
    keywords: DASH_KEYWORDS,
    default: 'none',
  },
  'annotation-marquee-fill': {
    setting: 'annotation.chrome.marquee.fill',
    follows: 'annotation-accent',
    accentPercent: 8,
    default: 'color-mix(in srgb, #3858e9 8%, transparent)',
  },
  'annotation-marquee-stroke': {
    setting: 'annotation.chrome.marquee.stroke',
    follows: 'annotation-accent',
    default: '#3858e9',
  },
  'annotation-text-outline': {
    setting: 'annotation.chrome.textOutline',
    follows: 'annotation-accent',
    default: '#3858e9',
  },
  'readout-background': {
    setting: 'annotation.chrome.readout.background',
    default: 'rgb(0 0 0 / 0.8)',
  },
  'readout-color': { setting: 'annotation.chrome.readout.color', default: '#ffffff' },
  'ghost-opacity': { setting: 'annotation.tools[].ghost.opacity', default: '0.5' },

  // ── text selection: selectionPlugin({ color, handles }) ──
  'text-selection': {
    setting: 'selection.color',
    follows: 'accent',
    accentPercent: 35,
    default: 'color-mix(in srgb, #3858e9 35%, transparent)',
  },
  'text-selection-handle': {
    setting: 'selection.handles.color',
    follows: 'accent',
    default: '#3858e9',
  },
  'text-selection-handle-shadow': {
    setting: 'selection.handles.shadow',
    default: '0 1px 4px rgb(0 0 0 / 0.35)',
  },

  // ── search: searchPlugin({ highlight }) ──
  'search-highlight': { setting: 'search.highlight.color', default: '#ffd500' },
  'search-highlight-active': { setting: 'search.highlight.activeColor', default: '#ff9632' },
  'search-blend-mode': { setting: 'search.highlight.blendMode', default: 'multiply' },

  // ── forms: formPlugin({ focus, fields }) ──
  'form-focus': { setting: 'form.focus.color', follows: 'accent', default: '#3858e9' },
  'form-field-border': {
    setting: 'form.fields.border',
    follows: 'accent',
    accentPercent: 55,
    default: 'color-mix(in srgb, #3858e9 55%, transparent)',
  },
  'form-field-background': {
    setting: 'form.fields.background',
    default: 'rgb(255 255 255 / 0.92)',
  },
  'form-field-color': { setting: 'form.fields.color', default: '#1f2a44' },

  // ── parts you style yourself: CSS only ──
  'scrollbar-thumb': { default: 'rgb(0 0 0 / 0.4)' },
  'toolbar-surface': { default: '#ffffff' },
  'toolbar-border': { default: 'rgb(0 0 0 / 0.15)' },
  'toolbar-active': { default: 'rgb(0 0 0 / 0.12)' },
  'font-mono': { default: 'ui-monospace, monospace' },
} as const satisfies Record<string, EpdfVariableDefinition>;

type Definitions = typeof EPDF_VARIABLES;

/** A theming variable's name, without its `--epdf-` prefix. */
export type EpdfVariable = keyof Definitions;

/** A variable that overrides a setting: its part paints with {@link paint}. */
export type EpdfSettingVariable = {
  [Name in EpdfVariable]: Definitions[Name] extends { readonly setting: string } ? Name : never;
}[EpdfVariable];

/** A part you style yourself, which has no setting: it paints with {@link paintDefault}. */
export type EpdfCssOnlyVariable = Exclude<EpdfVariable, EpdfSettingVariable>;

/** A part whose default is the accent at a percent: that default comes from {@link mixAccent}. */
export type EpdfTranslucentVariable = {
  [Name in EpdfVariable]: Definitions[Name] extends { readonly accentPercent: number }
    ? Name
    : never;
}[EpdfVariable];

/**
 * The CSS value for a painted part: its own variable, then the variables of the
 * parts its default follows (the part it follows, its plugin's accent,
 * `--epdf-accent`), then the setting's value. Put it in a style (`style.stroke`),
 * not an SVG attribute, because attributes don't read `var()`.
 *
 * `paint('annotation-outline', '#3858e9')` is
 * `var(--epdf-annotation-outline, var(--epdf-annotation-accent, var(--epdf-accent, #3858e9)))`,
 * `paint('annotation-rotation-handle-fill', '#ffffff')` is
 * `var(--epdf-annotation-rotation-handle-fill, var(--epdf-annotation-handle-fill, #ffffff))`,
 * and `paint('search-highlight', '#ffd500')` is `var(--epdf-search-highlight, #ffd500)`.
 */
export function paint(name: EpdfSettingVariable, settingValue: string | number): string {
  const definition: EpdfVariableDefinition = EPDF_VARIABLES[name];
  const value = String(settingValue);
  const css = definition.keywords?.[value] ?? value;
  // A translucent part meets its accent inside its default instead: see mixAccent().
  const followed = definition.accentPercent === undefined ? definition.follows : undefined;
  return `var(--epdf-${name}, ${followed ? paint(followed, css) : css})`;
}

/**
 * The default of a translucent part, such as "the accent at 35%": the accent it
 * follows, variables included, mixed with transparent. Use it as the setting's
 * value while the part's own setting is unset.
 *
 * The accent variables sit inside the mix, not in {@link paint}'s lookup: there
 * a set `--epdf-accent` would paint at full strength, and CSS can't mix a
 * variable only when it's set. So a part's own setting, when you give one, wins
 * over the accent variables, though not over the part's own variable.
 *
 * `mixAccent('text-selection', '#3858e9')` is
 * `color-mix(in srgb, var(--epdf-accent, #3858e9) 35%, transparent)`.
 */
export function mixAccent(name: EpdfTranslucentVariable, accentValue: string): string {
  const { follows, accentPercent } = EPDF_VARIABLES[name];
  return `color-mix(in srgb, ${paint(follows, accentValue)} ${accentPercent}%, transparent)`;
}

/**
 * The CSS value for a part you style yourself, which has no setting: its
 * variable, then its built-in look.
 *
 * `paintDefault('scrollbar-thumb')` is `var(--epdf-scrollbar-thumb, rgb(0 0 0 / 0.4))`.
 */
export function paintDefault(name: EpdfCssOnlyVariable): string {
  return `var(--epdf-${name}, ${EPDF_VARIABLES[name].default})`;
}
