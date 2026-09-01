/**
 * @embedpdf/plugin-annotation — annotations on the v3 stack.
 *
 * The pure @embedpdf/core-annotation wired to the engine repository (optimistic
 * create/patch/delete) and the interaction hub (ambient editing + draw tools).
 * Behaviors (forms, links) plug in via registerBehavior. Zero framework code.
 */
export { annotationPlugin } from './annotation.plugin';
export * from './contract';
export {
  fromDTO,
  toCreateDraft,
  toPatch,
  refKey,
  styleFromDTO,
} from './repository';
// The shared placement layer + the one click↔drag threshold, re-exported so a
// sibling COMMIT PLANE (the form plugin's place handler) resolves clicks with
// the exact call the annotation core and the footprint ghost use.
export { MIN_DRAG, resolveClickPlacement, type ClickPlacement } from '@embedpdf/core-annotation';
export { widgetAppearanceFromProps } from './authoring';
// The comments lens's thread shapes (composed in engine-core, ISO 32000
// §12.5.6.3) + the annotation identity type its verbs take — re-exported
// so consumers type against this package alone.
export { DEFAULT_CHROME } from './reducer';
export { DEFAULT_TOOLS } from './tools';
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
} from './tools';
// The property vocabulary + schema (defined in the portable core; re-exported so
// app code building property UIs needs only this package).
export { propsFor } from '@embedpdf/core-annotation';
