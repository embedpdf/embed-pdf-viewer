import type { WidgetCheckStyle } from '@embedpdf/engine-core/runtime';

/** The ZapfDingbats character `/MK /CA` holds for each symbol, as Acrobat writes it. */
const CHECK_STYLE_CHARACTERS: Record<WidgetCheckStyle, string> = {
  check: '4',
  cross: '8',
  star: 'H',
  circle: 'l',
  square: 'n',
  diamond: 'u',
};

/** The `/MK /CA` character a check style is written as. */
export const checkStyleCharacter = (style: WidgetCheckStyle): string =>
  CHECK_STYLE_CHARACTERS[style];

/**
 * The symbol a checkbox or radio button names in its `/MK /CA`; `null` when
 * it names none the appearance generator knows, so it shows its family's
 * own (a checkbox's check, a radio button's circle).
 */
export function checkStyleOfCaption(caption: string | null): WidgetCheckStyle | null {
  const named = (Object.keys(CHECK_STYLE_CHARACTERS) as WidgetCheckStyle[]).find(
    (style) => caption?.[0] === CHECK_STYLE_CHARACTERS[style],
  );
  return named ?? null;
}
