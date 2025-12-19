import { UISchema } from '@embedpdf/plugin-ui';

/**
 * UI Schema Configuration
 *
 * This defines the complete UI structure for the PDF viewer application.
 * The schema is a declarative, type-safe way to define toolbars, menus, and panels.
 */
export const viewerUISchema: UISchema = {
  id: 'pdf-viewer-ui',
  version: '1.0.0',

  // ─────────────────────────────────────────────────────────
  // Toolbars
  // ─────────────────────────────────────────────────────────
  toolbars: {
    // Main toolbar at the top
    'main-toolbar': {
      id: 'main-toolbar',
      position: {
        placement: 'top',
        slot: 'main',
        order: 0,
      },
      permanent: true,
      responsive: {
        localeOverrides: {
          groups: [
            {
              id: 'germanic-languages',
              locales: ['de', 'nl'],
              breakpoints: {
                md: {
                  replaceShow: ['annotate-mode', 'zoom-toolbar'],
                },
              },
            },
          ],
        },
        breakpoints: {
          xs: {
            maxWidth: 640,
            hide: [
              'annotate-mode',
              'shapes-mode',
              'redact-mode',
              'zoom-toolbar',
              'pan-button',
              'pointer-button',
              'divider-3',
            ],
            show: ['overflow-tabs-button'],
          },
          sm: {
            minWidth: 640,
            maxWidth: 768,
            hide: ['shapes-mode', 'redact-mode', 'zoom-toolbar'],
            show: [
              'annotate-mode',
              'overflow-tabs-button',
              'pan-button',
              'pointer-button',
              'divider-3',
            ],
          },
          md: {
            minWidth: 768,
            show: ['annotate-mode', 'shapes-mode', 'zoom-toolbar'],
            hide: ['zoom-menu-button'],
          },
          lg: {
            minWidth: 1024,
            show: ['shapes-mode', 'redact-mode'],
            hide: ['overflow-tabs-button'],
          },
        },
      },
      items: [
        // ───────── Left Section: Document & Navigation ─────────
        {
          type: 'group',
          id: 'left-group',
          alignment: 'start',
          gap: 1,
          items: [
            {
              type: 'command-button',
              id: 'document-menu-button',
              commandId: 'document:menu',
              variant: 'icon',
            },
            {
              type: 'divider',
              id: 'divider-1',
              orientation: 'vertical',
            },
            {
              type: 'command-button',
              id: 'sidebar-button',
              commandId: 'panel:toggle-sidebar',
              variant: 'icon',
            },
            {
              type: 'command-button',
              id: 'page-settings-button',
              commandId: 'page:settings',
              variant: 'icon',
            },
          ],
        },

        // ───────── Center Section: Zoom & Tools ─────────
        {
          type: 'divider',
          id: 'divider-2',
          orientation: 'vertical',
        },
        {
          type: 'group',
          id: 'center-group',
          alignment: 'center',
          gap: 2,
          items: [
            {
              type: 'command-button',
              id: 'zoom-menu-button',
              commandId: 'zoom:toggle-menu-mobile',
              variant: 'icon',
            },
            {
              type: 'custom',
              id: 'zoom-toolbar',
              componentId: 'zoom-toolbar',
            },
            {
              type: 'divider',
              id: 'divider-3',
              orientation: 'vertical',
            },
            {
              type: 'command-button',
              id: 'pan-button',
              commandId: 'pan:toggle',
              variant: 'icon',
            },
            {
              type: 'command-button',
              id: 'pointer-button',
              commandId: 'pointer:toggle',
              variant: 'icon',
            },
          ],
        },

        // ───────── Spacer: Flexible space ─────────
        {
          type: 'spacer',
          id: 'spacer-1',
          flex: true,
        },

        // ───────── Mode Tabs ─────────
        {
          type: 'tab-group',
          id: 'mode-tabs',
          tabs: [
            {
              id: 'view-mode',
              commandId: 'mode:view',
              variant: 'text',
            },
            {
              id: 'annotate-mode',
              commandId: 'mode:annotate',
              variant: 'text',
            },
            {
              id: 'shapes-mode',
              commandId: 'mode:shapes',
              variant: 'text',
            },
            {
              id: 'redact-mode',
              commandId: 'mode:redact',
              variant: 'text',
            },
            {
              id: 'overflow-tabs-button',
              commandId: 'tabs:overflow-menu',
              variant: 'icon',
            },
          ],
        },

        // ───────── Spacer: Flexible space ─────────
        {
          type: 'spacer',
          id: 'spacer-2',
          flex: true,
        },

        // ───────── Right Section: Search & Actions ─────────
        {
          type: 'group',
          id: 'right-group',
          alignment: 'end',
          gap: 2,
          items: [
            {
              type: 'command-button',
              id: 'search-button',
              commandId: 'panel:toggle-search',
              variant: 'icon',
            },
            {
              type: 'command-button',
              id: 'comment-button',
              commandId: 'panel:toggle-comment',
              variant: 'icon',
            },
          ],
        },
      ],
    },

    // Annotation toolbar (shown when in annotate mode)
    'annotation-toolbar': {
      id: 'annotation-toolbar',
      position: {
        placement: 'top',
        slot: 'secondary',
        order: 0,
      },
      responsive: {
        breakpoints: {
          sm: {
            maxWidth: 640,
            hide: ['redo-button', 'undo-button'],
            show: ['overflow-annotation-tools'],
          },
          md: {
            minWidth: 640,
            show: ['redo-button', 'undo-button'],
            hide: ['overflow-annotation-tools'],
          },
        },
      },
      permanent: false,
      items: [
        { type: 'spacer', id: 'spacer-3', flex: true },
        {
          type: 'group',
          id: 'annotation-tools',
          alignment: 'start',
          gap: 2,
          items: [
            {
              type: 'command-button',
              id: 'add-highlight',
              commandId: 'annotation:add-highlight',
              variant: 'icon',
            },
            {
              type: 'command-button',
              id: 'add-strikeout',
              commandId: 'annotation:add-strikeout',
              variant: 'icon',
            },
            {
              type: 'command-button',
              id: 'add-underline',
              commandId: 'annotation:add-underline',
              variant: 'icon',
            },
            {
              type: 'command-button',
              id: 'add-ink',
              commandId: 'annotation:add-ink',
              variant: 'icon',
            },
            {
              type: 'command-button',
              id: 'add-text',
              commandId: 'annotation:add-text',
              variant: 'icon',
            },
            {
              type: 'command-button',
              id: 'add-stamp',
              commandId: 'annotation:add-stamp',
              variant: 'icon',
            },
            {
              type: 'divider',
              id: 'divider-6',
              orientation: 'vertical',
            },
            {
              type: 'command-button',
              id: 'undo-button',
              commandId: 'history:undo',
              variant: 'icon',
            },
            {
              type: 'command-button',
              id: 'redo-button',
              commandId: 'history:redo',
              variant: 'icon',
            },
            {
              type: 'command-button',
              id: 'overflow-annotation-tools',
              commandId: 'annotation:overflow-tools',
              variant: 'icon',
            },
          ],
        },
        { type: 'spacer', id: 'spacer-4', flex: true },
      ],
    },

    'shapes-toolbar': {
      id: 'shapes-toolbar',
      position: {
        placement: 'top',
        slot: 'secondary',
        order: 0,
      },
      permanent: false,
      items: [
        { type: 'spacer', id: 'spacer-5', flex: true },
        {
          type: 'group',
          id: 'shapes-tools',
          alignment: 'start',
          gap: 2,
          items: [
            {
              type: 'command-button',
              id: 'add-rectangle',
              commandId: 'annotation:add-rectangle',
              variant: 'icon',
            },
            {
              type: 'command-button',
              id: 'add-circle',
              commandId: 'annotation:add-circle',
              variant: 'icon',
            },
            {
              type: 'command-button',
              id: 'add-line',
              commandId: 'annotation:add-line',
              variant: 'icon',
            },
            {
              type: 'command-button',
              id: 'add-arrow',
              commandId: 'annotation:add-arrow',
              variant: 'icon',
            },
            {
              type: 'command-button',
              id: 'add-polygon',
              commandId: 'annotation:add-polygon',
              variant: 'icon',
            },
            {
              type: 'command-button',
              id: 'add-polyline',
              commandId: 'annotation:add-polyline',
              variant: 'icon',
            },
            {
              type: 'divider',
              id: 'divider-7',
              orientation: 'vertical',
            },
            {
              type: 'command-button',
              id: 'undo-button',
              commandId: 'history:undo',
              variant: 'icon',
            },
            {
              type: 'command-button',
              id: 'redo-button',
              commandId: 'history:redo',
              variant: 'icon',
            },
          ],
        },
        { type: 'spacer', id: 'spacer-6', flex: true },
      ],
    },

    // Redaction toolbar (shown when in redact mode)
    'redaction-toolbar': {
      id: 'redaction-toolbar',
      position: {
        placement: 'top',
        slot: 'secondary',
        order: 0,
      },
      permanent: false,
      items: [
        { type: 'spacer', id: 'spacer-7', flex: true },
        {
          type: 'group',
          id: 'redaction-tools',
          alignment: 'start',
          gap: 2,
          items: [
            {
              type: 'command-button',
              id: 'redact-text',
              commandId: 'redaction:redact-text',
              variant: 'icon',
            },
            {
              type: 'command-button',
              id: 'redact-area',
              commandId: 'redaction:redact-area',
              variant: 'icon',
            },
            {
              type: 'divider',
              id: 'divider-5',
              orientation: 'vertical',
            },
            {
              type: 'command-button',
              id: 'apply-redactions',
              commandId: 'redaction:apply-all',
              variant: 'icon',
            },
            {
              type: 'command-button',
              id: 'clear-redactions',
              commandId: 'redaction:clear-all',
              variant: 'icon',
            },
          ],
        },
        { type: 'spacer', id: 'spacer-8', flex: true },
      ],
    },
  },

  // ─────────────────────────────────────────────────────────
  // Menus
  // ─────────────────────────────────────────────────────────
  menus: {
    'mode-tabs-overflow-menu': {
      id: 'mode-tabs-overflow-menu',
      items: [
        {
          type: 'command',
          id: 'mode:annotate',
          commandId: 'mode:annotate',
        },
        {
          type: 'command',
          id: 'mode:shapes',
          commandId: 'mode:shapes',
        },
        {
          type: 'command',
          id: 'mode:redact',
          commandId: 'mode:redact',
        },
      ],
      responsive: {
        breakpoints: {
          xs: {
            maxWidth: 640,
            show: ['mode:annotate', 'mode:shapes', 'mode:redact'],
          },
          md: {
            minWidth: 640,
            hide: ['mode:annotate'],
          },
        },
      },
    },
    'zoom-levels-menu': {
      id: 'zoom-levels-menu',
      items: [
        {
          type: 'command',
          id: 'zoom:25',
          commandId: 'zoom:25',
        },
        {
          type: 'command',
          id: 'zoom:50',
          commandId: 'zoom:50',
        },
        {
          type: 'command',
          id: 'zoom:100',
          commandId: 'zoom:100',
        },
        {
          type: 'command',
          id: 'zoom:125',
          commandId: 'zoom:125',
        },
        {
          type: 'command',
          id: 'zoom:150',
          commandId: 'zoom:150',
        },
        {
          type: 'command',
          id: 'zoom:200',
          commandId: 'zoom:200',
        },
        {
          type: 'command',
          id: 'zoom:400',
          commandId: 'zoom:400',
        },
        {
          type: 'command',
          id: 'zoom:800',
          commandId: 'zoom:800',
        },
        {
          type: 'command',
          id: 'zoom:1600',
          commandId: 'zoom:1600',
        },
      ],
    },
    'zoom-menu': {
      id: 'zoom-menu',
      items: [
        {
          type: 'submenu',
          id: 'zoom-levels-submenu',
          labelKey: 'zoom.level',
          label: 'Zoom Levels',
          menuId: 'zoom-levels-menu',
        },
        {
          type: 'divider',
          id: 'divider-zoom-in-out',
        },
        {
          type: 'command',
          id: 'zoom:in',
          commandId: 'zoom:in',
        },
        {
          type: 'command',
          id: 'zoom:out',
          commandId: 'zoom:out',
        },
        {
          type: 'divider',
          id: 'divider-8',
        },
        {
          type: 'command',
          id: 'zoom:fit-page',
          commandId: 'zoom:fit-page',
        },
        {
          type: 'command',
          id: 'zoom:fit-width',
          commandId: 'zoom:fit-width',
        },
        {
          type: 'divider',
          id: 'divider-9',
        },
        {
          type: 'command',
          id: 'zoom:marquee',
          commandId: 'zoom:marquee',
        },
      ],
      responsive: {
        breakpoints: {
          xs: {
            maxWidth: 640,
            show: ['zoom-levels-submenu', 'divider-zoom-in-out'],
          },
          md: {
            minWidth: 768,
            hide: ['zoom-levels-submenu', 'divider-zoom-in-out'],
          },
        },
      },
    },
    'document-menu': {
      id: 'document-menu',
      items: [
        {
          type: 'command',
          id: 'document:open',
          commandId: 'document:open',
        },
        {
          type: 'command',
          id: 'document:close',
          commandId: 'document:close',
        },
        {
          type: 'divider',
          id: 'divider-10',
        },
        {
          type: 'command',
          id: 'document:print',
          commandId: 'document:print',
        },
        {
          type: 'command',
          id: 'document:export',
          commandId: 'document:export',
        },
        {
          type: 'divider',
          id: 'divider-11',
        },
        {
          type: 'command',
          id: 'document:properties',
          commandId: 'document:properties',
        },
      ],
    },
    'annotation-tools-menu': {
      id: 'annotation-tools-menu',
      items: [
        {
          type: 'command',
          id: 'annotation:add-text',
          commandId: 'annotation:add-text',
        },
        {
          type: 'command',
          id: 'annotation:add-highlight',
          commandId: 'annotation:add-highlight',
        },
        {
          type: 'command',
          id: 'annotation:add-strikeout',
          commandId: 'annotation:add-strikeout',
        },
        {
          type: 'command',
          id: 'annotation:add-underline',
          commandId: 'annotation:add-underline',
        },
        {
          type: 'divider',
          id: 'divider-12',
        },
        {
          type: 'command',
          id: 'annotation:add-rectangle',
          commandId: 'annotation:add-rectangle',
        },
        {
          type: 'command',
          id: 'annotation:add-circle',
          commandId: 'annotation:add-circle',
        },
        {
          type: 'command',
          id: 'annotation:add-line',
          commandId: 'annotation:add-line',
        },
        {
          type: 'command',
          id: 'annotation:add-arrow',
          commandId: 'annotation:add-arrow',
        },
        {
          type: 'command',
          id: 'annotation:add-polygon',
          commandId: 'annotation:add-polygon',
        },
        {
          type: 'command',
          id: 'annotation:add-polyline',
          commandId: 'annotation:add-polyline',
        },
        {
          type: 'command',
          id: 'annotation:add-ink',
          commandId: 'annotation:add-ink',
        },
        {
          type: 'command',
          id: 'annotation:add-stamp',
          commandId: 'annotation:add-stamp',
        },
      ],
    },
    'page-settings-menu': {
      id: 'page-settings-menu',
      items: [
        {
          type: 'section',
          id: 'spread-mode-section',
          labelKey: 'page.spreadMode',
          label: 'Spread Mode',
          items: [
            {
              type: 'command',
              id: 'spread:none',
              commandId: 'spread:none',
            },
            {
              type: 'command',
              id: 'spread:odd',
              commandId: 'spread:odd',
            },
            {
              type: 'command',
              id: 'spread:even',
              commandId: 'spread:even',
            },
          ],
        },
        { type: 'divider', id: 'divider-13' },
        {
          type: 'section',
          id: 'scroll-layout-section',
          labelKey: 'page.scrollLayout',
          label: 'Scroll Layout',
          items: [
            {
              type: 'command',
              id: 'scroll:vertical',
              commandId: 'scroll:vertical',
            },
            {
              type: 'command',
              id: 'scroll:horizontal',
              commandId: 'scroll:horizontal',
            },
          ],
        },
        {
          type: 'divider',
          id: 'divider-14',
        },
        {
          type: 'section',
          id: 'page-rotation-section',
          labelKey: 'page.rotation',
          label: 'Page Rotation',
          items: [
            {
              type: 'command',
              id: 'rotate:clockwise',
              commandId: 'rotate:clockwise',
            },
            {
              type: 'command',
              id: 'rotate:counter-clockwise',
              commandId: 'rotate:counter-clockwise',
            },
          ],
        },
      ],
    },
  },

  modals: {},

  // ─────────────────────────────────────────────────────────
  // Panels (Sidebars)
  // ─────────────────────────────────────────────────────────
  sidebars: {
    'sidebar-panel': {
      id: 'sidebar-panel',
      position: {
        placement: 'left',
        slot: 'main',
        order: 0,
      },
      content: {
        type: 'tabs',
        tabs: [
          {
            id: 'thumbnails',
            labelKey: 'panel.thumbnails',
            label: 'Thumbnails',
            componentId: 'thumbnails-sidebar',
          },
          {
            id: 'outline',
            labelKey: 'panel.outline',
            label: 'Outline',
            componentId: 'outline-sidebar',
          },
        ],
      },
      width: '250px',
      collapsible: true,
      defaultOpen: false,
    },

    'search-panel': {
      id: 'search-panel',
      position: {
        placement: 'right',
        slot: 'main',
        order: 0,
      },
      content: {
        type: 'component',
        componentId: 'search-sidebar',
      },
      width: '250px',
      collapsible: true,
      defaultOpen: false,
    },

    'comment-panel': {
      id: 'comment-panel',
      position: {
        placement: 'right',
        slot: 'main',
        order: 0,
      },
      content: {
        type: 'component',
        componentId: 'comment-sidebar',
      },
      width: '250px',
      collapsible: true,
      defaultOpen: false,
    },
  },

  // ─────────────────────────────────────────────────────────
  // Selection Menus
  // ─────────────────────────────────────────────────────────
  selectionMenus: {
    annotation: {
      id: 'annotation',
      items: [
        {
          type: 'command-button',
          id: 'delete-annotation',
          commandId: 'annotation:delete-selected',
          variant: 'icon',
        },
      ],
    },
    redaction: {
      id: 'redaction',
      items: [
        {
          type: 'command-button',
          id: 'delete-redaction',
          commandId: 'redaction:delete-selected',
          variant: 'icon',
        },
        {
          type: 'command-button',
          id: 'commit-redaction',
          commandId: 'redaction:commit-selected',
          variant: 'icon',
        },
      ],
    },
    selection: {
      id: 'selection',
      items: [
        {
          type: 'command-button',
          id: 'copy-selection',
          commandId: 'selection:copy',
          variant: 'icon',
        },
      ],
    },
  },
};
