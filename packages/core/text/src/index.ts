/**
 * Text laid out as the engine's shared text engine lays it out, so the
 * viewer draws what the engine will write before it has: the font each
 * character is drawn in, the Unicode bidirectional order, and a form field's
 * lines, size and runs. The browser shapes each run; this package decides
 * what goes where. Pure: no DOM, no engine.
 */
export {
  layoutField,
  type FieldLine,
  type FieldRun,
  type FieldText,
  type FieldTextOptions,
} from './field';
export {
  coversGrapheme,
  matchGrapheme,
  standardTextFont,
  type GraphemeMatch,
  type TextFont,
  type TextFonts,
} from './fonts';
export { firstStrongIsRtl, lineLevels, mirrorOf, paragraphLevels, visualOrder } from './bidi';
export { graphemeStarts, graphemesOf, isInvisibleGrapheme } from './graphemes';
export { isSimpleScript, scriptOf } from './scripts';
