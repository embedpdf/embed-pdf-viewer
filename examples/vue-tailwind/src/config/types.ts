import { GlobalStoreState } from '@embedpdf/core';
import { CAPTURE_PLUGIN_ID, CaptureState } from '@embedpdf/plugin-capture/vue';
import { ZOOM_PLUGIN_ID, ZoomState } from '@embedpdf/plugin-zoom/vue';
import { VIEWPORT_PLUGIN_ID, ViewportState } from '@embedpdf/plugin-viewport/vue';
import { SCROLL_PLUGIN_ID, ScrollState } from '@embedpdf/plugin-scroll/vue';
import { SPREAD_PLUGIN_ID, SpreadState } from '@embedpdf/plugin-spread/vue';
import { SEARCH_PLUGIN_ID, SearchState } from '@embedpdf/plugin-search/vue';
import { SELECTION_PLUGIN_ID, SelectionState } from '@embedpdf/plugin-selection/vue';
import { ANNOTATION_PLUGIN_ID, AnnotationState } from '@embedpdf/plugin-annotation/vue';
import { FULLSCREEN_PLUGIN_ID, FullscreenState } from '@embedpdf/plugin-fullscreen/vue';
import {
  INTERACTION_MANAGER_PLUGIN_ID,
  InteractionManagerState,
} from '@embedpdf/plugin-interaction-manager/vue';
import { HISTORY_PLUGIN_ID, HistoryState } from '@embedpdf/plugin-history/vue';
import { REDACTION_PLUGIN_ID, RedactionState } from '@embedpdf/plugin-redaction/vue';
import { PAN_PLUGIN_ID, PanState } from '@embedpdf/plugin-pan/vue';
import { UI_PLUGIN_ID, UIState } from '@embedpdf/plugin-ui';

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
