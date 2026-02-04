import type { GlobalStoreState } from '@embedpdf/core';
import { CAPTURE_PLUGIN_ID, type CaptureState } from '@embedpdf/plugin-capture';
import { ZOOM_PLUGIN_ID, type ZoomState } from '@embedpdf/plugin-zoom';
import { VIEWPORT_PLUGIN_ID, type ViewportState } from '@embedpdf/plugin-viewport';
import { SCROLL_PLUGIN_ID, type ScrollState } from '@embedpdf/plugin-scroll';
import { SPREAD_PLUGIN_ID, type SpreadState } from '@embedpdf/plugin-spread';
import { SEARCH_PLUGIN_ID, type SearchState } from '@embedpdf/plugin-search';
import { SELECTION_PLUGIN_ID, type SelectionState } from '@embedpdf/plugin-selection';
import { ANNOTATION_PLUGIN_ID, type AnnotationState } from '@embedpdf/plugin-annotation';
import { FULLSCREEN_PLUGIN_ID, type FullscreenState } from '@embedpdf/plugin-fullscreen';
import {
  INTERACTION_MANAGER_PLUGIN_ID,
  type InteractionManagerState,
} from '@embedpdf/plugin-interaction-manager';
import { HISTORY_PLUGIN_ID, type HistoryState } from '@embedpdf/plugin-history';
import { REDACTION_PLUGIN_ID, type RedactionState } from '@embedpdf/plugin-redaction';
import { PAN_PLUGIN_ID, type PanState } from '@embedpdf/plugin-pan';
import { UI_PLUGIN_ID, type UIState } from '@embedpdf/plugin-ui';

export type State = GlobalStoreState<{
  [CAPTURE_PLUGIN_ID]: CaptureState;
  [ZOOM_PLUGIN_ID]: ZoomState;
  [VIEWPORT_PLUGIN_ID]: ViewportState;
  [SCROLL_PLUGIN_ID]: ScrollState;
  [SPREAD_PLUGIN_ID]: SpreadState;
  [SEARCH_PLUGIN_ID]: SearchState;
  [SELECTION_PLUGIN_ID]: SelectionState;
  [ANNOTATION_PLUGIN_ID]: AnnotationState;
  [FULLSCREEN_PLUGIN_ID]: FullscreenState;
  [INTERACTION_MANAGER_PLUGIN_ID]: InteractionManagerState;
  [HISTORY_PLUGIN_ID]: HistoryState;
  [REDACTION_PLUGIN_ID]: RedactionState;
  [PAN_PLUGIN_ID]: PanState;
  [UI_PLUGIN_ID]: UIState;
}>;

// Type for tracking sidebar state per document
export type SidebarState = {
  search: boolean;
  thumbnails: boolean;
};
