/**
 * Public annotation protocol without the repository, reducer, tools, or plugin
 * wiring. Cross-package capability consumers import this entry.
 */
import type { CapabilityToken } from '@embedpdf/core';

import { AnnotationToken as AnnotationHostToken } from './types';
import type { AnnotationCapability } from './types';

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
  StampPlacement,
  StampPreviewProvider,
  StampToolInput,
  FilePickerProvider,
  FilePromptRequest,
  TextItem,
  ToolGhost,
} from './types';
export type {
  AnnotationDTO,
  AnnotationRef,
  AnnotationSubtype,
  Color,
  CommentThread,
  CommentThreadReview,
  ReviewStatus,
} from '@embedpdf/engine-core/runtime';
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

/** The public lens over the host capability's one runtime token. */
export const AnnotationToken =
  AnnotationHostToken as unknown as CapabilityToken<AnnotationCapability>;
export { previewBucket } from './types';
/** The tool `armStamp` activates — a sibling that must win a click while a payload is armed keys on it. */
export { ARMED_STAMP_TOOL_ID } from './tools';
export {
  ANNOTATION_DRAW_PRIORITY,
  ANNOTATION_EDIT_PRIORITY,
  ANNOTATION_GHOST_PRIORITY,
  ANNOTATION_MARQUEE_PRIORITY,
  ANNOTATION_PLACE_PRIORITY,
} from './priorities';
