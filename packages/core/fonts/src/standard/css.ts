/**
 * A standard face as CSS: its program's family first, then the platform's
 * look-alikes for the moment before the program is mounted.
 */
import { STANDARD_FACES, type StandardFont } from '@embedpdf/engine-core/runtime';

import { standardFontProgram } from './programs';

const STACKS: Readonly<Record<(typeof STANDARD_FACES)[StandardFont]['family'], string>> = {
  Helvetica: 'Helvetica, Arial, sans-serif',
  Times: '"Times New Roman", Times, serif',
  Courier: '"Courier New", Courier, monospace',
  Symbol: 'Symbol, serif',
  ZapfDingbats: '"Zapf Dingbats", ZapfDingbats, serif',
};

export interface StandardFontCss {
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly fontStyle: 'normal' | 'italic';
}

/** The platform's look-alikes of a standard face, as a CSS family list. */
export function standardFontStack(font: StandardFont): string {
  return STACKS[STANDARD_FACES[font].family];
}

export function standardFontCss(font: StandardFont): StandardFontCss {
  const program = standardFontProgram(font);
  return {
    fontFamily: `"${program.family}", ${standardFontStack(font)}`,
    fontWeight: program.weight,
    fontStyle: program.style,
  };
}
