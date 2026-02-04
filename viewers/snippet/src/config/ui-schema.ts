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
              id: 'chinese-languages',
              locales: ['zh-CN'],
              breakpoints: {
                sm: {
                  replaceHide: ['zoom-toolbar', 'mode-select-button', 'overflow-tabs-button'],
                  replaceShow: [
                    'view-mode',
                    'annotate-mode',
                    'shapes-mode',
                    'redact-mode',

                    'pan-button',
                    'pointer-button',
                    'divider-3',
                  ],
                },
                md: {
                  replaceShow: [
                    'view-mode',
                    'annotate-mode',
                    'shapes-mode',
                    'redact-mode',
                    'zoom-toolbar',
                    'pan-button',
                    'pointer-button',
                    'divider-3',
                  ],
                  replaceHide: ['zoom-menu-button', 'mode-select-button', 'overflow-tabs-button'],
                },
              },
            },
            {
              id: 'germanic-languages',
              locales: ['de', 'nl'],
              breakpoints: {
                md: {
                  replaceShow: [
                    'view-mode',
                    'annotate-mode',
                    'zoom-toolbar',
                    'pan-button',
                    'pointer-button',
                    'divider-3',
                    'overflow-tabs-button',
                  ],
                },
              },
            },
          ],
        },
        breakpoints: {
          xxxs: {
            maxWidth: 400,
            hide: [
              'annotate-mode',
              'view-mode',
              'shapes-mode',
              'redact-mode',
              'zoom-toolbar',
              'pan-button',
              'pointer-button',
              'divider-3',
              'page-settings-button',
              'zoom-menu-button',
              'divider-2',
              'overflow-tabs-button',
            ],
            show: ['mode-select-button'],
          },
          xxs: {
            minWidth: 400,
            show: ['page-settings-button', 'zoom-menu-button', 'divider-2'],
            hide: ['overflow-left-action-menu-button'],
          },
          xs: {
            minWidth: 500,
            maxWidth: 640,
            show: ['pan-button', 'pointer-button', 'divider-3'],
          },
          sm: {
            minWidth: 640,
            maxWidth: 768,
            hide: ['shapes-mode', 'redact-mode', 'zoom-toolbar', 'mode-select-button'],
            show: [
              'view-mode',
              'annotate-mode',
              'overflow-tabs-button',
              'pan-button',
              'pointer-button',
              'divider-3',
            ],
          },
          md: {
            minWidth: 768,
            show: [
              'view-mode',
              'annotate-mode',
              'shapes-mode',
              'zoom-toolbar',
              'pan-button',
              'pointer-button',
              'divider-3',
              'overflow-tabs-button',
            ],
            hide: ['zoom-menu-button', 'mode-select-button'],
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
          gap: 2,
          items: [
            {
              type: 'command-button',
              id: 'document-menu-button',
              commandId: 'document:menu',
              variant: 'icon',
              categories: ['document', 'document-menu'],
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
              categories: ['panel', 'panel-sidebar'],
            },
            {
              type: 'command-button',
              id: 'overflow-left-action-menu-button',
              commandId: 'left-action-menu:overflow-menu',
              variant: 'icon',
              categories: ['ui', 'ui-menu'],
            },
            {
              type: 'command-button',
              id: 'page-settings-button',
              commandId: 'page:settings',
              variant: 'icon',
              categories: ['page', 'page-settings'],
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
              categories: ['zoom', 'zoom-menu'],
            },
            {
              type: 'custom',
              id: 'zoom-toolbar',
              componentId: 'zoom-toolbar',
              categories: ['zoom'],
            },
            {
              type: 'divider',
              id: 'divider-3',
              orientation: 'vertical',
              visibilityDependsOn: {
                itemIds: ['zoom-toolbar', 'zoom-menu-button'],
              },
            },
            {
              type: 'command-button',
              id: 'pan-button',
              commandId: 'pan:toggle',
              variant: 'icon',
              categories: ['tools', 'pan'],
            },
            {
              type: 'command-button',
              id: 'pointer-button',
              commandId: 'pointer:toggle',
              variant: 'icon',
              categories: ['tools', 'pointer'],
            },
          ],
        },

        // ───────── Spacer: Flexible space ─────────
        {
          type: 'spacer',
          id: 'spacer-1',
          flex: true,
        },

        {
          type: 'custom',
          id: 'mode-select-button',
          componentId: 'mode-select-button',
          categories: ['mode'],
          visibilityDependsOn: {
            menuId: 'mode-tabs-overflow-menu',
          },
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
              categories: ['mode', 'mode-view'],
              visibilityDependsOn: {
                itemIds: ['annotate-mode', 'shapes-mode', 'redact-mode'],
              },
            },
            {
              id: 'annotate-mode',
              commandId: 'mode:annotate',
              variant: 'text',
              categories: ['mode', 'mode-annotate', 'annotation'],
            },
            {
              id: 'shapes-mode',
              commandId: 'mode:shapes',
              variant: 'text',
              categories: ['mode', 'mode-shapes', 'annotation'],
            },
            {
              id: 'redact-mode',
              commandId: 'mode:redact',
              variant: 'text',
              categories: ['mode', 'mode-redact', 'redaction'],
            },
            {
              id: 'overflow-tabs-button',
              commandId: 'tabs:overflow-menu',
              variant: 'icon',
              categories: ['ui', 'ui-menu'],
              visibilityDependsOn: {
                menuId: 'mode-tabs-overflow-menu',
              },
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
              categories: ['panel', 'panel-search'],
            },
            {
              type: 'command-button',
              id: 'comment-button',
              commandId: 'panel:toggle-comment',
              variant: 'icon',
              categories: ['panel', 'panel-comment'],
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
            hide: ['add-text', 'add-stamp', 'add-ink'],
            show: ['overflow-annotation-tools'],
          },
          md: {
            minWidth: 640,
            hide: ['overflow-annotation-tools'],
            show: ['add-text', 'add-stamp', 'add-ink'],
          },
        },
      },
      permanent: false,
      categories: ['annotation'],
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
              categories: ['annotation', 'annotation-markup', 'annotation-highlight'],
            },
            {
              type: 'command-button',
              id: 'add-strikeout',
              commandId: 'annotation:add-strikeout',
              variant: 'icon',
              categories: ['annotation', 'annotation-markup', 'annotation-strikeout'],
            },
            {
              type: 'command-button',
              id: 'add-underline',
              commandId: 'annotation:add-underline',
              variant: 'icon',
              categories: ['annotation', 'annotation-markup', 'annotation-underline'],
            },
            {
              type: 'command-button',
              id: 'add-squiggly',
              commandId: 'annotation:add-squiggly',
              variant: 'icon',
              categories: ['annotation', 'annotation-markup', 'annotation-squiggly'],
            },
            {
              type: 'command-button',
              id: 'add-ink',
              commandId: 'annotation:add-ink',
              variant: 'icon',
              categories: ['annotation', 'annotation-ink'],
            },
            {
              type: 'command-button',
              id: 'add-text',
              commandId: 'annotation:add-text',
              variant: 'icon',
              categories: ['annotation', 'annotation-text'],
            },
            {
              type: 'command-button',
              id: 'add-stamp',
              commandId: 'annotation:add-stamp',
              variant: 'icon',
              categories: ['annotation', 'annotation-stamp'],
            },
            {
              type: 'command-button',
              id: 'overflow-annotation-tools',
              commandId: 'annotation:overflow-tools',
              variant: 'icon',
              categories: ['annotation', 'annotation-overflow'],
            },
            {
              type: 'divider',
              id: 'annotation-tools-divider-1',
              orientation: 'vertical',
            },
            {
              type: 'command-button',
              id: 'toggle-annotation-style',
              commandId: 'panel:toggle-annotation-style',
              variant: 'icon',
              categories: ['panel', 'panel-annotation-style'],
            },
            {
              type: 'divider',
              id: 'annotation-tools-divider-2',
              orientation: 'vertical',
              visibilityDependsOn: {
                itemIds: ['toggle-annotation-style'],
              },
            },
            {
              type: 'command-button',
              id: 'undo-button',
              commandId: 'history:undo',
              variant: 'icon',
              categories: ['history', 'history-undo'],
            },
            {
              type: 'command-button',
              id: 'redo-button',
              commandId: 'history:redo',
              variant: 'icon',
              categories: ['history', 'history-redo'],
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
      responsive: {
        breakpoints: {
          sm: {
            maxWidth: 640,
            hide: ['add-polygon', 'add-polyline'],
            show: ['overflow-shapes-tools'],
          },
          md: {
            minWidth: 640,
            hide: ['overflow-shapes-tools'],
            show: ['add-polygon', 'add-polyline'],
          },
        },
      },
      permanent: false,
      categories: ['annotation', 'annotation-shape'],
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
              categories: ['annotation', 'annotation-shape', 'annotation-rectangle'],
            },
            {
              type: 'command-button',
              id: 'add-circle',
              commandId: 'annotation:add-circle',
              variant: 'icon',
              categories: ['annotation', 'annotation-shape', 'annotation-circle'],
            },
            {
              type: 'command-button',
              id: 'add-line',
              commandId: 'annotation:add-line',
              variant: 'icon',
              categories: ['annotation', 'annotation-shape', 'annotation-line'],
            },
            {
              type: 'command-button',
              id: 'add-arrow',
              commandId: 'annotation:add-arrow',
              variant: 'icon',
              categories: ['annotation', 'annotation-shape', 'annotation-arrow'],
            },
            {
              type: 'command-button',
              id: 'add-polygon',
              commandId: 'annotation:add-polygon',
              variant: 'icon',
              categories: ['annotation', 'annotation-shape', 'annotation-polygon'],
            },
            {
              type: 'command-button',
              id: 'add-polyline',
              commandId: 'annotation:add-polyline',
              variant: 'icon',
              categories: ['annotation', 'annotation-shape', 'annotation-polyline'],
            },
            {
              type: 'command-button',
              id: 'overflow-shapes-tools',
              commandId: 'annotation:overflow-shapes',
              variant: 'icon',
              categories: ['annotation', 'annotation-shape', 'annotation-overflow'],
            },
            {
              type: 'divider',
              id: 'shapes-tools-divider-1',
              orientation: 'vertical',
            },
            {
              type: 'command-button',
              id: 'toggle-annotation-style',
              commandId: 'panel:toggle-annotation-style',
              variant: 'icon',
              categories: ['panel', 'panel-annotation-style'],
            },
            {
              type: 'divider',
              id: 'shapes-tools-divider-2',
              orientation: 'vertical',
              visibilityDependsOn: {
                itemIds: ['toggle-annotation-style'],
              },
            },
            {
              type: 'command-button',
              id: 'undo-button',
              commandId: 'history:undo',
              variant: 'icon',
              categories: ['history', 'history-undo'],
            },
            {
              type: 'command-button',
              id: 'redo-button',
              commandId: 'history:redo',
              variant: 'icon',
              categories: ['history', 'history-redo'],
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
      categories: ['redaction'],
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
              id: 'redact',
              commandId: 'redaction:redact',
              variant: 'icon',
              categories: ['redaction', 'redaction-combined'],
            },
            {
              type: 'divider',
              id: 'redaction-tools-divider-1',
              orientation: 'vertical',
            },
            {
              type: 'command-button',
              id: 'toggle-redaction-panel',
              commandId: 'panel:toggle-redaction',
              variant: 'icon',
              categories: ['panel', 'panel-redaction'],
            },
            {
              type: 'command-button',
              id: 'toggle-annotation-style',
              commandId: 'panel:toggle-annotation-style',
              variant: 'icon',
              categories: ['panel', 'panel-annotation-style'],
            },
            {
              type: 'divider',
              id: 'redaction-tools-divider-2',
              orientation: 'vertical',
              visibilityDependsOn: {
                itemIds: ['toggle-annotation-style'],
              },
            },
            {
              type: 'command-button',
              id: 'undo-button',
              commandId: 'history:undo',
              variant: 'icon',
              categories: ['history', 'history-undo'],
            },
            {
              type: 'command-button',
              id: 'redo-button',
              commandId: 'history:redo',
              variant: 'icon',
              categories: ['history', 'history-redo'],
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
    'left-action-menu': {
      id: 'left-action-menu',
      categories: ['ui'],
      items: [
        {
          type: 'submenu',
          id: 'page-settings-submenu',
          labelKey: 'menu.viewControls',
          label: 'View Controls',
          icon: 'viewSettings',
          menuId: 'page-settings-menu',
          categories: ['page'],
        },
        {
          type: 'submenu',
          id: 'zoom-submenu',
          labelKey: 'menu.zoomControls',
          label: 'Zoom Controls',
          icon: 'zoomIn',
          menuId: 'zoom-menu',
          categories: ['zoom'],
        },
        {
          type: 'divider',
          id: 'divider-15',
        },
        {
          type: 'command',
          id: 'pan-button-menu',
          commandId: 'pan:toggle',
          categories: ['tools', 'pan'],
        },
        {
          type: 'command',
          id: 'pointer-button-menu',
          commandId: 'pointer:toggle',
          categories: ['tools', 'pointer'],
        },
      ],
    },
    'mode-tabs-overflow-menu': {
      id: 'mode-tabs-overflow-menu',
      items: [
        {
          type: 'command',
          id: 'mode:view',
          commandId: 'mode:view',
          categories: ['mode', 'mode-view'],
        },
        {
          type: 'command',
          id: 'mode:annotate',
          commandId: 'mode:annotate',
          categories: ['mode', 'mode-annotate', 'annotation'],
        },
        {
          type: 'command',
          id: 'mode:shapes',
          commandId: 'mode:shapes',
          categories: ['mode', 'mode-shapes', 'annotation'],
        },
        {
          type: 'command',
          id: 'mode:redact',
          commandId: 'mode:redact',
          categories: ['mode', 'mode-redact', 'redaction'],
        },
      ],
      responsive: {
        breakpoints: {
          xs: {
            maxWidth: 640,
            show: ['mode:view', 'mode:annotate', 'mode:shapes', 'mode:redact'],
          },
          sm: {
            minWidth: 640,
            maxWidth: 768,
            hide: ['mode:view', 'mode:annotate'],
          },
          md: {
            minWidth: 768,
            hide: ['mode:view', 'mode:annotate', 'mode:shapes'],
          },
        },
        localeOverrides: {
          groups: [
            {
              id: 'germanic-languages',
              locales: ['de', 'nl'],
              breakpoints: {
                md: {
                  // Germanic languages hide shapes from toolbar at md, so show it in overflow
                  replaceHide: ['mode:view', 'mode:annotate'],
                },
              },
            },
          ],
        },
      },
    },
    'zoom-levels-menu': {
      id: 'zoom-levels-menu',
      categories: ['zoom', 'zoom-level'],
      items: [
        {
          type: 'command',
          id: 'zoom-levels-menu:25',
          commandId: 'zoom:25',
          categories: ['zoom', 'zoom-level', 'zoom-level-25'],
        },
        {
          type: 'command',
          id: 'zoom-levels-menu:50',
          commandId: 'zoom:50',
          categories: ['zoom', 'zoom-level', 'zoom-level-50'],
        },
        {
          type: 'command',
          id: 'zoom-levels-menu:100',
          commandId: 'zoom:100',
          categories: ['zoom', 'zoom-level', 'zoom-level-100'],
        },
        {
          type: 'command',
          id: 'zoom-levels-menu:125',
          commandId: 'zoom:125',
          categories: ['zoom', 'zoom-level', 'zoom-level-125'],
        },
        {
          type: 'command',
          id: 'zoom-levels-menu:150',
          commandId: 'zoom:150',
          categories: ['zoom', 'zoom-level', 'zoom-level-150'],
        },
        {
          type: 'command',
          id: 'zoom-levels-menu:200',
          commandId: 'zoom:200',
          categories: ['zoom', 'zoom-level', 'zoom-level-200'],
        },
        {
          type: 'command',
          id: 'zoom-levels-menu:400',
          commandId: 'zoom:400',
          categories: ['zoom', 'zoom-level', 'zoom-level-400'],
        },
        {
          type: 'command',
          id: 'zoom-levels-menu:800',
          commandId: 'zoom:800',
          categories: ['zoom', 'zoom-level', 'zoom-level-800'],
        },
        {
          type: 'command',
          id: 'zoom-levels-menu:1600',
          commandId: 'zoom:1600',
          categories: ['zoom', 'zoom-level', 'zoom-level-1600'],
        },
      ],
    },
    'zoom-menu': {
      id: 'zoom-menu',
      categories: ['zoom'],
      items: [
        {
          type: 'command',
          id: 'zoom-menu:25',
          commandId: 'zoom:25',
          categories: ['zoom', 'zoom-level', 'zoom-level-25'],
        },
        {
          type: 'command',
          id: 'zoom-menu:50',
          commandId: 'zoom:50',
          categories: ['zoom', 'zoom-level', 'zoom-level-50'],
        },
        {
          type: 'command',
          id: 'zoom-menu:100',
          commandId: 'zoom:100',
          categories: ['zoom', 'zoom-level', 'zoom-level-100'],
        },
        {
          type: 'command',
          id: 'zoom-menu:125',
          commandId: 'zoom:125',
          categories: ['zoom', 'zoom-level', 'zoom-level-125'],
        },
        {
          type: 'command',
          id: 'zoom-menu:150',
          commandId: 'zoom:150',
          categories: ['zoom', 'zoom-level', 'zoom-level-150'],
        },
        {
          type: 'command',
          id: 'zoom-menu:200',
          commandId: 'zoom:200',
          categories: ['zoom', 'zoom-level', 'zoom-level-200'],
        },
        {
          type: 'command',
          id: 'zoom-menu:400',
          commandId: 'zoom:400',
          categories: ['zoom', 'zoom-level', 'zoom-level-400'],
        },
        {
          type: 'command',
          id: 'zoom-menu:800',
          commandId: 'zoom:800',
          categories: ['zoom', 'zoom-level', 'zoom-level-800'],
        },
        {
          type: 'command',
          id: 'zoom-menu:1600',
          commandId: 'zoom:1600',
          categories: ['zoom', 'zoom-level', 'zoom-level-1600'],
        },
        {
          type: 'submenu',
          id: 'zoom-levels-submenu',
          labelKey: 'zoom.level',
          label: 'Zoom Levels',
          menuId: 'zoom-levels-menu',
          categories: ['zoom', 'zoom-level'],
        },
        {
          type: 'divider',
          id: 'divider-zoom-in-out',
        },
        {
          type: 'command',
          id: 'zoom-menu:in',
          commandId: 'zoom:in',
          categories: ['zoom', 'zoom-in'],
        },
        {
          type: 'command',
          id: 'zoom-menu:out',
          commandId: 'zoom:out',
          categories: ['zoom', 'zoom-out'],
        },
        {
          type: 'divider',
          id: 'divider-8',
        },
        {
          type: 'command',
          id: 'zoom:fit-page',
          commandId: 'zoom:fit-page',
          categories: ['zoom', 'zoom-fit-page'],
        },
        {
          type: 'command',
          id: 'zoom:fit-width',
          commandId: 'zoom:fit-width',
          categories: ['zoom', 'zoom-fit-width'],
        },
        {
          type: 'divider',
          id: 'divider-9',
        },
        {
          type: 'command',
          id: 'zoom:marquee',
          commandId: 'zoom:marquee',
          categories: ['zoom', 'zoom-marquee'],
        },
      ],
      responsive: {
        breakpoints: {
          xs: {
            maxWidth: 640,
            show: ['zoom-levels-submenu', 'divider-zoom-in-out'],
            hide: [
              'zoom-menu:25',
              'zoom-menu:50',
              'zoom-menu:100',
              'zoom-menu:125',
              'zoom-menu:150',
              'zoom-menu:200',
              'zoom-menu:400',
              'zoom-menu:800',
              'zoom-menu:1600',
            ],
          },
          md: {
            minWidth: 768,
            show: [
              'zoom-menu:25',
              'zoom-menu:50',
              'zoom-menu:100',
              'zoom-menu:125',
              'zoom-menu:150',
              'zoom-menu:200',
              'zoom-menu:400',
              'zoom-menu:800',
              'zoom-menu:1600',
            ],
            hide: ['zoom-levels-submenu', 'divider-zoom-in-out', 'zoom-menu:in', 'zoom-menu:out'],
          },
        },
      },
    },
    'document-menu': {
      id: 'document-menu',
      categories: ['document'],
      items: [
        {
          type: 'command',
          id: 'document:open',
          commandId: 'document:open',
          categories: ['document', 'document-open'],
        },
        {
          type: 'command',
          id: 'document:close',
          commandId: 'document:close',
          categories: ['document', 'document-close'],
        },
        {
          type: 'divider',
          id: 'divider-10',
        },
        {
          type: 'command',
          id: 'document:print',
          commandId: 'document:print',
          categories: ['document', 'document-print'],
        },
        {
          type: 'command',
          id: 'document:protect',
          commandId: 'document:protect',
          categories: ['document', 'document-protect'],
        },
        {
          type: 'command',
          id: 'document:capture',
          commandId: 'document:capture',
          categories: ['document', 'document-capture'],
        },
        {
          type: 'command',
          id: 'document:export',
          commandId: 'document:export',
          categories: ['document', 'document-export'],
        },
        {
          type: 'divider',
          id: 'divider-11',
          visibilityDependsOn: {
            itemIds: ['document:export', 'document:print', 'document:capture', 'document:protect'],
          },
        },
        {
          type: 'command',
          id: 'document:fullscreen',
          commandId: 'document:fullscreen',
          categories: ['document', 'document-fullscreen'],
        },
      ],
    },
    'annotation-tools-menu': {
      id: 'annotation-tools-menu',
      categories: ['annotation'],
      items: [
        {
          type: 'command',
          id: 'annotation:add-ink',
          commandId: 'annotation:add-ink',
          categories: ['annotation', 'annotation-ink'],
        },
        {
          type: 'command',
          id: 'annotation:add-text',
          commandId: 'annotation:add-text',
          categories: ['annotation', 'annotation-text'],
        },
        {
          type: 'command',
          id: 'annotation:add-stamp',
          commandId: 'annotation:add-stamp',
          categories: ['annotation', 'annotation-stamp'],
        },
      ],
    },
    'shapes-tools-menu': {
      id: 'shapes-tools-menu',
      categories: ['annotation', 'annotation-shape'],
      items: [
        {
          type: 'command',
          id: 'annotation:add-polygon',
          commandId: 'annotation:add-polygon',
          categories: ['annotation', 'annotation-shape', 'annotation-polygon'],
        },
        {
          type: 'command',
          id: 'annotation:add-polyline',
          commandId: 'annotation:add-polyline',
          categories: ['annotation', 'annotation-shape', 'annotation-polyline'],
        },
      ],
    },
    'page-settings-menu': {
      id: 'page-settings-menu',
      categories: ['page'],
      items: [
        {
          type: 'section',
          id: 'spread-mode-section',
          labelKey: 'page.spreadMode',
          label: 'Spread Mode',
          categories: ['page', 'spread'],
          items: [
            {
              type: 'command',
              id: 'spread:none',
              commandId: 'spread:none',
              categories: ['page', 'spread', 'spread-none'],
            },
            {
              type: 'command',
              id: 'spread:odd',
              commandId: 'spread:odd',
              categories: ['page', 'spread', 'spread-odd'],
            },
            {
              type: 'command',
              id: 'spread:even',
              commandId: 'spread:even',
              categories: ['page', 'spread', 'spread-even'],
            },
          ],
        },
        { type: 'divider', id: 'divider-13' },
        {
          type: 'section',
          id: 'scroll-layout-section',
          labelKey: 'page.scrollLayout',
          label: 'Scroll Layout',
          categories: ['page', 'scroll'],
          items: [
            {
              type: 'command',
              id: 'scroll:vertical',
              commandId: 'scroll:vertical',
              categories: ['page', 'scroll', 'scroll-vertical'],
            },
            {
              type: 'command',
              id: 'scroll:horizontal',
              commandId: 'scroll:horizontal',
              categories: ['page', 'scroll', 'scroll-horizontal'],
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
          categories: ['page', 'rotate'],
          items: [
            {
              type: 'command',
              id: 'rotate:clockwise',
              commandId: 'rotate:clockwise',
              categories: ['page', 'rotate', 'rotate-clockwise'],
            },
            {
              type: 'command',
              id: 'rotate:counter-clockwise',
              commandId: 'rotate:counter-clockwise',
              categories: ['page', 'rotate', 'rotate-counter-clockwise'],
            },
          ],
        },
        {
          type: 'divider',
          id: 'divider-15',
        },
        {
          type: 'command',
          id: 'document:fullscreen',
          commandId: 'document:fullscreen',
          categories: ['document', 'document-fullscreen'],
        },
      ],
    },
  },

  // ─────────────────────────────────────────────────────────
  // Sidebars
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
            icon: 'squares',
            componentId: 'thumbnails-sidebar',
          },
          {
            id: 'outline',
            labelKey: 'panel.outline',
            label: 'Outline',
            icon: 'listTree',
            componentId: 'outline-sidebar',
          },
        ],
      },
      width: '250px',
      collapsible: true,
      defaultOpen: false,
    },

    'annotation-panel': {
      id: 'annotation-panel',
      position: {
        placement: 'left',
        slot: 'main',
        order: 0,
      },
      content: {
        type: 'component',
        componentId: 'annotation-sidebar',
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

    'redaction-panel': {
      id: 'redaction-panel',
      position: {
        placement: 'right',
        slot: 'main',
        order: 0,
      },
      content: {
        type: 'component',
        componentId: 'redaction-sidebar',
      },
      width: '250px',
      collapsible: true,
      defaultOpen: false,
      categories: ['redaction'],
    },
  },

  // ─────────────────────────────────────────────────────────
  // Modals
  // ─────────────────────────────────────────────────────────
  modals: {
    'print-modal': {
      id: 'print-modal',
      content: {
        type: 'component',
        componentId: 'print-modal',
      },
      maxWidth: '28rem',
      closeOnClickOutside: true,
      closeOnEscape: true,
    },
    'protect-modal': {
      id: 'protect-modal',
      content: {
        type: 'component',
        componentId: 'protect-modal',
      },
      maxWidth: '28rem',
      closeOnClickOutside: true,
      closeOnEscape: true,
    },
    'view-permissions-modal': {
      id: 'view-permissions-modal',
      content: {
        type: 'component',
        componentId: 'view-permissions-modal',
      },
      maxWidth: '28rem',
      closeOnClickOutside: true,
      closeOnEscape: true,
    },
    'link-modal': {
      id: 'link-modal',
      content: {
        type: 'component',
        componentId: 'link-modal',
      },
      maxWidth: '28rem',
      closeOnClickOutside: true,
      closeOnEscape: true,
    },
  },

  // ─────────────────────────────────────────────────────────
  // Overlays
  // ─────────────────────────────────────────────────────────
  overlays: {
    'page-controls': {
      id: 'page-controls',
      position: {
        anchor: 'bottom-center',
        offset: {
          bottom: '1.5rem',
        },
      },
      content: {
        type: 'component',
        componentId: 'page-controls',
      },
      defaultEnabled: true,
    },
    'unlock-owner-overlay': {
      id: 'unlock-owner-overlay',
      position: {
        anchor: 'bottom-right',
        offset: {
          bottom: '1.5rem',
          right: '1.5rem',
        },
      },
      content: {
        type: 'component',
        componentId: 'unlock-owner-overlay',
      },
      defaultEnabled: true,
    },
  },

  // ─────────────────────────────────────────────────────────
  // Selection Menus
  // ─────────────────────────────────────────────────────────
  selectionMenus: {
    annotation: {
      id: 'annotation',
      categories: ['annotation'],
      items: [
        {
          type: 'command-button',
          id: 'comment-button',
          commandId: 'annotation:toggle-comment',
          variant: 'icon',
          categories: ['annotation', 'annotation-comment'],
        },
        {
          type: 'command-button',
          id: 'toggle-link',
          commandId: 'annotation:toggle-link',
          variant: 'icon',
          categories: ['annotation', 'annotation-link'],
        },
        {
          type: 'command-button',
          id: 'toggle-annotation-style',
          commandId: 'annotation:toggle-annotation-style',
          variant: 'icon',
          categories: ['annotation', 'annotation-style'],
        },
        {
          type: 'command-button',
          id: 'apply-redaction',
          commandId: 'annotation:apply-redaction',
          variant: 'icon',
          categories: ['annotation', 'annotation-redaction'],
        },
        {
          type: 'command-button',
          id: 'delete-annotation',
          commandId: 'annotation:delete-selected',
          variant: 'icon',
          categories: ['annotation', 'annotation-delete'],
        },
        {
          type: 'command-button',
          id: 'goto-link',
          commandId: 'annotation:goto-link',
          variant: 'icon-text',
          categories: ['annotation', 'annotation-link'],
        },
      ],
    },
    groupAnnotation: {
      id: 'groupAnnotation',
      categories: ['annotation', 'annotation-group'],
      items: [
        {
          type: 'command-button',
          id: 'toggle-group-annotations',
          commandId: 'annotation:toggle-group',
          variant: 'icon',
          categories: ['annotation', 'annotation-group'],
        },
        {
          type: 'command-button',
          id: 'toggle-annotation-style',
          commandId: 'panel:toggle-annotation-style',
          variant: 'icon',
          categories: ['panel', 'panel-annotation-style'],
        },
        {
          type: 'command-button',
          id: 'delete-all-annotations',
          commandId: 'annotation:delete-all-selected',
          variant: 'icon',
          categories: ['annotation', 'annotation-delete', 'annotation-group'],
        },
      ],
    },
    redaction: {
      id: 'redaction',
      categories: ['redaction'],
      items: [
        {
          type: 'command-button',
          id: 'delete-redaction',
          commandId: 'redaction:delete-selected',
          variant: 'icon',
          categories: ['redaction', 'redaction-delete'],
        },
        {
          type: 'command-button',
          id: 'commit-redaction',
          commandId: 'redaction:commit-selected',
          variant: 'icon',
          categories: ['redaction', 'redaction-commit'],
        },
      ],
    },
    selection: {
      id: 'selection',
      visibilityDependsOn: {
        itemIds: [
          'copy-selection',
          'add-highlight',
          'add-strikeout',
          'add-underline',
          'add-squiggly',
          'add-link',
          'redact-text',
        ],
      },
      items: [
        {
          type: 'command-button',
          id: 'copy-selection',
          commandId: 'selection:copy',
          variant: 'icon',
          categories: ['selection', 'selection-copy'],
        },
        {
          type: 'command-button',
          id: 'add-highlight',
          commandId: 'annotation:add-highlight',
          variant: 'icon',
          categories: ['annotation', 'annotation-markup', 'annotation-highlight'],
        },
        {
          type: 'command-button',
          id: 'add-strikeout',
          commandId: 'annotation:add-strikeout',
          variant: 'icon',
          categories: ['annotation', 'annotation-markup', 'annotation-strikeout'],
        },
        {
          type: 'command-button',
          id: 'add-underline',
          commandId: 'annotation:add-underline',
          variant: 'icon',
          categories: ['annotation', 'annotation-markup', 'annotation-underline'],
        },
        {
          type: 'command-button',
          id: 'add-squiggly',
          commandId: 'annotation:add-squiggly',
          variant: 'icon',
          categories: ['annotation', 'annotation-markup', 'annotation-squiggly'],
        },
        {
          type: 'command-button',
          id: 'add-link',
          commandId: 'annotation:add-link',
          variant: 'icon',
          categories: ['annotation', 'annotation-link'],
        },
        {
          type: 'command-button',
          id: 'redact-text',
          commandId: 'redaction:redact-text',
          variant: 'icon',
          categories: ['redaction', 'redaction-text'],
        },
      ],
    },
  },
};
