import { PdfBlendMode } from '../pdf';

/** Extra UI sentinel for “multiple different values selected”. */
export const MixedBlendMode = Symbol('mixed');
export type UiBlendModeValue = PdfBlendMode | typeof MixedBlendMode;

export type CssBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

interface BlendModeInfo {
  /** Pdf enum value */
  id: PdfBlendMode;
  /** Human label for UI */
  label: string;
  /** CSS mix-blend-mode token */
  css: CssBlendMode;
}

/** Canonical ordered descriptor list (matches enum numeric order). */
const BLEND_MODE_INFOS: readonly BlendModeInfo[] = Object.freeze([
  { id: PdfBlendMode.Normal, label: 'Normal', css: 'normal' },
  { id: PdfBlendMode.Multiply, label: 'Multiply', css: 'multiply' },
  { id: PdfBlendMode.Screen, label: 'Screen', css: 'screen' },
  { id: PdfBlendMode.Overlay, label: 'Overlay', css: 'overlay' },
  { id: PdfBlendMode.Darken, label: 'Darken', css: 'darken' },
  { id: PdfBlendMode.Lighten, label: 'Lighten', css: 'lighten' },
  { id: PdfBlendMode.ColorDodge, label: 'Color Dodge', css: 'color-dodge' },
  { id: PdfBlendMode.ColorBurn, label: 'Color Burn', css: 'color-burn' },
  { id: PdfBlendMode.HardLight, label: 'Hard Light', css: 'hard-light' },
  { id: PdfBlendMode.SoftLight, label: 'Soft Light', css: 'soft-light' },
  { id: PdfBlendMode.Difference, label: 'Difference', css: 'difference' },
  { id: PdfBlendMode.Exclusion, label: 'Exclusion', css: 'exclusion' },
  { id: PdfBlendMode.Hue, label: 'Hue', css: 'hue' },
  { id: PdfBlendMode.Saturation, label: 'Saturation', css: 'saturation' },
  { id: PdfBlendMode.Color, label: 'Color', css: 'color' },
  { id: PdfBlendMode.Luminosity, label: 'Luminosity', css: 'luminosity' },
]);

/* Build O(1) maps once */
const enumToInfo: Record<PdfBlendMode, BlendModeInfo> = BLEND_MODE_INFOS.reduce(
  (m, info) => {
    m[info.id] = info;
    return m;
  },
  {} as Record<PdfBlendMode, BlendModeInfo>,
);

const cssToEnum = BLEND_MODE_INFOS.reduce<Record<CssBlendMode, PdfBlendMode>>(
  (m, info) => {
    m[info.css] = info.id;
    return m;
  },
  {} as Record<CssBlendMode, PdfBlendMode>,
);

/** Get descriptor (falls back to Normal if unknown number sneaks in).
 *
 * @public
 */
export function getBlendModeInfo(mode: PdfBlendMode): BlendModeInfo {
  return enumToInfo[mode] ?? enumToInfo[PdfBlendMode.Normal];
}

/** Convert enum → CSS value for `mix-blend-mode`.
 *
 * @public
 */
export function blendModeToCss(mode: PdfBlendMode): CssBlendMode {
  return getBlendModeInfo(mode).css;
}

/** Convert CSS token → enum (returns undefined if not recognized).
 *
 * @public
 */
export function cssToBlendMode(value: CssBlendMode): PdfBlendMode | undefined {
  return cssToEnum[value];
}

/** Enum → UI label.
 *
 * @public
 */
export function blendModeLabel(mode: PdfBlendMode): string {
  return getBlendModeInfo(mode).label;
}

/**
 * For a selection of annotations: returns the common enum value, or Mixed sentinel.
 *
 * @public
 */
export function reduceBlendModes(modes: readonly PdfBlendMode[]): UiBlendModeValue {
  if (!modes.length) return PdfBlendMode.Normal;
  const first = modes[0];
  return modes.every((m) => m === first) ? first : MixedBlendMode;
}

/** Options for a <select> (with English labels - for quick prototyping).
 * For i18n, use `blendModeValues` and translate labels in your UI layer.
 *
 * @public
 */
export const blendModeSelectOptions = BLEND_MODE_INFOS.map((info) => ({
  value: info.id,
  label: info.label,
}));

/**
 * All blend mode enum values in canonical order.
 * Use this to build translated select options in your UI layer.
 *
 * @public
 */
export const blendModeValues: readonly PdfBlendMode[] = BLEND_MODE_INFOS.map((info) => info.id);

/** Provide a label when Mixed sentinel used (UI convenience).
 *
 * @public
 */
export function uiBlendModeDisplay(value: UiBlendModeValue): string {
  return value === MixedBlendMode ? '(mixed)' : blendModeLabel(value);
}
