/**
 * The chrome — structure only. No breakpoints, no show/hide lists, no locale
 * overrides, no dividers/spacers, no hand-written overflow menus. What fits is
 * measured and solved at runtime (@embedpdf-x/ui-core); the overflow menu is
 * derived. Compare to the v2 snippet's 1,950-line ui-schema.ts.
 *
 * `importance` (1 sheds first … 5 pinned) is the only responsive knob.
 */
import {
  defineChrome,
  group,
  item,
  custom,
  type BarSchema,
  type MenuSchema,
} from '@embedpdf-x/react/toolbar';

// Reused across every mode band — plain values, so composition is just a const.
const style = group('style', { importance: 4 }, [item('panel:annotation-style')]);
const history = group('history', { importance: 3 }, ['history:undo', 'history:redo']);

// ── main toolbar ─────────────────────────────────────────────────────────────
const mainBar: BarSchema = {
  id: 'main',
  sections: {
    // v2 layout: everything before the first spacer sits LEFT-aligned —
    // document menu, workspace, zoom strip, pan/pointer. Only the mode tabs
    // are truly centered.
    start: [
      group('document', { importance: 5 }, [item('document:menu')]),
      group('workspace', { importance: 4 }, [
        item('panel:sidebar', { importance: 5 }),
        item('page:settings'),
      ]),
      // The inline zoom strip; when it can't fit it renders its 'button'
      // variant, and in the overflow menu it projects through zoom:menu.
      group('zoom', { importance: 4 }, [
        custom('zoom-controls', { variants: ['inline', 'button'], terminal: 'zoom:menu' }),
      ]),
      group('tools', { importance: 2 }, ['pan:toggle', 'pointer:toggle']),
    ],
    center: [
      group('modes', {
        role: 'tabs',
        // The group ladder: full strip → trailing tabs shed behind a derived
        // in-strip chevron (v2's overflow-tabs-button) → select (v2's
        // mode-select-button) → global overflow. Tab items at importance 1 so
        // the strip is the FIRST thing to compact; the group at 4 so its
        // compact forms survive long.
        shed: true,
        collapse: 'select',
        importance: 4,
        labelKey: 'commands.mode.group',
        items: [
          item('mode:view', { variants: ['label'], importance: 1 }),
          item('mode:annotate', { variants: ['label'], importance: 1 }),
          item('mode:shapes', { variants: ['label'], importance: 1 }),
          item('mode:insert', { variants: ['label'], importance: 1 }),
          item('mode:form', { variants: ['label'], importance: 1 }),
          item('mode:redact', { variants: ['label'], importance: 1 }),
        ],
      }),
    ],
    end: [group('panels', { importance: 5 }, ['panel:search', 'panel:comment'])],
  },
};

// ── secondary bands (one per mode; which shows is derived from shell) ────────
const annotateBar: BarSchema = {
  id: 'annotate',
  sections: {
    center: [
      group('comment', { importance: 4 }, ['annotation:add-note', 'annotation:add-link']),
      group('markup', { importance: 4 }, [
        'annotation:add-highlight',
        'annotation:add-strikeout',
        'annotation:add-underline',
        'annotation:add-squiggly',
      ]),
      group('draw', { importance: 3 }, ['annotation:add-ink', 'annotation:add-ink-highlight']),
      group('text', { importance: 2 }, [
        'annotation:add-text',
        'annotation:add-insert-text',
        'annotation:add-replace-text',
        'annotation:add-callout',
      ]),
      style,
      history,
    ],
  },
};

const shapesBar: BarSchema = {
  id: 'shapes',
  sections: {
    center: [
      group('shapes', { importance: 4 }, [
        'annotation:add-rectangle',
        'annotation:add-circle',
        'annotation:add-line',
        'annotation:add-arrow',
      ]),
      group('polygons', { importance: 2 }, ['annotation:add-polygon', 'annotation:add-polyline']),
      style,
      history,
    ],
  },
};

