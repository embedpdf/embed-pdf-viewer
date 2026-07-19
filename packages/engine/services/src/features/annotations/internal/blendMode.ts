import type { BlendMode } from '@embedpdf/engine-core/runtime';

/** Explicit wire-domain ↔ PDFium `FPDF_BLENDMODE` mapping. */
export function blendModeToCode(mode: BlendMode): number {
  switch (mode) {
    case 'normal':
      return 0;
    case 'multiply':
      return 1;
    case 'screen':
      return 2;
    case 'overlay':
      return 3;
    case 'darken':
      return 4;
    case 'lighten':
      return 5;
    case 'color-dodge':
      return 6;
    case 'color-burn':
      return 7;
    case 'hard-light':
      return 8;
    case 'soft-light':
      return 9;
    case 'difference':
      return 10;
    case 'exclusion':
      return 11;
    case 'hue':
      return 12;
    case 'saturation':
      return 13;
    case 'color':
      return 14;
    case 'luminosity':
      return 15;
  }
}

export function blendModeFromCode(code: number): BlendMode {
  switch (code) {
    case 1:
      return 'multiply';
    case 2:
      return 'screen';
    case 3:
      return 'overlay';
    case 4:
      return 'darken';
    case 5:
      return 'lighten';
    case 6:
      return 'color-dodge';
    case 7:
      return 'color-burn';
    case 8:
      return 'hard-light';
    case 9:
      return 'soft-light';
    case 10:
      return 'difference';
    case 11:
      return 'exclusion';
    case 12:
      return 'hue';
    case 13:
      return 'saturation';
    case 14:
      return 'color';
    case 15:
      return 'luminosity';
    default:
      return 'normal';
  }
}
