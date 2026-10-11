/**
 * The form widget painter: what a widget looks like for its facts, ported
 * from the engine's appearance generator (`cpdf_generateap.cpp`) and its text
 * layout (`CPVT`), and checked against the engine by the parity gate
 * (engine `widget-painter-parity.test.ts`). Pure: no DOM, no engine.
 */
export { widgetDrawing, type ShownValue } from './drawing';
export { textEditorLayout, type TextEditorLayout } from './editor';
export type { DrawOp, PathSegment, Rgb, TextRun, WidgetDrawing } from './drawing';
export { layoutFontOf, type LayoutFont } from './font';
export { drawingPrograms, widgetScene, type WidgetPlacement } from './scene';
export type { FontProgram } from '@embedpdf/core-fonts';
export {
  layoutVariableText,
  type LaidLine,
  type LaidWord,
  type PdfRect,
  type TextLayout,
  type VariableTextOptions,
} from './layout/variable-text';