const insertBar: BarSchema = {
  id: 'insert',
  sections: {
    center: [
      group('stamps', { importance: 4 }, [
        'insert:add-stamp',
        'insert:add-attachment',
        'insert:add-signature',
        'insert:add-image',
      ]),
      style,
      history,
    ],
  },
};

const formBar: BarSchema = {
  id: 'form',
  sections: {
    center: [
      group('fields', { importance: 4 }, [
        'form:add-textfield',
        'form:add-checkbox',
        'form:add-radio',
      ]),
      group('choice-fields', { importance: 2 }, ['form:add-select', 'form:add-listbox']),
      history,
    ],
  },
};

const redactBar: BarSchema = {
  id: 'redact',
  sections: {
    center: [
      group('redact', { importance: 4 }, ['redaction:redact', 'panel:redaction']),
      style,
      history,
    ],
  },
};

// ── menus (command trees; separators derive between sections) ────────────────
const documentMenu: MenuSchema = {
  id: 'document',
  sections: [
    { items: ['document:download', 'document:print'] },
    { items: ['document:fullscreen'] },
  ],
};

const zoomMenu: MenuSchema = {
  id: 'zoom',
  sections: [
    {
      labelKey: 'commands.zoom.level',
      items: ['zoom:50', 'zoom:100', 'zoom:150', 'zoom:200', 'zoom:400'],
    },
    { items: ['zoom:in', 'zoom:out'] },
    { items: ['zoom:fit-page', 'zoom:fit-width', 'zoom:automatic'] },
  ],
};

const pageSettingsMenu: MenuSchema = {
  id: 'page-settings',
  sections: [
    { labelKey: 'commands.spread.group', items: ['spread:none', 'spread:odd', 'spread:even'] },
    { labelKey: 'commands.scroll.group', items: ['scroll:vertical', 'scroll:horizontal'] },
    { labelKey: 'commands.rotate.group', items: ['rotate:clockwise', 'rotate:counter-clockwise'] },
    { items: ['document:fullscreen'] },
  ],
};

// ── contextual strips (anchored to selections; same BarSchema vocabulary) ────
// WHICH commands actually show is each command's `visible` derivation (group
// only when groupable, style only when the kind declares editable props…), so
// one strip serves single AND multi selection — v2 needed two schemas for that.
const annotationStrip: BarSchema = {
  id: 'annotation-strip',
  sections: {
    center: [
      group('annotation-actions', { importance: 4 }, [
        'annotation:comment',
        'annotation:style',
        'annotation:link',
        'annotation:goto-link',
        'annotation:remove-link',
        'annotation:group',
        'annotation:ungroup',
      ]),
      // Its own group → a derived separator; delete stands apart.
      group('annotation-danger', { importance: 5 }, ['annotation:delete']),
    ],
  },
};

export const chrome = defineChrome({
  bars: { main: mainBar },
  modeBars: {
    'mode:annotate': annotateBar,
    'mode:shapes': shapesBar,
    'mode:insert': insertBar,
    'mode:form': formBar,
    'mode:redact': redactBar,
  },
  menus: { document: documentMenu, zoom: zoomMenu, 'page-settings': pageSettingsMenu },
  strips: { annotation: annotationStrip },
});

/** Menu lookup by id (arbitrary string) — the schema object is a typed literal,
 *  so this is where the string→schema widening happens, once. */
export function getMenu(id: string): MenuSchema | undefined {
  return (chrome.menus as Record<string, MenuSchema> | undefined)?.[id];
}

/** Secondary band lookup by mode-surface id. */
export function getModeBar(id: string): BarSchema | undefined {
  return (chrome.modeBars as Record<string, BarSchema> | undefined)?.[id];
}

/** Contextual strip lookup by context id ('annotation', …). */
export function getStrip(id: string): BarSchema | undefined {
  return (chrome.strips as Record<string, BarSchema> | undefined)?.[id];
}
