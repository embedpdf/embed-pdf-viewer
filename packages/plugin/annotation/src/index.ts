/**
 * @embedpdf/plugin-annotation — annotations on the v3 stack.
 *
 * The pure @embedpdf/core-annotation wired to the engine repository (optimistic
 * create/patch/delete) and the interaction hub (ambient editing + draw tools).
 * Behaviors (forms, links) plug in via registerBehavior. Zero framework code.
 */
import type { CapabilityToken } from '@embedpdf/core';
import { AnnotationToken as AnnotationHostToken } from './types';
import type { AnnotationCapability } from './types';

export { annotationPlugin } from './annotation.plugin';
export {
  fromDTO,
  toCreateDraft,
  toPatch,
  refKey,
  styleFromDTO,
  widgetAppearanceFromProps,
} from './repository';
// The shared placement layer + the one click↔drag threshold, re-exported so a
// sibling COMMIT PLANE (the form plugin's place handler) resolves clicks with
// the exact call the annotation core and the footprint ghost use.
export { MIN_DRAG, resolveClickPlacement, type ClickPlacement } from '@embedpdf/core-annotation';
// The comments lens's thread shapes (composed in engine-core, ISO 32000
// §12.5.6.3) + the annotation identity type its verbs take — re-exported
// so consumers type against this package alone.
export type {
  AnnotationDTO,
  AnnotationRef,
  AnnotationSubtype,
  Color,
  CommentThread,
  CommentThreadReview,
  ReviewStatus,
} from '@embedpdf/engine-core/runtime';
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
export type {
  AnnotationCapability,
  AnnotationConfig,
  AnnotationState,
  AnnotationAction,
  AnnotationHydration,
  Behavior,
  CommentPermissions,
  CommentsApi,
  ThreadDeleteResult,
  ChromeSettings,
  ChromeSettingsPatch,
  LinkNavItem,
  SelectionFlags,
  SelectionProps,
  StampToolInput,
  FilePickerProvider,
  FilePromptRequest,
  TextItem,
  ToolGhost,
} from './types';
// The property vocabulary + schema (defined in the portable core; re-exported so
// app code building property UIs needs only this package).
export { propsFor } from '@embedpdf/core-annotation';
export type {
  AnnotationFlags,
  AnnotationProps,
  AnnotationPropsPatch,
  BlendMode,
  Border,
  ClickCreate,
  LineEnding,
  LineEndings,
  PropKey,
  PropSpec,
  SnapSettings,
  TextAlign,
} from '@embedpdf/core-annotation';

/**
 * App-facing annotation token: resolves the public {@link AnnotationCapability}.
 * It is the SAME runtime token the plugin provides, narrowed to the public lens —
 * the framework-only surface (render projection, pointer gestures, behavior
 * registration) is reachable only via `@embedpdf/plugin-annotation/internal`.
 */
export const AnnotationToken =
  AnnotationHostToken as unknown as CapabilityToken<AnnotationCapability>;
