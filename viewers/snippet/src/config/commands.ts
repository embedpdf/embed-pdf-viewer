import { Command } from '@embedpdf/plugin-commands/preact';
import { CapturePlugin } from '@embedpdf/plugin-capture/preact';
import { ZoomMode, ZoomPlugin } from '@embedpdf/plugin-zoom/preact';
import { PanPlugin } from '@embedpdf/plugin-pan/preact';
import { SpreadMode, SpreadPlugin } from '@embedpdf/plugin-spread/preact';
import { RotatePlugin } from '@embedpdf/plugin-rotate/preact';
import {
  ANNOTATION_PLUGIN_ID,
  AnnotationPlugin,
  getToolDefaultsById,
  isHighlightTool,
  isSquigglyTool,
  isStrikeoutTool,
  isUnderlineTool,
} from '@embedpdf/plugin-annotation/preact';
import {
  REDACTION_PLUGIN_ID,
  RedactionMode,
  RedactionPlugin,
} from '@embedpdf/plugin-redaction/preact';
import { ExportPlugin } from '@embedpdf/plugin-export/preact';
import { DocumentManagerPlugin } from '@embedpdf/plugin-document-manager/preact';
import { HISTORY_PLUGIN_ID, HistoryPlugin } from '@embedpdf/plugin-history/preact';
import { State } from './types';
import { isSidebarOpen, isToolbarOpen, UI_PLUGIN_ID, UIPlugin } from '@embedpdf/plugin-ui';
import { ScrollPlugin, ScrollStrategy } from '@embedpdf/plugin-scroll/preact';
import { InteractionManagerPlugin } from '@embedpdf/plugin-interaction-manager/preact';
import { FullscreenPlugin } from '@embedpdf/plugin-fullscreen/preact';
import { SELECTION_PLUGIN_ID, SelectionPlugin } from '@embedpdf/plugin-selection/preact';
import { ignore, PdfAnnotationSubtype, PdfBlendMode, uuidV4 } from '@embedpdf/models';

