import type { Command } from '@embedpdf/plugin-commands';
import type { CapturePlugin } from '@embedpdf/plugin-capture';
import { ZoomMode, type ZoomPlugin } from '@embedpdf/plugin-zoom';
import type { PanPlugin } from '@embedpdf/plugin-pan';
import { SpreadMode, type SpreadPlugin } from '@embedpdf/plugin-spread';
import type { RotatePlugin } from '@embedpdf/plugin-rotate';
import {
  ANNOTATION_PLUGIN_ID,
  type AnnotationPlugin,
  getToolDefaultsById,
} from '@embedpdf/plugin-annotation';
import {
  REDACTION_PLUGIN_ID,
  RedactionMode,
  type RedactionPlugin,
} from '@embedpdf/plugin-redaction';
import type { PrintPlugin } from '@embedpdf/plugin-print';
import type { ExportPlugin } from '@embedpdf/plugin-export';
import type { DocumentManagerPlugin } from '@embedpdf/plugin-document-manager';
import { HISTORY_PLUGIN_ID, type HistoryPlugin } from '@embedpdf/plugin-history';
import type { State } from './types';
import { isSidebarOpen, isToolbarOpen, UI_PLUGIN_ID, type UIPlugin } from '@embedpdf/plugin-ui';
import { ScrollStrategy, type ScrollPlugin } from '@embedpdf/plugin-scroll';
import type { InteractionManagerPlugin } from '@embedpdf/plugin-interaction-manager';
import type { SelectionPlugin } from '@embedpdf/plugin-selection';
import { PdfAnnotationSubtype, PdfPermissionFlag } from '@embedpdf/models';
import { getEffectivePermission } from '@embedpdf/core';

/**
 * Helper to check if the document has a specific permission flag (after applying overrides).
 * Returns true if the permission is ALLOWED, false if denied.
 */
const hasPermission = (state: State, documentId: string, flag: PdfPermissionFlag): boolean => {
  return getEffectivePermission(state.core, documentId, flag);
};

/**
 * Helper to check if the document lacks a specific permission (for disabled states).
 * Returns true if the permission is DENIED, false if allowed.
 */
const lacksPermission = (state: State, documentId: string, flag: PdfPermissionFlag): boolean => {
  return !hasPermission(state, documentId, flag);
};

