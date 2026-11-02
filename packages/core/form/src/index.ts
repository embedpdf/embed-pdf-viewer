/**
 * The form widget painter: what a widget looks like for its facts, ported
 * from the engine's appearance generator, its text laid out as the engine's
 * shared text engine lays it out (`@embedpdf/core-text`), and checked against
 * the engine by the parity gate (engine `widget-painter-parity.test.ts`).
 * Pure: no DOM, no engine.
 */
export { paints, widgetDrawing, widgetText, type ShownValue } from './drawing';
export { textEditorLayout, type TextEditorLayout } from './editor';
export type { DrawOp, PathSegment, Rgb, TextRun, WidgetDrawing } from './drawing';
export { widgetScene, type WidgetPlacement } from './scene';
export type { MountableFontProgram } from '@embedpdf/core-fonts';
