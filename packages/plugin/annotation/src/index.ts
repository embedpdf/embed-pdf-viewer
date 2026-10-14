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
export { annotationKey } from '@embedpdf/core';
export * from './contract';
// The shared placement layer + the one click↔drag threshold, re-exported so a
// sibling commit plane (the form plugin's place handler) places a gesture with
// the exact call the annotation core and the tool's ghost use.
export {
  MIN_DRAG,
  gesturePlacement,
  resolveClickPlacement,
  type Placement,
} from '@embedpdf/core-annotation';
export { widgetAppearanceOf } from './authoring';
export { DEFAULT_TOOLS } from './tools/definitions';
export type {
  AnnotationToolDef,
  AnnotationToolInput,
  GhostPolicy,
  ResolvedGhost,
  InkAuthoringOptions,
  PromptSourceSpec,
  ResolvedTool,
  SelectionAuthoring,
  StampSourceSpec,
  ToolAuthoringKind,
  ToolDefaultsFor,
} from './tools/definitions';
// The kinds and their style-panel properties (defined in the portable core;
// re-exported so app code building property UIs needs only this package):
// `propertiesOf(kindNamed('square'))`.
export { kindNamed, propertiesOf } from '@embedpdf/core-annotation';