export const commands: Record<string, Command<State>> = {
  // ─────────────────────────────────────────────────────────
  // Zoom Commands
  // ─────────────────────────────────────────────────────────
  'zoom:in': {
    id: 'zoom:in',
    labelKey: 'zoom.in',
    icon: 'search-plus',
    shortcuts: ['Ctrl+=', 'Meta+=', 'Ctrl+NumpadAdd', 'Meta+NumpadAdd'],
    categories: ['view'],
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.zoomIn();
    },
  },

  'zoom:out': {
    id: 'zoom:out',
    labelKey: 'zoom.out',
    icon: 'search-minus',
    shortcuts: ['Ctrl+-', 'Meta+-', 'Ctrl+NumpadSubtract', 'Meta+NumpadSubtract'],
    categories: ['view'],
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.zoomOut();
    },
  },

  'zoom:fit-page': {
    id: 'zoom:fit-page',
    labelKey: 'zoom.fitPage',
    icon: 'fit-page',
    shortcuts: ['Ctrl+0', 'Meta+0'],
    categories: ['tools'],
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(ZoomMode.FitPage);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === ZoomMode.FitPage,
  },

  'zoom:fit-width': {
    id: 'zoom:fit-width',
    labelKey: 'zoom.fitWidth',
    icon: 'fit-width',
    shortcuts: ['Ctrl+1', 'Meta+1'],
    categories: ['tools'],
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(ZoomMode.FitWidth);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === ZoomMode.FitWidth,
  },

  'zoom:marquee': {
    id: 'zoom:marquee',
    labelKey: 'zoom.marquee',
    icon: 'marquee',
    shortcuts: ['Ctrl+M', 'Meta+M'],
    categories: ['tools'],
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.toggleMarqueeZoom();
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.isMarqueeZoomActive ?? false,
  },

  'zoom:25': {
    id: 'zoom:25',
    label: '25%',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(0.25);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === 0.25,
  },

  'zoom:50': {
    id: 'zoom:50',
    label: '50%',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(0.5);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === 0.5,
  },

  'zoom:100': {
    id: 'zoom:100',
    label: '100%',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(1);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === 1,
  },

  'zoom:125': {
    id: 'zoom:125',
    label: '125%',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(1.25);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === 1.25,
  },

  'zoom:150': {
    id: 'zoom:150',
    label: '150%',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(1.5);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === 1.5,
  },

  'zoom:200': {
    id: 'zoom:200',
    label: '200%',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(2);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === 2,
  },

  'zoom:400': {
    id: 'zoom:400',
    label: '400%',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(4);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === 4,
  },

  'zoom:800': {
    id: 'zoom:800',
    label: '800%',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(8);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === 8,
  },

  'zoom:1600': {
    id: 'zoom:1600',
    label: '1600%',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(16);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === 16,
  },

  'zoom:toggle-menu': {
    id: 'zoom:toggle-menu',
    labelKey: 'zoom.menu',
    icon: 'zoom-chevron-down',
    iconProps: {
      className: 'h-3.5 w-3.5',
    },
    categories: ['tools'],
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      const scope = ui.forDocument(documentId);
      scope.toggleMenu('zoom-menu', 'zoom:toggle-menu', 'zoom-menu-button');
    },
    active: ({ state, documentId }) => {
      const uiState = state.plugins['ui']?.documents[documentId];
      return uiState?.openMenus['zoom-menu'] !== undefined;
    },
  },

  'zoom:toggle-menu-mobile': {
    id: 'zoom:toggle-menu-mobile',
    labelKey: 'zoom.menu',
    icon: 'search-plus',
    categories: ['tools'],
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      const scope = ui.forDocument(documentId);
      scope.toggleMenu('zoom-menu', 'zoom:toggle-menu-mobile', 'zoom-menu-button');
    },
    active: ({ state, documentId }) => {
      const uiState = state.plugins['ui']?.documents[documentId];
      return uiState?.openMenus['zoom-menu'] !== undefined;
    },
  },

  // ─────────────────────────────────────────────────────────
  // Pan Command
  // ─────────────────────────────────────────────────────────
  'pan:toggle': {
    id: 'pan:toggle',
    labelKey: 'pan.toggle',
    icon: 'hand',
    shortcuts: ['h'],
    categories: ['tools'],
    action: ({ registry, documentId }) => {
      const pan = registry.getPlugin<PanPlugin>('pan')?.provides();
      if (!pan) return;

      const scope = pan.forDocument(documentId);
      scope.togglePan();
    },
    active: ({ state, documentId }) =>
      state.plugins['pan']?.documents[documentId]?.isPanMode ?? false,
  },

  // ─────────────────────────────────────────────────────────
  // Pointer Command
  // ─────────────────────────────────────────────────────────
  'pointer:toggle': {
    id: 'pointer:toggle',
    labelKey: 'pointer.toggle',
    icon: 'pointer',
    shortcuts: ['p'],
    categories: ['tools'],
    action: ({ registry, documentId }) => {
      const pointer = registry
        .getPlugin<InteractionManagerPlugin>('interaction-manager')
        ?.provides();
      if (!pointer) return;

      const scope = pointer.forDocument(documentId);
      if (scope.getActiveMode() === 'pointerMode') {
        scope.activateDefaultMode();
      } else {
        scope.activate('pointerMode');
      }
    },
    active: ({ state, documentId }) =>
      state.plugins['interaction-manager']?.documents[documentId]?.activeMode === 'pointerMode',
  },

  // ─────────────────────────────────────────────────────────
  // Capture Command
  // ─────────────────────────────────────────────────────────
  'capture:screenshot': {
    id: 'capture:screenshot',
    labelKey: 'capture.screenshot',
    icon: 'screenshot',
    shortcuts: ['Ctrl+Shift+S', 'Meta+Shift+S'],
    categories: ['tools'],
    action: ({ registry, documentId }) => {
      const capture = registry.getPlugin<CapturePlugin>('capture')?.provides();
      if (!capture) return;

      const scope = capture.forDocument(documentId);
      if (scope.isMarqueeCaptureActive()) {
        scope.disableMarqueeCapture();
      } else {
        scope.enableMarqueeCapture();
      }
    },
    active: ({ state, documentId }) =>
      state.plugins['interaction-manager'].documents[documentId]?.activeMode === 'marqueeCapture',
  },

  // ─────────────────────────────────────────────────────────
  // Document Commands
  // ─────────────────────────────────────────────────────────
  'document:menu': {
    id: 'document:menu',
    labelKey: 'document.menu',
    icon: 'menu',
    categories: ['document'],
    action: ({ registry, documentId }) => {
      // Toggle the document menu via UI plugin
      const uiPlugin = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID);
      if (!uiPlugin || !uiPlugin.provides) return;

      const uiCapability = uiPlugin.provides();
      if (!uiCapability) return;

      const scope = uiCapability.forDocument(documentId);
      scope.toggleMenu(
        'document-menu',
        'document:menu',
        'document-menu-button', // Must match the item ID in ui-schema
      );
    },
    active: ({ state, documentId }) => {
      const uiState = state.plugins['ui']?.documents[documentId];
      return uiState?.openMenus['document-menu'] !== undefined;
    },
  },

  'document:open': {
    id: 'document:open',
    labelKey: 'document.open',
    icon: 'document',
    shortcuts: ['Ctrl+O', 'Meta+O'],
    categories: ['document'],
    action: ({ registry }) => {
      const docManager = registry.getPlugin<DocumentManagerPlugin>('document-manager')?.provides();
      docManager?.openFileDialog();
    },
  },

  'document:close': {
    id: 'document:close',
    labelKey: 'document.close',
    icon: 'close',
    shortcuts: ['Ctrl+W', 'Meta+W'],
    categories: ['document'],
    action: ({ registry, documentId }) => {
      const docManager = registry.getPlugin<DocumentManagerPlugin>('document-manager')?.provides();
      docManager?.closeDocument(documentId);
    },
  },

  'document:print': {
    id: 'document:print',
    labelKey: 'document.print',
    icon: 'print',
    shortcuts: ['Ctrl+P', 'Meta+P'],
    categories: ['document'],
    action: ({ registry, documentId }) => {
      const print = registry.getPlugin<PrintPlugin>('print')?.provides();
      print?.forDocument(documentId).print();
    },
  },

  'document:export': {
    id: 'document:export',
    labelKey: 'document.export',
    icon: 'download',
    categories: ['document'],
    action: ({ registry, documentId }) => {
      const exportPlugin = registry.getPlugin<ExportPlugin>('export')?.provides();
      exportPlugin?.forDocument(documentId).download();
    },
  },

  'document:properties': {
    id: 'document:properties',
    labelKey: 'document.properties',
    icon: 'alert',
    categories: ['document'],
    action: () => {
      console.log('Document properties clicked');
    },
  },

  // ─────────────────────────────────────────────────────────
  // Panel Commands
  // ─────────────────────────────────────────────────────────
  'panel:toggle-sidebar': {
    id: 'panel:toggle-sidebar',
    labelKey: 'panel.sidebar',
    icon: 'sidebar',
    categories: ['panels'],
    action: ({ registry, documentId }) => {
      // Toggle the thumbnails panel via UI plugin
      const uiPlugin = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID);
      if (!uiPlugin || !uiPlugin.provides) return;

      const uiCapability = uiPlugin.provides();
      if (!uiCapability) return;

      const scope = uiCapability.forDocument(documentId);
      scope.toggleSidebar('left', 'main', 'sidebar-panel');
    },
    active: ({ state, documentId }) => {
      return isSidebarOpen(state.plugins, documentId, 'left', 'main', 'sidebar-panel');
    },
  },

  'panel:toggle-search': {
    id: 'panel:toggle-search',
    labelKey: 'panel.search',
    icon: 'search',
    shortcuts: ['Ctrl+F', 'Meta+F'],
    categories: ['panels'],
    action: ({ registry, documentId }) => {
      // Toggle the search panel via UI plugin
      const uiPlugin = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID);
      if (!uiPlugin || !uiPlugin.provides) return;

      const uiCapability = uiPlugin.provides();
      if (!uiCapability) return;

      const scope = uiCapability.forDocument(documentId);
      scope.toggleSidebar('right', 'main', 'search-panel');
    },
    active: ({ state, documentId }) => {
      return isSidebarOpen(state.plugins, documentId, 'right', 'main', 'search-panel');
    },
  },

  'panel:toggle-comment': {
    id: 'panel:toggle-comment',
    labelKey: 'panel.comment',
    icon: 'comment',
    categories: ['panels'],
    action: ({ registry, documentId }) => {
      const uiPlugin = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID);
      if (!uiPlugin || !uiPlugin.provides) return;

      const uiCapability = uiPlugin.provides();
      if (!uiCapability) return;

      const scope = uiCapability.forDocument(documentId);
      scope.toggleSidebar('right', 'main', 'comment-panel');
    },
    active: ({ state, documentId }) => {
      return isSidebarOpen(state.plugins, documentId, 'right', 'main', 'comment-panel');
    },
  },

  // ─────────────────────────────────────────────────────────
  // Page Settings Commands
  // ─────────────────────────────────────────────────────────
  'page:settings': {
    id: 'page:settings',
    labelKey: 'page.settings',
    icon: 'settings',
    categories: ['page'],
    action: ({ registry, documentId }) => {
      // Toggle the page settings menu via UI plugin
      const uiPlugin = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID);
      if (!uiPlugin || !uiPlugin.provides) return;

      const uiCapability = uiPlugin.provides();
      if (!uiCapability) return;

      const scope = uiCapability.forDocument(documentId);
      scope.toggleMenu(
        'page-settings-menu',
        'page:settings',
        'page-settings-button', // Must match the item ID in ui-schema
      );
    },
    active: ({ state, documentId }) => {
      const uiState = state.plugins['ui']?.documents[documentId];
      return uiState?.openMenus['page-settings-menu'] !== undefined;
    },
  },

  'spread:none': {
    id: 'spread:none',
    labelKey: 'page.single',
    categories: ['page'],
    action: ({ registry, documentId }) => {
      const spread = registry.getPlugin<SpreadPlugin>('spread')?.provides();
      spread?.forDocument(documentId).setSpreadMode(SpreadMode.None);
    },
    active: ({ state, documentId }) =>
      state.plugins['spread']?.documents[documentId]?.spreadMode === SpreadMode.None,
  },

  'spread:odd': {
    id: 'spread:odd',
    labelKey: 'page.twoOdd',
    categories: ['page'],
    action: ({ registry, documentId }) => {
      const spread = registry.getPlugin<SpreadPlugin>('spread')?.provides();
      spread?.forDocument(documentId).setSpreadMode(SpreadMode.Odd);
    },
    active: ({ state, documentId }) =>
      state.plugins['spread']?.documents[documentId]?.spreadMode === SpreadMode.Odd,
  },

  'spread:even': {
    id: 'spread:even',
    labelKey: 'page.twoEven',
    categories: ['page'],
    action: ({ registry, documentId }) => {
      const spread = registry.getPlugin<SpreadPlugin>('spread')?.provides();
      spread?.forDocument(documentId).setSpreadMode(SpreadMode.Even);
    },
    active: ({ state, documentId }) =>
      state.plugins['spread']?.documents[documentId]?.spreadMode === SpreadMode.Even,
  },

  'rotate:clockwise': {
    id: 'rotate:clockwise',
    labelKey: 'rotate.clockwise',
    icon: 'rotate-right',
    shortcuts: ['Ctrl+]', 'Meta+]'],
    categories: ['page'],
    action: ({ registry, documentId }) => {
      const rotate = registry.getPlugin<RotatePlugin>('rotate')?.provides();
      rotate?.forDocument(documentId).rotateForward();
    },
  },

  'rotate:counter-clockwise': {
    id: 'rotate:counter-clockwise',
    labelKey: 'rotate.counterClockwise',
    icon: 'rotate-left',
    shortcuts: ['Ctrl+[', 'Meta+['],
    categories: ['page'],
    action: ({ registry, documentId }) => {
      const rotate = registry.getPlugin<RotatePlugin>('rotate')?.provides();
      rotate?.forDocument(documentId).rotateBackward();
    },
  },

  'scroll:vertical': {
    id: 'scroll:vertical',
    labelKey: 'page.vertical',
    categories: ['page'],
    action: ({ registry, documentId }) => {
      const scroll = registry.getPlugin<ScrollPlugin>('scroll')?.provides();
      scroll?.forDocument(documentId).setScrollStrategy(ScrollStrategy.Vertical);
    },
    active: ({ state, documentId }) =>
      state.plugins['scroll']?.documents[documentId]?.strategy === ScrollStrategy.Vertical,
  },

  'scroll:horizontal': {
    id: 'scroll:horizontal',
    labelKey: 'page.horizontal',
    categories: ['page'],
    action: ({ registry, documentId }) => {
      const scroll = registry.getPlugin<ScrollPlugin>('scroll')?.provides();
      scroll?.forDocument(documentId).setScrollStrategy(ScrollStrategy.Horizontal);
    },
    active: ({ state, documentId }) =>
      state.plugins['scroll']?.documents[documentId]?.strategy === ScrollStrategy.Horizontal,
  },

  // ─────────────────────────────────────────────────────────
  // Mode Commands
  // ─────────────────────────────────────────────────────────
  'mode:view': {
    id: 'mode:view',
    labelKey: 'mode.view',
    categories: ['mode'],
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;
      ui.forDocument(documentId).closeToolbarSlot('top', 'secondary');
    },
    active: ({ state, documentId }) => {
      // Active if no secondary toolbar is shown
      return !isToolbarOpen(state.plugins, documentId, 'top', 'secondary');
    },
  },

  'mode:annotate': {
    id: 'mode:annotate',
    labelKey: 'mode.annotate',
    categories: ['mode'],
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      // Show the annotation toolbar
      ui.setActiveToolbar('top', 'secondary', 'annotation-toolbar', documentId);
    },
    active: ({ state, documentId }) => {
      return isToolbarOpen(state.plugins, documentId, 'top', 'secondary', 'annotation-toolbar');
    },
  },

  'mode:shapes': {
    id: 'mode:shapes',
    labelKey: 'mode.shapes',
    categories: ['mode'],
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      // Show the annotation toolbar (shapes use the same toolbar)
      ui.setActiveToolbar('top', 'secondary', 'shapes-toolbar', documentId);
    },
    active: ({ state, documentId }) => {
      return isToolbarOpen(state.plugins, documentId, 'top', 'secondary', 'shapes-toolbar');
    },
  },

  'mode:redact': {
    id: 'mode:redact',
    labelKey: 'mode.redact',
    categories: ['mode'],
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      // Show the redaction toolbar
      ui.setActiveToolbar('top', 'secondary', 'redaction-toolbar', documentId);
    },
    active: ({ state, documentId }) => {
      // Active when redaction toolbar is shown
      return isToolbarOpen(state.plugins, documentId, 'top', 'secondary', 'redaction-toolbar');
    },
  },

  'tabs:overflow-menu': {
    id: 'tabs:overflow-menu',
    labelKey: 'tabs.overflowMenu',
    icon: 'menu-dots',
    categories: ['ui'],
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      // Toggle the overflow tabs menu
      ui.toggleMenu(
        'mode-tabs-overflow-menu',
        'tabs:overflow-menu',
        'overflow-tabs-button',
        documentId,
      );
    },
  },

  // ─────────────────────────────────────────────────────────
  // Annotation Commands
  // ─────────────────────────────────────────────────────────
  'annotation:add-text': {
    id: 'annotation:add-text',
    labelKey: 'annotation.text',
    icon: 'text',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'freeText')?.fontColor,
    }),
    categories: ['annotation'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'freeText') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('freeText');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'freeText';
    },
  },

  'annotation:add-highlight': {
    id: 'annotation:add-highlight',
    labelKey: 'annotation.highlight',
    icon: 'highlight',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'highlight')?.color,
    }),
    categories: ['annotation'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'highlight') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('highlight');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'highlight';
    },
  },

  'annotation:add-strikeout': {
    id: 'annotation:add-strikeout',
    labelKey: 'annotation.strikeout',
    icon: 'strikethrough',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'strikeout')?.color,
    }),
    categories: ['annotation'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'strikeout') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('strikeout');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'strikeout';
    },
  },

  'annotation:add-underline': {
    id: 'annotation:add-underline',
    labelKey: 'annotation.underline',
    icon: 'underline',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'underline')?.color,
    }),
    categories: ['annotation'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'underline') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('underline');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'underline';
    },
  },

  'annotation:add-rectangle': {
    id: 'annotation:add-rectangle',
    labelKey: 'annotation.rectangle',
    icon: 'square',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'square')?.strokeColor,
      secondaryColor: getToolDefaultsById(state.plugins.annotation, 'square')?.color,
    }),
    categories: ['annotation'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'square') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('square');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'square';
    },
  },

  'annotation:add-circle': {
    id: 'annotation:add-circle',
    labelKey: 'annotation.circle',
    icon: 'circle',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'circle')?.strokeColor,
      secondaryColor: getToolDefaultsById(state.plugins.annotation, 'circle')?.color,
    }),
    categories: ['annotation'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'circle') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('circle');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'circle';
    },
  },

  'annotation:add-line': {
    id: 'annotation:add-line',
    labelKey: 'annotation.line',
    icon: 'line',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'line')?.strokeColor,
    }),
    categories: ['annotation'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'line') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('line');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'line';
    },
  },

  'annotation:add-arrow': {
    id: 'annotation:add-arrow',
    labelKey: 'annotation.arrow',
    icon: 'arrow',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'line')?.strokeColor,
    }),
    categories: ['annotation'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'lineArrow') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('lineArrow');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'lineArrow';
    },
  },

  'annotation:add-polygon': {
    id: 'annotation:add-polygon',
    labelKey: 'annotation.polygon',
    icon: 'polygon',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'polygon')?.strokeColor,
      secondaryColor: getToolDefaultsById(state.plugins.annotation, 'polygon')?.color,
    }),
    categories: ['annotation'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'polygon') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('polygon');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'polygon';
    },
  },

  'annotation:add-polyline': {
    id: 'annotation:add-polyline',
    labelKey: 'annotation.polyline',
    icon: 'polyline',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'polyline')?.strokeColor,
    }),
    categories: ['annotation'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'polyline') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('polyline');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'polyline';
    },
  },

  'annotation:add-ink': {
    id: 'annotation:add-ink',
    labelKey: 'annotation.ink',
    icon: 'pen',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'ink')?.color,
    }),
    categories: ['annotation'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'ink') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('ink');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'ink';
    },
  },

  'annotation:add-stamp': {
    id: 'annotation:add-stamp',
    labelKey: 'annotation.stamp',
    icon: 'photo',
    categories: ['annotation'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'stamp') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('stamp');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'stamp';
    },
  },

  'annotation:delete-selected': {
    id: 'annotation:delete-selected',
    labelKey: 'annotation.deleteSelected',
    icon: 'trash',
    categories: ['annotation'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();

      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      const selectedAnnotation = annotationScope.getSelectedAnnotation();
      if (!selectedAnnotation) return;

      annotationScope.deleteAnnotation(
        selectedAnnotation.object.pageIndex,
        selectedAnnotation.object.id,
      );
    },
  },

  'annotation:apply-redaction': {
    id: 'annotation:apply-redaction',
    labelKey: 'redaction.apply',
    icon: 'check',
    categories: ['annotation', 'annotation-redaction', 'redaction'],
    action: ({ registry, documentId, logger }) => {
      logger.debug('Command', 'ApplyRedaction', `Starting for document: ${documentId}`);

      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const redaction = registry.getPlugin<RedactionPlugin>(REDACTION_PLUGIN_ID)?.provides();

      if (!annotation || !redaction) {
        logger.warn(
          'Command',
          'ApplyRedaction',
          `Missing plugins - annotation: ${!!annotation}, redaction: ${!!redaction}`,
        );
        return;
      }

      const scope = annotation.forDocument(documentId);
      const selected = scope.getSelectedAnnotation();

      logger.debug(
        'Command',
        'ApplyRedaction',
        `Selected annotation: ${selected ? JSON.stringify({ id: selected.object.id, type: selected.object.type, pageIndex: selected.object.pageIndex }) : 'none'}`,
      );

      if (!selected || selected.object.type !== PdfAnnotationSubtype.REDACT) {
        logger.warn(
          'Command',
          'ApplyRedaction',
          `No valid redaction selected - selected: ${!!selected}, type: ${selected?.object.type}`,
        );
        return;
      }

      logger.debug(
        'Command',
        'ApplyRedaction',
        `Calling commitPending for page ${selected.object.pageIndex}, id ${selected.object.id}`,
      );
      redaction
        .forDocument(documentId)
        .commitPending(selected.object.pageIndex, selected.object.id);
      logger.debug('Command', 'ApplyRedaction', 'commitPending called successfully');
    },
    visible: ({ registry, documentId }) => {
      const scope = registry
        .getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)
        ?.provides()
        .forDocument(documentId);
      const selected = scope?.getSelectedAnnotation();
      return selected?.object.type === PdfAnnotationSubtype.REDACT;
    },
    disabled: ({ state, documentId }) => {
      return lacksPermission(state, documentId, PdfPermissionFlag.ModifyContents);
    },
  },

  // ─────────────────────────────────────────────────────────
  // Redaction Commands
  // ─────────────────────────────────────────────────────────
  'redaction:redact-area': {
    id: 'redaction:redact-area',
    labelKey: 'redaction.area',
    icon: 'redact-area',
    categories: ['redaction'],
    action: ({ registry, documentId }) => {
      const redaction = registry.getPlugin<RedactionPlugin>('redaction')?.provides();
      redaction?.forDocument(documentId).toggleMarqueeRedact();
    },
    active: ({ state, documentId }) => {
      const redaction = state.plugins[REDACTION_PLUGIN_ID]?.documents[documentId];
      return redaction?.activeType === RedactionMode.MarqueeRedact;
    },
  },

  'redaction:redact-text': {
    id: 'redaction:redact-text',
    labelKey: 'redaction.text',
    icon: 'redact-text',
    categories: ['redaction'],
    action: ({ registry, documentId }) => {
      const redaction = registry.getPlugin<RedactionPlugin>('redaction')?.provides();
      redaction?.forDocument(documentId).toggleRedactSelection();
    },
    active: ({ state, documentId }) => {
      const redaction = state.plugins[REDACTION_PLUGIN_ID]?.documents[documentId];
      return redaction?.activeType === RedactionMode.RedactSelection;
    },
  },

  'redaction:apply-all': {
    id: 'redaction:apply-all',
    labelKey: 'redaction.applyAll',
    icon: 'check',
    categories: ['redaction'],
    action: ({ registry, documentId }) => {
      const redaction = registry.getPlugin<RedactionPlugin>('redaction')?.provides();
      redaction?.forDocument(documentId).commitAllPending();
    },
  },

  'redaction:clear-all': {
    id: 'redaction:clear-all',
    labelKey: 'redaction.clearAll',
    icon: 'close',
    categories: ['redaction'],
    action: ({ registry, documentId }) => {
      const redaction = registry.getPlugin<RedactionPlugin>('redaction')?.provides();
      redaction?.forDocument(documentId).clearPending();
    },
  },

  'redaction:delete-selected': {
    id: 'redaction:delete-selected',
    labelKey: 'redaction.deleteSelected',
    icon: 'trash',
    categories: ['redaction'],
    action: ({ registry, documentId }) => {
      const redaction = registry.getPlugin<RedactionPlugin>('redaction')?.provides();
      const selectedRedaction = redaction?.forDocument(documentId).getSelectedPending();
      if (!selectedRedaction) return;
      redaction
        ?.forDocument(documentId)
        .removePending(selectedRedaction.page, selectedRedaction.id);
    },
  },

  'redaction:commit-selected': {
    id: 'redaction:commit-selected',
    labelKey: 'redaction.commitSelected',
    icon: 'check',
    categories: ['redaction'],
    action: ({ registry, documentId }) => {
      const redaction = registry.getPlugin<RedactionPlugin>('redaction')?.provides();
      const selectedRedaction = redaction?.forDocument(documentId).getSelectedPending();
      if (!selectedRedaction) return;
      redaction
        ?.forDocument(documentId)
        .commitPending(selectedRedaction.page, selectedRedaction.id);
    },
  },

  'selection:copy': {
    id: 'selection:copy',
    labelKey: 'selection.copy',
    icon: 'copy',
    categories: ['selection'],
    action: ({ registry, documentId }) => {
      const plugin = registry.getPlugin<SelectionPlugin>('selection');
      const scope = plugin?.provides().forDocument(documentId);
      scope?.copyToClipboard();
      scope?.clear();
    },
  },

  // ─────────────────────────────────────────────────────────
  // History Commands
  // ─────────────────────────────────────────────────────────
  'history:undo': {
    id: 'history:undo',
    labelKey: 'history.undo',
    icon: 'arrow-back-up',
    shortcuts: ['Ctrl+Z', 'Meta+Z'],
    categories: ['edit'],
    action: ({ registry, documentId }) => {
      const history = registry.getPlugin<HistoryPlugin>(HISTORY_PLUGIN_ID)?.provides();
      if (!history) return;

      const scope = history.forDocument(documentId);
      scope.undo();
    },
    disabled: ({ state, documentId }) => {
      const history = state.plugins[HISTORY_PLUGIN_ID]?.documents[documentId];
      return !history?.global.canUndo;
    },
  },

  'history:redo': {
    id: 'history:redo',
    labelKey: 'history.redo',
    icon: 'arrow-forward-up',
    shortcuts: ['Ctrl+Y', 'Meta+Shift+Z'],
    categories: ['edit'],
    action: ({ registry, documentId }) => {
      const history = registry.getPlugin<HistoryPlugin>(HISTORY_PLUGIN_ID)?.provides();
      if (!history) return;

      const scope = history.forDocument(documentId);
      scope.redo();
    },
    disabled: ({ state, documentId }) => {
      const history = state.plugins[HISTORY_PLUGIN_ID]?.documents[documentId];
      return !history?.global.canRedo;
    },
  },

  'annotation:overflow-tools': {
    id: 'annotation:overflow-tools',
    labelKey: 'annotation.overflowTools',
    icon: 'menu-dots',
    categories: ['annotation'],
    action: ({ registry, documentId }) => {
      const uiCapability = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!uiCapability) return;

      const scope = uiCapability.forDocument(documentId);
      if (!scope) return;

      scope.toggleMenu(
        'annotation-tools-menu',
        'annotation:overflow-tools',
        'overflow-annotation-tools',
      );
    },
    active: ({ state, documentId }) => {
      const ui = state.plugins['ui']?.documents[documentId];
      return ui?.openMenus['annotation-tools-menu'] !== undefined;
    },
  },

  // ─────────────────────────────────────────────────────────
  // Group Annotation Commands
  // ─────────────────────────────────────────────────────────
  'annotation:toggle-group': {
    id: 'annotation:toggle-group',
    labelKey: ({ registry, documentId }) => {
      const action = registry
        .getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)
        ?.provides()
        .forDocument(documentId)
        .getGroupingAction();
      return action === 'ungroup' ? 'annotation.ungroup' : 'annotation.group';
    },
    icon: ({ registry, documentId }) => {
      const action = registry
        .getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)
        ?.provides()
        .forDocument(documentId)
        .getGroupingAction();
      return action === 'ungroup' ? 'ungroup' : 'group';
    },
    categories: ['annotation'],
    action: ({ registry, documentId }) => {
      const scope = registry
        .getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)
        ?.provides()
        .forDocument(documentId);
      if (!scope) return;

      const action = scope.getGroupingAction();
      if (action === 'ungroup') {
        const selected = scope.getSelectedAnnotations();
        if (selected.length > 0) {
          scope.ungroupAnnotations(selected[0].object.id);
        }
      } else if (action === 'group') {
        scope.groupAnnotations();
      }
    },
    disabled: ({ registry, state, documentId }) => {
      if (lacksPermission(state, documentId, PdfPermissionFlag.ModifyAnnotations)) return true;
      const action = registry
        .getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)
        ?.provides()
        .forDocument(documentId)
        .getGroupingAction();
      return action === 'disabled';
    },
  },

  'annotation:delete-all-selected': {
    id: 'annotation:delete-all-selected',
    labelKey: 'annotation.deleteAllSelected',
    icon: 'trash',
    categories: ['annotation'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      const selectedAnnotations = annotationScope.getSelectedAnnotations();
      for (const anno of selectedAnnotations) {
        annotationScope.deleteAnnotation(anno.object.pageIndex, anno.object.id);
      }
    },
    disabled: ({ state, documentId }) => {
      return lacksPermission(state, documentId, PdfPermissionFlag.ModifyAnnotations);
    },
  },

  // ─────────────────────────────────────────────────────────
  // Link Annotation Commands
  // ─────────────────────────────────────────────────────────
  'annotation:add-link': {
    id: 'annotation:add-link',
    labelKey: 'annotation.addLink',
    icon: 'link',
    categories: ['annotation'],
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      // Open the link modal - it will detect text selection context
      ui.forDocument(documentId).openModal('link-modal');
    },
    disabled: ({ state, documentId }) => {
      return lacksPermission(state, documentId, PdfPermissionFlag.ModifyAnnotations);
    },
  },

  'annotation:toggle-link': {
    id: 'annotation:toggle-link',
    labelKey: ({ registry, documentId }) => {
      const scope = registry
        .getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)
        ?.provides()
        .forDocument(documentId);
      if (!scope) return 'annotation.addLink';
      const selected = scope.getSelectedAnnotation();
      if (!selected) return 'annotation.addLink';
      return scope.hasAttachedLinks(selected.object.id)
        ? 'annotation.removeLink'
        : 'annotation.addLink';
    },
    icon: ({ registry, documentId }) => {
      const scope = registry
        .getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)
        ?.provides()
        .forDocument(documentId);
      if (!scope) return 'link';
      const selected = scope.getSelectedAnnotation();
      if (!selected) return 'link';
      return scope.hasAttachedLinks(selected.object.id) ? 'link-off' : 'link';
    },
    categories: ['annotation'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!annotation || !ui) return;

      const scope = annotation.forDocument(documentId);
      const selected = scope.getSelectedAnnotation();
      if (!selected) return;

      if (scope.hasAttachedLinks(selected.object.id)) {
        scope.deleteAttachedLinks(selected.object.id);
      } else {
        ui.forDocument(documentId).openModal('link-modal');
      }
    },
    visible: ({ registry, documentId }) => {
      const scope = registry
        .getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)
        ?.provides()
        .forDocument(documentId);
      const selected = scope?.getSelectedAnnotation();
      if (!selected) return true;
      return (
        selected.object.type !== PdfAnnotationSubtype.LINK &&
        selected.object.type !== PdfAnnotationSubtype.REDACT
      );
    },
    disabled: ({ state, documentId }) => {
      return lacksPermission(state, documentId, PdfPermissionFlag.ModifyAnnotations);
    },
  },
};