export const commands: Record<string, Command<State>> = {
  // ─────────────────────────────────────────────────────────
  // Zoom Commands
  // ─────────────────────────────────────────────────────────
  'zoom:in': {
    id: 'zoom:in',
    labelKey: 'zoom.in',
    icon: 'zoomIn',
    shortcuts: ['Ctrl+=', 'Meta+=', 'Ctrl+NumpadAdd', 'Meta+NumpadAdd'],
    categories: ['zoom', 'zoom-in'],
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
    icon: 'zoomOut',
    shortcuts: ['Ctrl+-', 'Meta+-', 'Ctrl+NumpadSubtract', 'Meta+NumpadSubtract'],
    categories: ['zoom', 'zoom-out'],
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
    icon: 'fitToPage',
    shortcuts: ['Ctrl+0', 'Meta+0'],
    categories: ['zoom', 'zoom-fit-page'],
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
    icon: 'fitToWidth',
    shortcuts: ['Ctrl+1', 'Meta+1'],
    categories: ['zoom', 'zoom-fit-width'],
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
    icon: 'zoomInArea',
    shortcuts: ['Ctrl+M', 'Meta+M'],
    categories: ['zoom', 'zoom-marquee'],
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
    categories: ['zoom', 'zoom-level', 'zoom-level-25'],
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
    categories: ['zoom', 'zoom-level', 'zoom-level-50'],
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
    categories: ['zoom', 'zoom-level', 'zoom-level-100'],
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
    categories: ['zoom', 'zoom-level', 'zoom-level-125'],
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
    categories: ['zoom', 'zoom-level', 'zoom-level-150'],
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
    categories: ['zoom', 'zoom-level', 'zoom-level-200'],
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
    categories: ['zoom', 'zoom-level', 'zoom-level-400'],
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
    categories: ['zoom', 'zoom-level', 'zoom-level-800'],
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
    categories: ['zoom', 'zoom-level', 'zoom-level-1600'],
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
    icon: 'chevronDown',
    iconProps: {
      className: 'h-3.5 w-3.5',
    },
    categories: ['zoom', 'zoom-menu'],
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
    icon: 'zoomIn',
    categories: ['zoom', 'zoom-menu'],
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
    categories: ['tools', 'pan'],
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
    categories: ['tools', 'pointer'],
    action: ({ registry, documentId }) => {
      const pointer = registry
        .getPlugin<InteractionManagerPlugin>('interaction-manager')
        ?.provides();
      if (!pointer) return;

      const scope = pointer.forDocument(documentId);
      scope.activate('pointerMode');
    },
    active: ({ state, documentId }) =>
      state.plugins['interaction-manager']?.documents[documentId]?.activeMode === 'pointerMode',
  },

  'left-action-menu:overflow-menu': {
    id: 'left-action-menu:overflow-menu',
    labelKey: 'menu.moreOptions',
    icon: 'dots',
    categories: ['ui', 'ui-menu'],
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      // Toggle the overflow tabs menu
      ui.toggleMenu(
        'left-action-menu',
        'left-action-menu:overflow-menu',
        'overflow-left-action-menu-button',
        documentId,
      );
    },
    active: ({ state, documentId }) => {
      const uiState = state.plugins['ui']?.documents[documentId];
      return uiState?.openMenus['left-action-menu'] !== undefined;
    },
  },

  // ─────────────────────────────────────────────────────────
  // Capture Command
  // ─────────────────────────────────────────────────────────
  'capture:screenshot': {
    id: 'capture:screenshot',
    labelKey: 'capture.screenshot',
    icon: 'screenshot',
    shortcuts: ['Ctrl+Shift+S', 'Meta+Shift+S'],
    categories: ['tools', 'capture', 'capture-screenshot'],
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
    categories: ['document', 'document-menu'],
    action: ({ registry, documentId }) => {
      const uiPlugin = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID);
      if (!uiPlugin || !uiPlugin.provides) return;

      const uiCapability = uiPlugin.provides();
      if (!uiCapability) return;

      const scope = uiCapability.forDocument(documentId);
      scope.toggleMenu('document-menu', 'document:menu', 'document-menu-button');
    },
    active: ({ state, documentId }) => {
      const uiState = state.plugins['ui']?.documents[documentId];
      return uiState?.openMenus['document-menu'] !== undefined;
    },
  },

  'document:open': {
    id: 'document:open',
    labelKey: 'document.open',
    icon: 'fileImport',
    shortcuts: ['Ctrl+O', 'Meta+O'],
    categories: ['document', 'document-open'],
    action: ({ registry }) => {
      const docManager = registry.getPlugin<DocumentManagerPlugin>('document-manager')?.provides();
      docManager?.openFileDialog();
    },
  },

  'document:close': {
    id: 'document:close',
    labelKey: 'document.close',
    icon: 'x',
    shortcuts: ['Ctrl+W', 'Meta+W'],
    categories: ['document', 'document-close'],
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
    categories: ['document', 'document-print'],
    action: ({ registry, documentId }) => {
      const uiPlugin = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID);
      if (!uiPlugin || !uiPlugin.provides) return;

      const uiCapability = uiPlugin.provides();
      if (!uiCapability) return;

      const scope = uiCapability.forDocument(documentId);
      scope.openModal('print-modal');
    },
  },

  'document:export': {
    id: 'document:export',
    labelKey: 'document.export',
    icon: 'download',
    categories: ['document', 'document-export'],
    action: ({ registry, documentId }) => {
      const exportPlugin = registry.getPlugin<ExportPlugin>('export')?.provides();
      exportPlugin?.forDocument(documentId).download();
    },
  },

  'document:fullscreen': {
    id: 'document:fullscreen',
    labelKey: 'document.fullscreen',
    icon: 'fullscreen',
    shortcuts: ['F11'],
    categories: ['document', 'document-fullscreen'],
    action: ({ registry }) => {
      const fullscreen = registry.getPlugin<FullscreenPlugin>('fullscreen')?.provides();
      if (!fullscreen) return;

      if (fullscreen.isFullscreen()) {
        fullscreen.exitFullscreen();
      } else {
        fullscreen.enableFullscreen();
      }
    },
    active: ({ state }) => state.plugins['fullscreen']?.isFullscreen ?? false,
  },

  // ─────────────────────────────────────────────────────────
  // Panel Commands
  // ─────────────────────────────────────────────────────────
  'panel:toggle-sidebar': {
    id: 'panel:toggle-sidebar',
    labelKey: 'panel.sidebar',
    icon: 'sidebar',
    categories: ['panel', 'panel-sidebar'],
    action: ({ registry, documentId }) => {
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
    categories: ['panel', 'panel-search'],
    action: ({ registry, documentId }) => {
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
    categories: ['panel', 'panel-comment'],
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

  'panel:toggle-annotation-style': {
    id: 'panel:toggle-annotation-style',
    labelKey: 'panel.annotationStyle',
    icon: 'palette',
    categories: ['panel', 'panel-annotation-style'],
    action: ({ registry, documentId }) => {
      const uiPlugin = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID);
      if (!uiPlugin || !uiPlugin.provides) return;

      const uiCapability = uiPlugin.provides();
      if (!uiCapability) return;

      const scope = uiCapability.forDocument(documentId);
      scope.toggleSidebar('left', 'main', 'annotation-panel');
    },
    active: ({ state, documentId }) => {
      return isSidebarOpen(state.plugins, documentId, 'left', 'main', 'annotation-panel');
    },
  },

  // ─────────────────────────────────────────────────────────
  // Page Settings Commands
  // ─────────────────────────────────────────────────────────
  'page:settings': {
    id: 'page:settings',
    labelKey: 'page.settings',
    icon: 'viewSettings',
    categories: ['page', 'page-settings'],
    action: ({ registry, documentId }) => {
      const uiPlugin = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID);
      if (!uiPlugin || !uiPlugin.provides) return;

      const uiCapability = uiPlugin.provides();
      if (!uiCapability) return;

      const scope = uiCapability.forDocument(documentId);
      scope.toggleMenu('page-settings-menu', 'page:settings', 'page-settings-button');
    },
    active: ({ state, documentId }) => {
      const uiState = state.plugins['ui']?.documents[documentId];
      return uiState?.openMenus['page-settings-menu'] !== undefined;
    },
  },

  'spread:none': {
    id: 'spread:none',
    labelKey: 'page.single',
    icon: 'singlePage',
    categories: ['page', 'spread', 'spread-none'],
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
    icon: 'doublePage',
    categories: ['page', 'spread', 'spread-odd'],
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
    icon: 'book2',
    categories: ['page', 'spread', 'spread-even'],
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
    icon: 'rotateClockwise',
    shortcuts: ['Ctrl+]', 'Meta+]'],
    categories: ['page', 'rotate', 'rotate-clockwise'],
    action: ({ registry, documentId }) => {
      const rotate = registry.getPlugin<RotatePlugin>('rotate')?.provides();
      rotate?.forDocument(documentId).rotateForward();
    },
  },

  'rotate:counter-clockwise': {
    id: 'rotate:counter-clockwise',
    labelKey: 'rotate.counterClockwise',
    icon: 'rotateCounterClockwise',
    shortcuts: ['Ctrl+[', 'Meta+['],
    categories: ['page', 'rotate', 'rotate-counter-clockwise'],
    action: ({ registry, documentId }) => {
      const rotate = registry.getPlugin<RotatePlugin>('rotate')?.provides();
      rotate?.forDocument(documentId).rotateBackward();
    },
  },

  'scroll:vertical': {
    id: 'scroll:vertical',
    labelKey: 'page.vertical',
    icon: 'vertical',
    categories: ['page', 'scroll', 'scroll-vertical'],
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
    icon: 'horizontal',
    categories: ['page', 'scroll', 'scroll-horizontal'],
    action: ({ registry, documentId }) => {
      const scroll = registry.getPlugin<ScrollPlugin>('scroll')?.provides();
      scroll?.forDocument(documentId).setScrollStrategy(ScrollStrategy.Horizontal);
    },
    active: ({ state, documentId }) =>
      state.plugins['scroll']?.documents[documentId]?.strategy === ScrollStrategy.Horizontal,
  },

  'scroll:next-page': {
    id: 'scroll:next-page',
    labelKey: 'page.next',
    icon: 'chevronRight',
    categories: ['page', 'navigation', 'navigation-next'],
    shortcuts: ['Ctrl+]', 'Meta+]', 'ArrowRight'],
    action: ({ registry, documentId }) => {
      const scroll = registry.getPlugin<ScrollPlugin>('scroll')?.provides();
      scroll?.forDocument(documentId).scrollToNextPage();
    },
    disabled: ({ state, documentId }) => {
      return (
        state.plugins['scroll']?.documents[documentId]?.currentPage >=
        state.plugins['scroll']?.documents[documentId]?.totalPages
      );
    },
  },

  'scroll:previous-page': {
    id: 'scroll:previous-page',
    labelKey: 'page.previous',
    icon: 'chevronLeft',
    categories: ['page', 'navigation', 'navigation-previous'],
    shortcuts: ['Ctrl+[', 'Meta+[', 'ArrowLeft'],
    action: ({ registry, documentId }) => {
      const scroll = registry.getPlugin<ScrollPlugin>('scroll')?.provides();
      scroll?.forDocument(documentId).scrollToPreviousPage();
    },
    disabled: ({ state, documentId }) => {
      return state.plugins['scroll']?.documents[documentId]?.currentPage <= 1;
    },
  },

  // ─────────────────────────────────────────────────────────
  // Mode Commands
  // ─────────────────────────────────────────────────────────
  'mode:view': {
    id: 'mode:view',
    labelKey: 'mode.view',
    categories: ['mode', 'mode-view'],
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      const interactionManager = registry
        .getPlugin<InteractionManagerPlugin>('interaction-manager')
        ?.provides();
      if (!ui || !interactionManager) return;

      const interactionScope = interactionManager.forDocument(documentId);
      if (!interactionScope) return;

      interactionScope.activate('pointerMode');
      ui.forDocument(documentId).closeToolbarSlot('top', 'secondary');
    },
    active: ({ state, documentId }) => {
      return !isToolbarOpen(state.plugins, documentId, 'top', 'secondary');
    },
  },

  'mode:annotate': {
    id: 'mode:annotate',
    labelKey: 'mode.annotate',
    categories: ['mode', 'mode-annotate', 'annotation'],
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      ui.setActiveToolbar('top', 'secondary', 'annotation-toolbar', documentId);
    },
    active: ({ state, documentId }) => {
      return isToolbarOpen(state.plugins, documentId, 'top', 'secondary', 'annotation-toolbar');
    },
  },

  'mode:shapes': {
    id: 'mode:shapes',
    labelKey: 'mode.shapes',
    categories: ['mode', 'mode-shapes', 'annotation'],
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      ui.setActiveToolbar('top', 'secondary', 'shapes-toolbar', documentId);
    },
    active: ({ state, documentId }) => {
      return isToolbarOpen(state.plugins, documentId, 'top', 'secondary', 'shapes-toolbar');
    },
  },

  'mode:redact': {
    id: 'mode:redact',
    labelKey: 'mode.redact',
    categories: ['mode', 'mode-redact', 'redaction'],
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      ui.setActiveToolbar('top', 'secondary', 'redaction-toolbar', documentId);
    },
    active: ({ state, documentId }) => {
      return isToolbarOpen(state.plugins, documentId, 'top', 'secondary', 'redaction-toolbar');
    },
  },

  'tabs:overflow-menu': {
    id: 'tabs:overflow-menu',
    labelKey: 'tabs.overflowMenu',
    icon: 'dots',
    categories: ['ui', 'ui-menu'],
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
    active: ({ state, documentId }) => {
      return (
        state.plugins['ui']?.documents[documentId]?.openMenus['mode-tabs-overflow-menu'] !==
        undefined
      );
    },
  },

  // ─────────────────────────────────────────────────────────
  // Annotation Commands
  // ─────────────────────────────────────────────────────────
  'annotation:add-highlight': {
    id: 'annotation:add-highlight',
    labelKey: 'annotation.highlight',
    icon: 'highlight',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'highlight')?.color,
    }),
    categories: ['annotation', 'annotation-markup', 'annotation-highlight'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const selection = registry.getPlugin<SelectionPlugin>(SELECTION_PLUGIN_ID)?.provides();
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();

      if (!selection || !annotation || !ui) return;

      const annotationScope = annotation?.forDocument(documentId);
      const selectionScope = selection?.forDocument(documentId);

      if (!annotationScope || !selectionScope) return;

      const tool = annotation.getTool('highlight');
      if (!tool) return;

      if (!isHighlightTool(tool)) return;

      const defaultSettings = tool.defaults;
      const formattedSelection = selectionScope.getFormattedSelection();
      const selectionText = selectionScope.getSelectedText();

      // If there's a selection, create highlights for it
      if (formattedSelection.length > 0) {
        for (const sel of formattedSelection) {
          selectionText.wait((text) => {
            const annotationId = uuidV4();
            annotationScope.createAnnotation(sel.pageIndex, {
              id: annotationId,
              created: new Date(),
              flags: ['print'],
              type: PdfAnnotationSubtype.HIGHLIGHT,
              blendMode: PdfBlendMode.Multiply,
              color: defaultSettings.color,
              opacity: defaultSettings.opacity,
              pageIndex: sel.pageIndex,
              rect: sel.rect,
              segmentRects: sel.segmentRects,
              custom: {
                text: text.join('\n'),
              },
            });

            annotationScope.selectAnnotation(sel.pageIndex, annotationId);
          }, ignore);
        }
        selectionScope.clear();
        annotationScope.setActiveTool('highlight');
        ui.setActiveToolbar('top', 'secondary', 'annotation-toolbar', documentId);
      } else {
        // No selection - toggle the highlight tool
        if (annotationScope.getActiveTool()?.id === 'highlight') {
          annotationScope.setActiveTool(null);
        } else {
          annotationScope.setActiveTool('highlight');
        }
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'highlight';
    },
  },

  'annotation:add-underline': {
    id: 'annotation:add-underline',
    labelKey: 'annotation.underline',
    icon: 'underline',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'underline')?.color,
    }),
    categories: ['annotation', 'annotation-markup', 'annotation-underline'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const selection = registry.getPlugin<SelectionPlugin>(SELECTION_PLUGIN_ID)?.provides();
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();

      if (!selection || !annotation || !ui) return;

      const annotationScope = annotation?.forDocument(documentId);
      const selectionScope = selection?.forDocument(documentId);

      if (!annotationScope || !selectionScope) return;

      const tool = annotation.getTool('underline');
      if (!tool) return;

      if (!isUnderlineTool(tool)) return;

      const defaultSettings = tool.defaults;
      const formattedSelection = selectionScope.getFormattedSelection();
      const selectionText = selectionScope.getSelectedText();

      // If there's a selection, create underlines for it
      if (formattedSelection.length > 0) {
        for (const sel of formattedSelection) {
          selectionText.wait((text) => {
            const annotationId = uuidV4();
            annotationScope.createAnnotation(sel.pageIndex, {
              id: annotationId,
              created: new Date(),
              flags: ['print'],
              type: PdfAnnotationSubtype.UNDERLINE,
              color: defaultSettings.color,
              opacity: defaultSettings.opacity,
              pageIndex: sel.pageIndex,
              rect: sel.rect,
              segmentRects: sel.segmentRects,
              custom: {
                text: text.join('\n'),
              },
            });

            annotationScope.selectAnnotation(sel.pageIndex, annotationId);
          }, ignore);
        }
        selectionScope.clear();
        annotationScope.setActiveTool('underline');
        ui.setActiveToolbar('top', 'secondary', 'annotation-toolbar', documentId);
      } else {
        // No selection - toggle the underline tool
        if (annotationScope.getActiveTool()?.id === 'underline') {
          annotationScope.setActiveTool(null);
        } else {
          annotationScope.setActiveTool('underline');
        }
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'underline';
    },
  },

  'annotation:add-strikeout': {
    id: 'annotation:add-strikeout',
    labelKey: 'annotation.strikeout',
    icon: 'strikethrough',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'strikeout')?.color,
    }),
    categories: ['annotation', 'annotation-markup', 'annotation-strikeout'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const selection = registry.getPlugin<SelectionPlugin>(SELECTION_PLUGIN_ID)?.provides();
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();

      if (!selection || !annotation || !ui) return;

      const annotationScope = annotation?.forDocument(documentId);
      const selectionScope = selection?.forDocument(documentId);

      if (!annotationScope || !selectionScope) return;

      const tool = annotation.getTool('strikeout');
      if (!tool) return;

      if (!isStrikeoutTool(tool)) return;

      const defaultSettings = tool.defaults;
      const formattedSelection = selectionScope.getFormattedSelection();
      const selectionText = selectionScope.getSelectedText();

      // If there's a selection, create strikeouts for it
      if (formattedSelection.length > 0) {
        for (const sel of formattedSelection) {
          selectionText.wait((text) => {
            const annotationId = uuidV4();
            annotationScope.createAnnotation(sel.pageIndex, {
              id: annotationId,
              created: new Date(),
              flags: ['print'],
              type: PdfAnnotationSubtype.STRIKEOUT,
              color: defaultSettings.color,
              opacity: defaultSettings.opacity,
              pageIndex: sel.pageIndex,
              rect: sel.rect,
              segmentRects: sel.segmentRects,
              custom: {
                text: text.join('\n'),
              },
            });

            annotationScope.selectAnnotation(sel.pageIndex, annotationId);
          }, ignore);
        }
        selectionScope.clear();
        annotationScope.setActiveTool('strikeout');
        ui.setActiveToolbar('top', 'secondary', 'annotation-toolbar', documentId);
      } else {
        // No selection - toggle the strikeout tool
        if (annotationScope.getActiveTool()?.id === 'strikeout') {
          annotationScope.setActiveTool(null);
        } else {
          annotationScope.setActiveTool('strikeout');
        }
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'strikeout';
    },
  },

  'annotation:add-squiggly': {
    id: 'annotation:add-squiggly',
    labelKey: 'annotation.squiggly',
    icon: 'squiggly',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'squiggly')?.color,
    }),
    categories: ['annotation', 'annotation-markup', 'annotation-squiggly'],
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const selection = registry.getPlugin<SelectionPlugin>(SELECTION_PLUGIN_ID)?.provides();
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();

      if (!selection || !annotation || !ui) return;

      const annotationScope = annotation?.forDocument(documentId);
      const selectionScope = selection?.forDocument(documentId);

      if (!annotationScope || !selectionScope) return;

      const tool = annotation.getTool('squiggly');
      if (!tool) return;

      if (!isSquigglyTool(tool)) return;

      const defaultSettings = tool.defaults;
      const formattedSelection = selectionScope.getFormattedSelection();
      const selectionText = selectionScope.getSelectedText();

      // If there's a selection, create squiggly annotations for it
      if (formattedSelection.length > 0) {
        for (const sel of formattedSelection) {
          selectionText.wait((text) => {
            const annotationId = uuidV4();
            annotationScope.createAnnotation(sel.pageIndex, {
              id: annotationId,
              created: new Date(),
              flags: ['print'],
              type: PdfAnnotationSubtype.SQUIGGLY,
              color: defaultSettings.color,
              opacity: defaultSettings.opacity,
              pageIndex: sel.pageIndex,
              rect: sel.rect,
              segmentRects: sel.segmentRects,
              custom: {
                text: text.join('\n'),
              },
            });

            annotationScope.selectAnnotation(sel.pageIndex, annotationId);
          }, ignore);
        }
        selectionScope.clear();
        annotationScope.setActiveTool('squiggly');
        ui.setActiveToolbar('top', 'secondary', 'annotation-toolbar', documentId);
      } else {
        // No selection - toggle the squiggly tool
        if (annotationScope.getActiveTool()?.id === 'squiggly') {
          annotationScope.setActiveTool(null);
        } else {
          annotationScope.setActiveTool('squiggly');
        }
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'squiggly';
    },
  },

  'annotation:add-ink': {
    id: 'annotation:add-ink',
    labelKey: 'annotation.ink',
    icon: 'pencilMarker',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'ink')?.color,
    }),
    categories: ['annotation', 'annotation-ink'],
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

  'annotation:add-text': {
    id: 'annotation:add-text',
    labelKey: 'annotation.text',
    icon: 'text',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'freeText')?.fontColor,
    }),
    categories: ['annotation', 'annotation-text'],
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

  'annotation:add-stamp': {
    id: 'annotation:add-stamp',
    labelKey: 'annotation.stamp',
    icon: 'photo',
    categories: ['annotation', 'annotation-stamp'],
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

  'annotation:add-rectangle': {
    id: 'annotation:add-rectangle',
    labelKey: 'annotation.rectangle',
    icon: 'square',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'square')?.strokeColor,
      secondaryColor: getToolDefaultsById(state.plugins.annotation, 'square')?.color,
    }),
    categories: ['annotation', 'annotation-shape', 'annotation-rectangle'],
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
    categories: ['annotation', 'annotation-shape', 'annotation-circle'],
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
    categories: ['annotation', 'annotation-shape', 'annotation-line'],
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
    icon: 'lineArrow',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'line')?.strokeColor,
    }),
    categories: ['annotation', 'annotation-shape', 'annotation-arrow'],
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
    categories: ['annotation', 'annotation-shape', 'annotation-polygon'],
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
    icon: 'zigzag',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'polyline')?.strokeColor,
    }),
    categories: ['annotation', 'annotation-shape', 'annotation-polyline'],
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

  'annotation:delete-selected': {
    id: 'annotation:delete-selected',
    labelKey: 'annotation.deleteSelected',
    icon: 'trash',
    categories: ['annotation', 'annotation-delete'],
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

  'annotation:overflow-tools': {
    id: 'annotation:overflow-tools',
    labelKey: 'annotation.moreTools',
    icon: 'dots',
    categories: ['annotation', 'annotation-overflow'],
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

  'annotation:overflow-shapes': {
    id: 'annotation:overflow-shapes',
    labelKey: 'annotation.moreTools',
    icon: 'dots',
    categories: ['annotation', 'annotation-shape', 'annotation-overflow'],
    action: ({ registry, documentId }) => {
      const uiCapability = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!uiCapability) return;

      const scope = uiCapability.forDocument(documentId);
      if (!scope) return;

      scope.toggleMenu('shapes-tools-menu', 'annotation:overflow-shapes', 'overflow-shapes-tools');
    },
    active: ({ state, documentId }) => {
      const ui = state.plugins['ui']?.documents[documentId];
      return ui?.openMenus['shapes-tools-menu'] !== undefined;
    },
  },

  // ─────────────────────────────────────────────────────────
  // Redaction Commands
  // ─────────────────────────────────────────────────────────
  'redaction:redact-area': {
    id: 'redaction:redact-area',
    labelKey: 'redaction.area',
    icon: 'redactArea',
    categories: ['redaction', 'redaction-area'],
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
    icon: 'redact',
    categories: ['redaction', 'redaction-text'],
    action: ({ registry, documentId }) => {
      const redaction = registry.getPlugin<RedactionPlugin>('redaction')?.provides();
      const selection = registry.getPlugin<SelectionPlugin>(SELECTION_PLUGIN_ID)?.provides();
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();

      if (!redaction || !selection || !ui) return;

      const redactionScope = redaction.forDocument(documentId);
      const selectionScope = selection?.forDocument(documentId);

      // If there's a selection, create pending redaction for it
      const formattedSelection = selectionScope?.getFormattedSelection() ?? [];

      if (formattedSelection.length > 0) {
        // queueCurrentSelectionAsPending handles everything:
        // - Creates pending redaction items from selection
        // - Enables redact selection mode
        // - Selects the last pending item
        // - Clears the text selection
        redactionScope.queueCurrentSelectionAsPending();
        ui.setActiveToolbar('top', 'secondary', 'redaction-toolbar', documentId);
      } else {
        // No selection - toggle the redact text tool
        redactionScope.toggleRedactSelection();
      }
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
    categories: ['redaction', 'redaction-apply'],
    action: ({ registry, documentId }) => {
      const redaction = registry.getPlugin<RedactionPlugin>('redaction')?.provides();
      redaction?.forDocument(documentId).commitAllPending();
    },
    disabled: ({ state, documentId }) => {
      const redaction = state.plugins[REDACTION_PLUGIN_ID]?.documents[documentId];
      return redaction?.pendingCount === 0;
    },
  },

  'redaction:clear-all': {
    id: 'redaction:clear-all',
    labelKey: 'redaction.clearAll',
    icon: 'x',
    categories: ['redaction', 'redaction-clear'],
    action: ({ registry, documentId }) => {
      const redaction = registry.getPlugin<RedactionPlugin>('redaction')?.provides();
      redaction?.forDocument(documentId).clearPending();
    },
    disabled: ({ state, documentId }) => {
      const redaction = state.plugins[REDACTION_PLUGIN_ID]?.documents[documentId];
      return redaction?.pendingCount === 0;
    },
  },

  'redaction:delete-selected': {
    id: 'redaction:delete-selected',
    labelKey: 'redaction.deleteSelected',
    icon: 'trash',
    categories: ['redaction', 'redaction-delete'],
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
    categories: ['redaction', 'redaction-commit'],
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
    categories: ['selection', 'selection-copy'],
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
    icon: 'arrowBackUp',
    shortcuts: ['Ctrl+Z', 'Meta+Z'],
    categories: ['history', 'history-undo'],
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
    icon: 'arrowForwardUp',
    shortcuts: ['Ctrl+Y', 'Meta+Shift+Z'],
    categories: ['history', 'history-redo'],
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
};
