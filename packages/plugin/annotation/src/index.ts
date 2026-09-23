/**
 * @embedpdf/plugin-annotation — the annotation plugin.
 *
 * The pure @embedpdf/core-annotation wired to the engine (a records mirror,
 * and changes shown at once until their writes settle) and the interaction
 * hub (ambient editing + draw tools). How it fits together: README.md.
 * Behaviors (forms, links) plug in via registerBehavior. Zero framework code.
 */
export { annotationPlugin } from './annotation.plugin';
// The one annotation key, re-exported so app code keying by ref needs only this package.
export { annotationKey, refFromStableId } from '@embedpdf/core';
export * from './contract';
export { fromDTO, toCreateDraft, toPatch, styleFromDTO } from './repository';
// The shared placement layer + the one click↔drag threshold, re-exported so a
// sibling commit plane (the form plugin's place handler) resolves clicks with
// the exact call the annotation core and the footprint ghost use.
export { MIN_DRAG, resolveClickPlacement, type ClickPlacement } from '@embedpdf/core-annotation';
export { widgetAppearanceFromProps } from './authoring';
// The comments lens's thread shapes (composed in engine-core per
// ISO 32000 §12.5.6.3) + the annotation identity type its verbs take — re-exported
// so consumers type against this package alone.
export { DEFAULT_CHROME } from './model';
export { DEFAULT_TOOLS } from './tools/definitions';
export type {
  AnnotationToolDef,
  AnnotationToolInput,
  GhostPolicy,
  InkAuthoringOptions,
  PromptSourceSpec,
  ResolvedTool,
  SelectionAuthoring,
  StampSourceSpec,
  ToolAuthoringKind,
  ToolDefaultsFor,
} from './tools/definitions';
// The property vocabulary + schema (defined in the portable core; re-exported so
// app code building property UIs needs only this package).
export { propsFor } from '@embedpdf/core-annotation';
